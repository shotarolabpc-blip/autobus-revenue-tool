"""都道府県コードを指定して、配信用データ（人口・バス停・バス路線・市区町村一覧）を作る。

使い方（プロジェクトのフォルダで）:
    .venv\\Scripts\\python data_build\\build_prefecture.py 13
    .venv\\Scripts\\python data_build\\build_prefecture.py 13 14 --no-download

元データは data_raw/ksj/ に置く（無ければ自動で取得する）。
"""

from __future__ import annotations

import argparse
import json
import time

import busdata
import population
from common import (
    DATA_RAW,
    PUBLIC_DATA,
    check_pref_code,
    dir_size,
    download,
    human_size,
    setup_console,
    vsizip,
    write_json_pretty,
)
from sources import ADMIN, ALL, BUSROUTES, BUSSTOPS, POPULATION, KsjSource

KSJ_DIR = DATA_RAW / "ksj"

KSJ_LICENSE = "CC BY 4.0"
KSJ_LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/deed.ja"


def source_path(src: KsjSource, pref: str, allow_download: bool) -> str:
    zip_path = KSJ_DIR / src.file_name(pref)
    if not zip_path.exists():
        if not allow_download:
            raise SystemExit(
                f"{zip_path} がありません。{src.page_url} から {src.file_name(pref)} を取得して置いてください"
            )
        download(src.url(pref), zip_path)
    return vsizip(zip_path, src.inner(pref))


def update_attributions() -> None:
    """国土数値情報の出典を attributions.json に登録する（無ければ追加、あれば更新）"""
    path = PUBLIC_DATA / "attributions.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    items = {a["id"]: a for a in data["items"]}
    for src in ALL:
        items[f"ksj-{src.key}"] = {
            "id": f"ksj-{src.key}",
            "name": f"国土数値情報（{src.title}）",
            "provider": "国土交通省",
            "url": src.page_url,
            "license": KSJ_LICENSE,
            "licenseUrl": KSJ_LICENSE_URL,
            "dataVersion": src.version,
            "modified": True,
            "note": "本ツール用に加工して作成",
        }
    data["items"] = list(items.values())
    write_json_pretty(path, data)


def update_prefecture(pref: str, view: list[float]) -> None:
    path = PUBLIC_DATA / "prefectures.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    for p in data["items"]:
        if p["code"] == pref:
            p["view"] = view
            p["dataAvailable"] = True
    write_json_pretty(path, data)


def build(pref: str, allow_download: bool) -> None:
    print(f"■ 都道府県 {pref}")
    t0 = time.time()
    paths = {s.key: source_path(s, pref, allow_download) for s in ALL}

    r = population.build(pref, paths["population"], PUBLIC_DATA / "population", POPULATION.version)
    print(
        f"  人口メッシュ: {r['meshes']:,} メッシュ → 集計単位 {r['units']:,}"
        f"（うち秘匿・合算をまとめたもの {r['merged']:,}）、{r['files']} ファイル {human_size(r['bytes'])}"
    )
    r = busdata.build_busstops(pref, paths["busstops"], PUBLIC_DATA / "busstops" / f"{pref}.geojson")
    print(f"  バス停: {r['features']:,} 件 {human_size(r['bytes'])}")
    r = busdata.build_busroutes(pref, paths["busroutes"], PUBLIC_DATA / "busroutes" / f"{pref}.geojson")
    print(f"  バス路線: {r['features']:,} 本 {human_size(r['bytes'])}")
    r = busdata.build_admin(pref, paths["admin"], PUBLIC_DATA / "municipalities" / f"{pref}.json")
    print(f"  市区町村: {r['municipalities']} 件、初期表示範囲 {r['view']}")
    update_prefecture(pref, r["view"])
    print(f"  所要時間 {time.time() - t0:.1f} 秒")


def report_sizes() -> None:
    print("■ 配信データの容量（public/data）")
    total = 0
    for sub in ("population", "busstops", "busroutes", "municipalities", "roads"):
        files, size = dir_size(PUBLIC_DATA / sub)
        if files:
            print(f"  {sub:15s} {files:6,} ファイル {human_size(size):>10s}")
            total += size
    print(f"  {'合計':13s} {human_size(total):>18s}")


def main() -> None:
    setup_console()
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("prefs", nargs="+", help="都道府県コード（01〜47）")
    ap.add_argument("--no-download", action="store_true", help="元データを自動で取得しない")
    args = ap.parse_args()
    for pref in args.prefs:
        build(check_pref_code(pref), allow_download=not args.no_download)
    update_attributions()
    report_sizes()


if __name__ == "__main__":
    main()
