import gzip
import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import roadgraph as rg  # noqa: E402

RULES = yaml.safe_load((Path(__file__).resolve().parent.parent / "road_rules.yaml").read_text(encoding="utf-8"))


def test_road_class_includes_bus_roads_and_excludes_others():
    assert rg.road_class({"highway": "primary"}, RULES) == "primary"
    assert rg.road_class({"highway": "residential"}, RULES) == "residential"
    assert rg.road_class({"highway": "footway"}, RULES) is None
    assert rg.road_class({"highway": "motorway"}, RULES) is None
    assert rg.road_class({"highway": "service"}, RULES) is None
    assert rg.road_class({"highway": "service", "bus": "yes"}, RULES) == "service"


def test_access_tags_later_keys_take_priority():
    assert rg.road_class({"highway": "residential", "access": "private"}, RULES) is None
    assert rg.road_class({"highway": "residential", "access": "no", "bus": "yes"}, RULES) == "residential"
    assert rg.road_class({"highway": "primary", "motor_vehicle": "no"}, RULES) is None
    assert rg.road_class({"highway": "primary", "motor_vehicle": "no", "psv": "designated"}, RULES) == "primary"
    assert rg.road_class({"highway": "primary", "bus": "no"}, RULES) is None


def test_oneway_direction():
    assert rg.direction({"oneway": "yes"}, RULES) == rg.FORWARD
    assert rg.direction({"oneway": "-1"}, RULES) == rg.BACKWARD
    assert rg.direction({}, RULES) == rg.BOTH
    assert rg.direction({"junction": "roundabout"}, RULES) == rg.FORWARD
    assert rg.direction({"oneway": "yes", "oneway:bus": "no"}, RULES) == rg.BOTH


def way(nodes, d=rg.BOTH, cls="residential"):
    return rg.Way(nodes, [(139.0 + n * 0.001, 35.0) for n in nodes], d, cls)


def test_split_at_junctions_and_contract_degree2_nodes():
    # 1-2-3-4 と 3-5 が 3 で交わる。2 は交差点ではないので 1-3 は1本になる
    ways = [way([1, 2, 3, 4]), way([3, 5])]
    segs, _ = rg.split_at_junctions(ways)
    assert sorted((s.u, s.v) for s in segs) == [(1, 3), (3, 4), (3, 5)]
    # 別々のウェイが端点でつながっているだけの点（6）はまとめる
    segs2 = rg.contract(rg.split_at_junctions([way([1, 6]), way([6, 7])])[0])
    assert [(s.u, s.v, len(s.coords)) for s in segs2] == [(1, 7, 3)]


def test_contract_respects_oneway_and_class():
    # 一方通行が逆向きのウェイ同士はまとめない
    segs = rg.contract(rg.split_at_junctions([way([1, 6], rg.FORWARD), way([7, 6], rg.FORWARD)])[0])
    assert len(segs) == 2
    # 同じ向きなら逆に描かれていてもまとめる
    segs = rg.contract(rg.split_at_junctions([way([1, 6], rg.FORWARD), way([7, 6], rg.BACKWARD)])[0])
    assert [(s.u, s.v, s.dir) for s in segs] == [(1, 7, rg.FORWARD)]
    # 道路種別が違えばまとめない
    segs = rg.contract(rg.split_at_junctions([way([1, 6]), way([6, 7], cls="primary")])[0])
    assert len(segs) == 2


def test_directed_edges_follow_oneway():
    segs = [rg.Segment(1, 2, [(139.0, 35.0), (139.001, 35.0)], rg.FORWARD, "residential")]
    edges = rg.directed_edges(segs)
    assert [(e.src, e.dst) for e in edges] == [(1, 2)]
    assert 90 < edges[0].length_m < 92  # 経度0.001度 ≒ 91m（北緯35度）


def test_drop_small_components():
    big = [rg.Segment(i, i + 1, [], rg.BOTH, "residential") for i in range(30)]
    small = [rg.Segment(100, 101, [], rg.BOTH, "residential")]
    kept = rg.drop_small_components(big + small, 20)
    assert len(kept) == 30


def test_tiles_are_gzip_with_magic_header():
    vertices = {1: (139.001, 35.001), 2: (139.06, 35.001)}  # 2つのタイルにまたがる
    edges = rg.directed_edges([rg.Segment(1, 2, [vertices[1], (139.03, 35.002), vertices[2]], rg.BOTH, "primary")])
    g = rg.build_tiles(edges, vertices, 0.05, (120.0, 20.0), ["primary"])
    assert len(g.tiles) == 2
    for data in g.tiles.values():
        raw = gzip.decompress(data)
        assert raw[:4] == b"RTL1"


def test_svarint_zigzag():
    buf = bytearray()
    for n in (0, -1, 1, -2, 2, -64, 63, -1_000_000):
        rg._svarint(buf, n)
    assert list(buf[:5]) == [0, 1, 2, 3, 4]
