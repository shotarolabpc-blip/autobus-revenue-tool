"""道路網（有向グラフ）の組み立てと、経路計算用タイルへの書き出し。要件 F-2-5c・F-2-5f。

ここには OSM の読込に依存しない純粋な処理を置く（テストしやすくするため）。
タイルの形式は src/routing/tileFormat.ts の読込処理と対応している。変えるときは両方を直す。
"""

from __future__ import annotations

import gzip
import math
from collections import defaultdict
from dataclasses import dataclass, field

FORWARD = 1
BACKWARD = 2
BOTH = FORWARD | BACKWARD

TRUE_VALUES = {"yes", "true", "1"}
ALLOW_VALUES = {"yes", "designated", "permissive", "destination"}
DENY_VALUES = {"no", "private"}


# ---------------------------------------------------------------- 採否・方向


def road_class(tags: dict[str, str], rules: dict) -> str | None:
    """採用する道路なら道路種別（highway の値）、採用しないなら None"""
    hw = tags.get("highway")
    if not hw:
        return None
    if tags.get("area") == "yes":
        return None
    bus_ok = any(tags.get(k) in {"yes", "designated"} for k in ("bus", "psv"))
    allowed = set(rules["include_highway"])
    if rules.get("include_motorway"):
        allowed |= {"motorway", "motorway_link"}
    if hw == "service":
        if not (rules.get("service_requires_bus_tag", True) and bus_ok):
            return None
    elif hw not in allowed:
        return None
    if not access_allowed(tags, rules["access_tags"]):
        return None
    return hw


def access_allowed(tags: dict[str, str], keys: list[str]) -> bool:
    """access → motor_vehicle → psv → bus の順に見て、最後に指定があったものを採る"""
    ok = True
    for k in keys:
        v = tags.get(k)
        if v in DENY_VALUES:
            ok = False
        elif v in ALLOW_VALUES:
            ok = True
    return ok


def direction(tags: dict[str, str], rules: dict) -> int:
    """通行できる方向（FORWARD＝ウェイの描画方向、BACKWARD＝逆、BOTH＝双方向）"""
    for k in rules.get("oneway_bus_exception_tags", []):
        if tags.get(k) == "no":
            return BOTH
    ow = tags.get("oneway")
    if ow in TRUE_VALUES:
        return FORWARD
    if ow == "-1":
        return BACKWARD
    if ow == "no":
        return BOTH
    if tags.get("junction") in {"roundabout", "circular"}:
        return FORWARD
    if tags.get("highway") in {"motorway", "motorway_link"}:
        return FORWARD
    return BOTH


# ---------------------------------------------------------------- 距離


def haversine_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    r = 6371008.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def line_length_m(coords: list[tuple[float, float]]) -> float:
    return sum(haversine_m(*coords[i], *coords[i + 1]) for i in range(len(coords) - 1))


# ---------------------------------------------------------------- グラフ


@dataclass
class Way:
    nodes: list[int]
    coords: list[tuple[float, float]]
    dir: int
    cls: str


@dataclass
class Segment:
    """交差点（または端点）の間の道路。u→v が描画方向"""

    u: int
    v: int
    coords: list[tuple[float, float]]
    dir: int
    cls: str
    alive: bool = field(default=True)


def split_at_junctions(ways: list[Way]) -> tuple[list[Segment], dict[int, tuple[float, float]]]:
    """ウェイを交差点（2本以上のウェイが使うノード）と端点で区切る"""
    use = defaultdict(int)
    for w in ways:
        for n in w.nodes:
            use[n] += 1
    vertices: dict[int, tuple[float, float]] = {}
    segs: list[Segment] = []
    for w in ways:
        start = 0
        for i in range(1, len(w.nodes)):
            if i == len(w.nodes) - 1 or use[w.nodes[i]] >= 2:
                if w.nodes[start] != w.nodes[i] or i - start >= 2:
                    segs.append(Segment(w.nodes[start], w.nodes[i], w.coords[start : i + 1], w.dir, w.cls))
                    vertices[w.nodes[start]] = w.coords[start]
                    vertices[w.nodes[i]] = w.coords[i]
                start = i
    return segs, vertices


def _flip(d: int) -> int:
    return ((d & FORWARD) << 1) | ((d & BACKWARD) >> 1)


def contract(segs: list[Segment]) -> list[Segment]:
    """2本の道路だけがつながる点（交差点でない点）を取り除き、交差点間を1本にまとめる"""
    incident: dict[int, list[int]] = defaultdict(list)
    for i, s in enumerate(segs):
        incident[s.u].append(i)
        incident[s.v].append(i)
    for n in list(incident):
        live = [i for i in incident[n] if segs[i].alive]
        if len(live) != 2 or live[0] == live[1]:
            continue
        a, b = segs[live[0]], segs[live[1]]
        if a.u == a.v or b.u == b.v or a.cls != b.cls:
            continue
        # a を「…→n」、b を「n→…」の向きにそろえる
        a_coords, a_dir, a_start = (a.coords, a.dir, a.u) if a.v == n else (a.coords[::-1], _flip(a.dir), a.v)
        b_coords, b_dir, b_end = (b.coords, b.dir, b.v) if b.u == n else (b.coords[::-1], _flip(b.dir), b.u)
        if a_dir != b_dir or a_start == b_end:
            continue
        merged = Segment(a_start, b_end, a_coords + b_coords[1:], a_dir, a.cls)
        a.alive = b.alive = False
        segs.append(merged)
        k = len(segs) - 1
        for end in (a_start, b_end):
            incident[end] = [i for i in incident[end] if i not in (live[0], live[1])] + [k]
        incident[n] = []
    return [s for s in segs if s.alive]


def drop_small_components(segs: list[Segment], min_edges: int) -> list[Segment]:
    """つながっていない小さな道路のかたまり（敷地内の孤立した道など）を除く"""
    parent: dict[int, int] = {}

    def find(x: int) -> int:
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for s in segs:
        ru, rv = find(s.u), find(s.v)
        if ru != rv:
            parent[ru] = rv
    size: dict[int, int] = defaultdict(int)
    for s in segs:
        size[find(s.u)] += 1
    return [s for s in segs if size[find(s.u)] >= min_edges]


@dataclass
class Edge:
    src: int
    dst: int
    coords: list[tuple[float, float]]
    length_m: float
    cls: str


def directed_edges(segs: list[Segment]) -> list[Edge]:
    out = []
    for s in segs:
        length = line_length_m(s.coords)
        if s.dir & FORWARD:
            out.append(Edge(s.u, s.v, s.coords, length, s.cls))
        if s.dir & BACKWARD:
            out.append(Edge(s.v, s.u, s.coords[::-1], length, s.cls))
    return out


# ---------------------------------------------------------------- タイル（バイナリ）

MAGIC = b"RTL1"
COORD_SCALE = 1_000_000  # 1e-6度（約0.1m）


def tile_of(lon: float, lat: float, size: float, origin: tuple[float, float]) -> tuple[int, int]:
    return math.floor((lon - origin[0]) / size), math.floor((lat - origin[1]) / size)


def _uvarint(buf: bytearray, n: int) -> None:
    if n < 0:
        raise ValueError(n)
    while n >= 0x80:
        buf.append((n & 0x7F) | 0x80)
        n >>= 7
    buf.append(n)


def _svarint(buf: bytearray, n: int) -> None:
    # ジグザグ符号化（0,-1,1,-2,2… → 0,1,2,3,4…）
    _uvarint(buf, n << 1 if n >= 0 else ((-n) << 1) - 1)


def _q(v: float) -> int:
    return round(v * COORD_SCALE)


@dataclass
class TiledGraph:
    tiles: dict[tuple[int, int], bytes]
    node_count: int
    edge_count: int
    classes: list[str]


def build_tiles(
    edges: list[Edge],
    vertices: dict[int, tuple[float, float]],
    size: float,
    origin: tuple[float, float],
    classes: list[str],
) -> TiledGraph:
    """
    タイルの中身（すべて可変長整数。符号付きはジグザグ符号化）:
      "RTL1", 版=1, tx, ty, ノード数
      ノード: 経度・緯度（1e-6度、直前のノードとの差。最初はタイル原点との差）
      各ノードの出ていく辺: 本数, [行き先タイルの差 dtx, dty, 行き先ノード番号, 長さ(0.1m), 種別,
                               途中の点の数, 途中の点（直前の点との差）…]
    経路は出発点から片方向に探索する（A*）ので、入ってくる辺は持たない。
    """
    used = {e.src for e in edges} | {e.dst for e in edges}
    by_tile: dict[tuple[int, int], list[int]] = defaultdict(list)
    for n in used:
        by_tile[tile_of(*vertices[n], size, origin)].append(n)
    local: dict[int, tuple[tuple[int, int], int]] = {}
    for t, nodes in by_tile.items():
        nodes.sort(key=lambda n: (vertices[n][1], vertices[n][0]))
        for i, n in enumerate(nodes):
            local[n] = (t, i)
    cls_code = {c: i for i, c in enumerate(classes)}
    out_edges: dict[int, list[Edge]] = defaultdict(list)
    for e in edges:
        out_edges[e.src].append(e)

    tiles: dict[tuple[int, int], bytes] = {}
    for t, nodes in by_tile.items():
        buf = bytearray(MAGIC)
        _uvarint(buf, 1)
        _svarint(buf, t[0])
        _svarint(buf, t[1])
        _uvarint(buf, len(nodes))
        px, py = _q(origin[0] + t[0] * size), _q(origin[1] + t[1] * size)
        for n in nodes:
            x, y = _q(vertices[n][0]), _q(vertices[n][1])
            _svarint(buf, x - px)
            _svarint(buf, y - py)
            px, py = x, y
        for n in nodes:
            lst = out_edges.get(n, [])
            _uvarint(buf, len(lst))
            for e in lst:
                (dt, di) = local[e.dst]
                _svarint(buf, dt[0] - t[0])
                _svarint(buf, dt[1] - t[1])
                _uvarint(buf, di)
                _uvarint(buf, round(e.length_m * 10))
                _uvarint(buf, cls_code[e.cls])
                mid = e.coords[1:-1]
                _uvarint(buf, len(mid))
                qx, qy = _q(e.coords[0][0]), _q(e.coords[0][1])
                for lon, lat in mid:
                    x, y = _q(lon), _q(lat)
                    _svarint(buf, x - qx)
                    _svarint(buf, y - qy)
                    qx, qy = x, y
        tiles[t] = gzip.compress(bytes(buf), compresslevel=9, mtime=0)
    return TiledGraph(tiles, len(used), len(edges), classes)
