"""15-64歳の係数の作り方（Q3）：B′（市区町村の人口で重み付け）の差は、市区町村の規模でどう変わるか。

500mメッシュ1つを「小さい勢圏」とみなし、そのメッシュの5歳刻み人口で重みを決める方法（B）と、
メッシュがある市区町村全体の人口で重みを決める方法（B′）の差を、全メッシュで計算する。
メッシュ1つは半径300mの勢圏（約0.28km²）とほぼ同じ広さなので、実際の勢圏（複数のメッシュにまたがる）より
差が大きく出やすい（上限に近い見積り）。

使い方:
    .venv\Scripts\python data_build\age_weights_by_size.py 13 27 23 01 20 40 47
"""

from __future__ import annotations

import sys

import numpy as np
import pyogrio

from age_weights_accuracy import OTHER, SUB, SUB_PT, coefficient_products
from common import DATA_RAW, check_pref_code, download, setup_console, vsizip
from sources import POPULATION

YEAR = 2025
# 市区町村の人口規模の区分（2025年の推計人口）
BINS = [(0, 20_000, "2万人未満"), (20_000, 100_000, "2〜10万人"), (100_000, 300_000, "10〜30万人"), (300_000, 10**9, "30万人以上")]


def main() -> None:
    setup_console()
    prefs = [check_pref_code(p) for p in sys.argv[1:]] or ["13"]
    prod = coefficient_products()
    cols = ["MESH_ID", "SHICODE"] + [f"PT{c:02d}_{YEAR}" for c in range(1, 21)]
    frames = []
    for pref in prefs:
        zip_path = DATA_RAW / "ksj" / POPULATION.file_name(pref)
        download(POPULATION.url(pref), zip_path)
        df = pyogrio.read_dataframe(vsizip(zip_path, POPULATION.inner(pref)), columns=cols, read_geometry=False)
        df["pref"] = pref
        frames.append(df)
        print(f"{pref}: {len(df):,} メッシュ", flush=True)
    import pandas as pd

    df = pd.concat(frames, ignore_index=True)
    pt = {c: df[f"PT{c:02d}_{YEAR}"].astype(float).fillna(0).values for c in range(1, 21)}
    total = sum(pt[c] for c in range(1, 21))
    muni = df["SHICODE"].values
    # 市区町村ごとの人口と、5歳階級ごとの人口
    muni_total = pd.Series(total).groupby(muni).sum()
    muni_pt = {c: pd.Series(pt[c]).groupby(muni).sum() for c in range(1, 21)}
    print(f"市区町村 {len(muni_total):,} 件\n")

    for city_type, label in ((1, "三大都市圏／中心都市の係数"), (100, "全国計の係数")):
        for day in ("weekday", "holiday"):
            v = np.array([prod[(city_type, day, s)] for s in SUB])
            other_c = {k: prod[(city_type, day, key)] for k, (key, _) in OTHER.items()}
            g_mesh = np.array([sum(pt[c] for c in SUB_PT[s]) for s in SUB])  # 3 × メッシュ数
            g_muni = np.array([sum(muni_pt[c] for c in SUB_PT[s]) for s in SUB])  # 3 × 市区町村
            pop1564 = g_mesh.sum(axis=0)
            ok = pop1564 >= 30  # 人口が少なすぎるメッシュは、割合が不安定なので除く
            idx = pd.Index(muni_total.index).get_indexer(muni)
            w_b = g_mesh / np.where(pop1564 > 0, pop1564, 1)
            gm = g_muni[:, idx]
            w_bp = gm / np.where(gm.sum(axis=0) > 0, gm.sum(axis=0), 1)
            vB = (w_b * v[:, None]).sum(axis=0)
            vBp = (w_bp * v[:, None]).sum(axis=0)
            others = sum(sum(pt[c] for c in pts) * other_c[k] for k, (_, pts) in OTHER.items())
            RB = others + pop1564 * vB
            RBp = others + pop1564 * vBp
            with np.errstate(divide="ignore", invalid="ignore"):
                dv = np.abs(vBp / vB - 1) * 100
                dr = np.abs(RBp / RB - 1) * 100
            size = muni_total.values[idx]
            print(f"■ {label}・{ 'weekday' if day == 'weekday' else 'holiday'}（{YEAR}年、15-64歳が30人以上のメッシュ）")
            print(f"{'市区町村の人口':<12}{'メッシュ数':>9}{'値の差 平均':>11}{'延べ乗車 平均':>13}{'中央値':>8}{'1%超の割合':>11}{'(人口加重)':>11}")
            for lo, hi, name in BINS + [(0, 10**9, "全体")]:
                sel = ok & (size >= lo) & (size < hi) & np.isfinite(dr)
                if sel.sum() == 0:
                    continue
                w = pop1564[sel]
                print(
                    f"{name:<12}{int(sel.sum()):>9}{dv[sel].mean():>10.2f}%{dr[sel].mean():>12.2f}%{np.median(dr[sel]):>7.2f}%"
                    f"{(dr[sel] > 1).mean() * 100:>10.0f}%{np.average(dr[sel] > 1, weights=w) * 100:>10.0f}%"
                )
            print()


if __name__ == "__main__":
    main()
