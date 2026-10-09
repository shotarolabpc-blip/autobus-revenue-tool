"""OpenStreetMap から、ブラウザ内の経路計算に使う道路網タイルを作る。要件 F-2-5c・F-2-5f、P0-5。

使い方（プロジェクトのフォルダで）:
    .venv\\Scripts\\python data_build\\build_roads.py 13

1. Geofabrik の地域ファイル（.osm.pbf）を data_raw/osm/ に取得する（無ければ）
2. 都道府県の境界（国土数値情報 行政区域）に余白を付けた範囲の道路を取り出す
3. road_rules.yaml に従い、バスが通れる道路だけを残す（一方通行を反映）
4. 交差点間を1本の辺にまとめた有向グラフを作り、格子状のタイルに分けて public/data/roads/{県コード}/ に出力する

※ pyosmium は全角文字を含む絶対パスを開けないため、data_raw/osm に移動して相対パスで読む。
"""

from __future__ import annotations

import argparse
import json
import math
import os
from array import array
import time
from contextlib import contextmanager
from pathlib import Path

import numpy as np
import osmium
import pyogrio
import shapely
import yaml
from shapely import affinity
from shapely.geometry import LineString
from shapely.prepared import prep

import roadgraph as rg
from common import DATA_RAW, PUBLIC_DATA, check_pref_code, dir_size, download, human_size, setup_console, vsizip
from sources import ADMIN

HERE = Path(__file__).resolve().parent
OSM_DIR = DATA_RAW / "osm"
ORIGIN = (120.0, 20.0)  # タイル番号の原点（経度・緯度）
MIN_COMPONENT_EDGES = 20


@contextmanager
def chdir(path: Path):
    old = os.getcwd()
    os.chdir(path)
    try:
        yield
    finally:
        os.chdir(old)


def load_yaml(name: str) -> dict:
    return yaml.safe_load((HERE / name).read_text(encoding="utf-8"))


def boundary(pref: str, margin_km: float, allow_download: bool):
    """都道府県の境界に余白を付けた範囲（緯度経度）。
    島ごとに、緯度に応じて経度方向を伸縮した平面で余白を付ける（細かい海岸線で計算が重くならないよう、先に約50mで単純化する）。
    """
    zip_path = DATA_RAW / "ksj" / ADMIN.file_name(pref)
    if not zip_path.exists():
        if not allow_download:
            raise SystemExit(f"{zip_path} がありません（build_prefecture.py を先に実行してください）")
        download(ADMIN.url(pref), zip_path)
    df = pyogrio.read_dataframe(vsizip(zip_path, ADMIN.inner(pref)))
    parts = shapely.get_parts(shapely.make_valid(df.geometry.values))
    parts = [p for p in parts if p.geom_type in ("Polygon", "MultiPolygon")]
    merged = shapely.union_all(shapely.simplify(parts, 0.0005))
    buffered = []
    for part in shapely.get_parts(merged):
        lat0 = part.centroid.y
        k = math.cos(math.radians(lat0))
        flat = affinity.scale(part, xfact=k, yfact=1, origin=(0, 0))
        grown = flat.buffer(margin_km / 111.0, quad_segs=4)
        buffered.append(affinity.scale(grown, xfact=1 / k, yfact=1, origin=(0, 0)))
    return shapely.union_all(buffered)


def read_ways(pbf_names: list[str], area, rules: dict) -> tuple[list[rg.Way], str]:
    """2段階で読む（関東全域の点の座標をすべてメモリに持たないため）。
    1. 道路（ウェイ）をタグで絞り込み、使う点の番号を集める
    2. その点だけ座標を読み、範囲（余白付き）の中の点だけ残す
    範囲の外に出る道路は、範囲の中の部分だけを使う。
    """
    pad = 0.02  # 範囲の外側に少し余裕をもって座標を持つ（約2km）
    boxes = np.array([p.bounds for p in shapely.get_parts(area)])
    inside = prep(area)
    stamps = []
    candidates: dict[int, tuple[list[int], int, str]] = {}
    with chdir(OSM_DIR):
        for name in pbf_names:
            header = osmium.io.Reader(name, osmium.osm.osm_entity_bits.NOTHING).header()
            stamps.append(header.get("osmosis_replication_timestamp", ""))
            fp = osmium.FileProcessor(name, osmium.osm.WAY).with_filter(osmium.filter.KeyFilter("highway"))
            for w in fp:
                if w.id in candidates:
                    continue
                tags = dict(w.tags)
                cls = rg.road_class(tags, rules)
                if cls is not None:
                    candidates[w.id] = ([n.ref for n in w.nodes], rg.direction(tags, rules), cls)
        print(f"  採用候補の道路（地域ファイル全体）: {len(candidates):,} 本", flush=True)
        ids = np.unique(np.fromiter((r for refs, _, _ in candidates.values() for r in refs), dtype=np.int64))
        nid, nlon, nlat = array("q"), array("d"), array("d")
        for name in pbf_names:
            fp = osmium.FileProcessor(name, osmium.osm.NODE).with_filter(osmium.filter.IdFilter(ids.tolist()))
            for n in fp:
                nid.append(n.id)
                nlon.append(n.location.lon)
                nlat.append(n.location.lat)
        del ids
    lon = np.frombuffer(nlon, dtype=np.float64)
    lat = np.frombuffer(nlat, dtype=np.float64)
    keep = np.zeros(len(lon), dtype=bool)
    for x0, y0, x1, y1 in boxes:  # 島ごとの範囲（＋余裕）に入る点だけ残す
        keep |= (lon >= x0 - pad) & (lon <= x1 + pad) & (lat >= y0 - pad) & (lat <= y1 + pad)
    idx = np.nonzero(keep)[0]
    ids_kept = np.frombuffer(nid, dtype=np.int64)[idx]
    coords: dict[int, tuple[float, float]] = dict(
        zip(ids_kept.tolist(), zip(lon[idx].tolist(), lat[idx].tolist()))
    )
    print(f"  範囲内の点: {len(coords):,} / {len(lon):,}", flush=True)
    ways: list[rg.Way] = []
    for refs, d, cls in candidates.values():
        # 座標のある点が続く部分ごとに分ける
        run: list[int] = []
        for r in refs + [None]:  # type: ignore[list-item]
            if r is not None and r in coords:
                run.append(r)
                continue
            if len(run) >= 2:
                pts = [coords[x] for x in run]
                if inside.intersects(LineString(pts)):
                    ways.append(rg.Way(run, pts, d, cls))
            run = []
    return ways, max(stamps)


def build(pref: str, allow_download: bool) -> None:
    rules = load_yaml("road_rules.yaml")
    regions = load_yaml("osm_regions.yaml")
    names = []
    for region in regions["prefectures"][pref]:
        name = f"{region}-latest.osm.pbf"
        if not (OSM_DIR / name).exists():
            if not allow_download:
                raise SystemExit(f"{OSM_DIR / name} がありません")
            download(regions["url_template"].format(region=region), OSM_DIR / name)
        names.append(name)

    print(f"■ 道路網 {pref}（{', '.join(names)}）")
    t0 = time.time()
    area = boundary(pref, rules["boundary_margin_km"], allow_download)
    ways, stamp = read_ways(names, area, rules)
    print(f"  採用した道路（ウェイ）: {len(ways):,} 本  OSMデータ時点: {stamp}  {time.time() - t0:.0f}秒")

    segs, vertices = rg.split_at_junctions(ways)
    n_split = len(segs)
    segs = rg.contract(segs)
    segs = rg.drop_small_components(segs, MIN_COMPONENT_EDGES)
    edges = rg.directed_edges(segs)
    print(f"  交差点間の道路: {n_split:,} → まとめた後 {len(segs):,} 本、有向辺 {len(edges):,} 本")

    classes = list(dict.fromkeys(rules["include_highway"] + ["service", "motorway", "motorway_link"]))
    size = float(rules["tile_size_deg"])
    graph = rg.build_tiles(edges, vertices, size, ORIGIN, classes)

    out = PUBLIC_DATA / "roads" / pref
    if out.exists():
        for old in out.glob("*"):
            old.unlink()
    out.mkdir(parents=True, exist_ok=True)
    largest = 0
    for (tx, ty), data in graph.tiles.items():
        (out / f"{tx}_{ty}.bin.gz").write_bytes(data)
        largest = max(largest, len(data))
    factors = rules.get("cost_factor") or {}
    index = {
        "prefCode": pref,
        "format": "RTL1",
        "source": f"OpenStreetMap（Geofabrik {', '.join(regions['prefectures'][pref])}）",
        "osmTimestamp": stamp,
        "tileSizeDeg": size,
        "origin": list(ORIGIN),
        "classes": classes,
        "costFactor": [float(factors.get(c, 1.0)) for c in classes],
        "tiles": sorted([tx, ty] for tx, ty in graph.tiles),
        "nodeCount": graph.node_count,
        "edgeCount": graph.edge_count,
        "boundaryMarginKm": rules["boundary_margin_km"],
    }
    (out / "index.json").write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    files, total = dir_size(out)
    print(
        f"  タイル: {len(graph.tiles):,} 個、ノード {graph.node_count:,}、合計 {human_size(total)}"
        f"（最大のタイル {human_size(largest)}）  {time.time() - t0:.0f}秒"
    )
    update_attribution(stamp)


def update_attribution(stamp: str) -> None:
    path = PUBLIC_DATA / "attributions.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    items = {a["id"]: a for a in data["items"]}
    items["osm"] = {
        "id": "osm",
        "name": "© OpenStreetMap contributors",
        "provider": "OpenStreetMap",
        "url": "https://www.openstreetmap.org/copyright",
        "license": "ODbL 1.0",
        "licenseUrl": "https://opendatacommons.org/licenses/odbl/1-0/",
        "dataVersion": stamp[:10] if stamp else None,
        "modified": True,
        "note": "道路網（経路計算用）。加工した道路網データは ODbL に従い、このサイトの public/data/roads/ で公開",
    }
    data["items"] = list(items.values())
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")


def main() -> None:
    setup_console()
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("prefs", nargs="+", help="都道府県コード（01〜47）")
    ap.add_argument("--no-download", action="store_true")
    args = ap.parse_args()
    for pref in args.prefs:
        build(check_pref_code(pref), allow_download=not args.no_download)
    files, total = dir_size(PUBLIC_DATA / "roads")
    print(f"■ 道路網の合計: {files:,} ファイル {human_size(total)}")


if __name__ == "__main__":
    main()
