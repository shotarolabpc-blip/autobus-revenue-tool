"""全国47都道府県分の配信データ容量を見積もる（P0-7）。結果は docs/capacity.md の根拠になる。

考え方：
  - 生成済みの都道府県（東京都）について「元データの大きさ」と「生成したデータの大きさ」の比を求め、
    ほかの都道府県は、元データの大きさ（ダウンロードせずにファイルサイズだけ取得）に同じ比を掛けて見積もる。
  - 国土数値情報（人口・バス停・バス路線）：都道府県ごとの zip の大きさに比例すると仮定。
  - 道路網：Geofabrik の地域ファイル（.osm.pbf）の大きさに比例すると仮定。
    東京都の道路網は、関東の地域ファイルのうち東京都（＋余白5km）に当たる分なので、
    「関東全体の採用候補の道路の本数」に対する「東京都で採用した本数」の比で関東全体に広げ、
    さらに地域ファイルの大きさの比で全国に広げる。県境の余白で重なる分は東京都の実測から割増す。

使い方:
    .venv\\Scripts\\python data_build\\estimate_capacity.py
"""

from __future__ import annotations

import json
import time
import urllib.request

import yaml

from common import PUBLIC_DATA, dir_size, setup_console
from sources import BUSROUTES, BUSSTOPS, POPULATION
from build_roads import HERE

PREFS = [f"{i:02d}" for i in range(1, 48)]


def head_size(url: str) -> int:
    """ファイルを取得せず、大きさ（Content-Length）だけを調べる。失敗したら数回やり直す"""
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "autobus-revenue-tool data_build"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                return int(res.headers.get("Content-Length", 0))
        except (TimeoutError, OSError):
            if attempt == 3:
                raise
            time.sleep(5 * (attempt + 1))
    return 0


def main() -> None:
    setup_console()
    base = "13"
    out: dict = {"base": base, "ksj": {}, "roads": {}}

    # 国土数値情報
    gen = {
        "population": dir_size(PUBLIC_DATA / "population" / base)[1],
        "busstops": (PUBLIC_DATA / "busstops" / f"{base}.geojson").stat().st_size,
        "busroutes": (PUBLIC_DATA / "busroutes" / f"{base}.geojson").stat().st_size,
    }
    for src in (POPULATION, BUSSTOPS, BUSROUTES):
        sizes = {p: head_size(src.url(p)) for p in PREFS}
        ratio = gen[src.key] / sizes[base]
        est = {p: round(s * ratio) for p, s in sizes.items()}
        out["ksj"][src.key] = {
            "sourceBytes": sizes,
            "generatedBaseBytes": gen[src.key],
            "ratio": ratio,
            "estimatedBytes": est,
            "maxPref": max(est, key=est.get),
        }
        print(f"{src.key}: 東京都 元 {sizes[base]:,} → 生成 {gen[src.key]:,}（比 {ratio:.3f}）、全国見積 {sum(est.values()) / 1e6:.1f} MB")

    # 道路網
    regions = yaml.safe_load((HERE / "osm_regions.yaml").read_text(encoding="utf-8"))
    names = sorted({r for v in regions["prefectures"].values() for r in v})
    pbf = {r: head_size(regions["url_template"].format(region=r)) for r in names}
    roads_base = dir_size(PUBLIC_DATA / "roads" / base)[1]
    out["roads"] = {"pbfBytes": pbf, "generatedBaseBytes": roads_base}
    print("地域ファイル:", {k: f"{v / 1e6:.0f}MB" for k, v in pbf.items()})
    (PUBLIC_DATA.parent.parent / "data_build" / "_capacity_inputs.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8"
    )


if __name__ == "__main__":
    main()
