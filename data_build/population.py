"""人口メッシュ（500mメッシュ別将来推計人口 R6国政局推計）の加工。要件 5.2。

- 男女計・5歳階級（PT01〜PT20）を、全国都市交通特性調査の年齢区分に合わせた7区分
  「0-4／5-14／15-29／30-49／50-64／65-74／75+」に集約する（Q3：B、2026-10-15 決定）。
  調査の区分（5〜14・15〜29・30〜49・50〜64・65〜74・75歳以上）をそのまま使うので、区分ごとの係数を平均する必要がなく、
  0〜4歳（調査の対象外）の扱い（Q2）も、人口データを作り直さずに、係数の側で決められる。
  要件定義書の4階層（0-14／15-64／65-74／75+）は、画面の表示用にこの7区分から合算する。
- 秘匿メッシュ（HITOKU="*"）の人口は合算先メッシュ（"@"、GASSAN に記載）に含まれている。
  秘匿・合算先メッシュは、どの年次でも合算関係にあるメッシュをまとめて1つの「集計単位」にする。
  集計単位の人口＝構成メッシュの人口の合計（秘匿メッシュは0なので二重計上にならない）。
  ブラウザ側は、集計単位の人口が構成メッシュ全体に一様に分布するとみなして面積按分する。
- 出力は2次メッシュ（約10km四方）ごとのファイルに分け、表示範囲のファイルだけ読めるようにする。
  メッシュの形はメッシュコードから計算できるので、座標は出力しない（容量削減）。

元データの項目は「国土数値情報 500mメッシュ別将来推計人口 製品仕様書（KS-PS-r6_fpop_500）」と
コードリスト（r6_future_population_codelist）による。
"""

from __future__ import annotations

from collections import defaultdict
from pathlib import Path

import pyogrio

from common import dir_size, write_json

YEARS = list(range(2025, 2071, 5))

# 5歳階級コード（PT01=0〜4歳 … PT20=95歳以上）→ 7区分（調査の年齢区分に合わせる）
AGE_GROUPS: dict[str, list[int]] = {
    "0-4": [1],
    "5-14": [2, 3],
    "15-29": [4, 5, 6],
    "30-49": [7, 8, 9, 10],
    "50-64": [11, 12, 13],
    "65-74": [14, 15],
    "75+": list(range(16, 21)),
}
# 人口は小数第1桁まで持つ（容量を小さくするため。1メッシュの1区分あたり最大0.05人の丸め）
POP_DIGITS = 1

HIDDEN = "*"  # 秘匿メッシュ
MERGED_INTO = "@"  # 合算先メッシュ


class UnionFind:
    def __init__(self) -> None:
        self.parent: dict[str, str] = {}

    def find(self, x: str) -> str:
        self.parent.setdefault(x, x)
        root = x
        while self.parent[root] != root:
            root = self.parent[root]
        while self.parent[x] != root:  # 経路圧縮
            self.parent[x], x = root, self.parent[x]
        return root

    def union(self, a: str, b: str) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            # 代表は小さいコードにする（出力を毎回同じにするため）
            lo, hi = sorted((ra, rb))
            self.parent[hi] = lo


def group_meshes(records: list[dict]) -> dict[str, list[str]]:
    """秘匿・合算の関係にあるメッシュをまとめる。{代表メッシュ: [構成メッシュ…]}"""
    uf = UnionFind()
    for r in records:
        uf.find(r["MESH_ID"])
        for y in YEARS:
            if r.get(f"HITOKU{y}") == HIDDEN and r.get(f"GASSAN{y}"):
                uf.union(r["MESH_ID"], str(r[f"GASSAN{y}"]))
    groups: dict[str, list[str]] = defaultdict(list)
    for r in records:
        groups[uf.find(r["MESH_ID"])].append(r["MESH_ID"])
    return {k: sorted(v) for k, v in groups.items()}


def age_population(r: dict, year: int) -> list[float]:
    """1メッシュ・1年次の7区分別人口"""
    out = []
    for codes in AGE_GROUPS.values():
        out.append(sum(float(r.get(f"PT{c:02d}_{year}") or 0) for c in codes))
    return out


def build_units(records: list[dict]) -> tuple[list[dict], list[str]]:
    """集計単位（id・構成メッシュ・年次×7区分の人口）を作る。警告の一覧も返す"""
    by_id = {r["MESH_ID"]: r for r in records}
    warnings: list[str] = []
    units = []
    for rep, members in sorted(group_meshes(records).items()):
        missing = [m for m in members if m not in by_id]
        if missing:
            warnings.append(f"合算先メッシュがこの県のデータにありません: {missing}")
        pop = []
        for y in YEARS:
            total = [0.0] * len(AGE_GROUPS)
            for m in members:
                if m in by_id:
                    total = [a + b for a, b in zip(total, age_population(by_id[m], y))]
            pop.append([round(v, POP_DIGITS) for v in total])
        units.append({"id": rep, "meshes": members, "pop": pop})
    # 検算：7区分の合計が総数（PT00）と一致するか
    for r in records:
        for y in YEARS:
            pt00 = float(r.get(f"PT00_{y}") or 0)
            if abs(sum(age_population(r, y)) - pt00) > 0.01:
                warnings.append(f"{r['MESH_ID']} {y}年：年齢階層の合計が総数と一致しません")
                break
    return units, warnings


def tile_key(mesh: str) -> str:
    """2次メッシュコード（先頭6桁）"""
    return mesh[:6]


def split_tiles(units: list[dict]) -> dict[str, list[dict]]:
    """構成メッシュがかかる2次メッシュすべてに集計単位を入れる（ブラウザ側で id で重複を除く）"""
    tiles: dict[str, list[dict]] = defaultdict(list)
    for u in units:
        for key in sorted({tile_key(m) for m in u["meshes"]}):
            tiles[key].append(u)
    return tiles


def read_records(path: str) -> list[dict]:
    cols = ["MESH_ID", "SHICODE"]
    for y in YEARS:
        cols += [f"HITOKU{y}", f"GASSAN{y}", f"PT00_{y}"] + [f"PT{c:02d}_{y}" for c in range(1, 21)]
    df = pyogrio.read_dataframe(path, columns=cols, read_geometry=False)
    df = df.astype(object).where(df.notna(), None)
    return df.to_dict("records")


def build(pref: str, src_path: str, out_dir: Path, version: str) -> dict:
    records = read_records(src_path)
    units, warnings = build_units(records)
    tiles = split_tiles(units)
    target = out_dir / pref
    if target.exists():
        for old in target.glob("*.json"):
            old.unlink()
    for key, items in tiles.items():
        write_json(target / f"{key}.json", {"units": items})
    hidden = sum(1 for u in units if len(u["meshes"]) > 1)
    index = {
        "prefCode": pref,
        "version": version,
        "years": YEARS,
        "ageClasses": list(AGE_GROUPS),
        "unit": "人",
        "tiles": sorted(tiles),
        "meshCount": len(records),
        "unitCount": len(units),
        "mergedUnitCount": hidden,
    }
    write_json(target / "index.json", index)
    files, size = dir_size(target)
    for w in warnings[:10]:
        print(f"  注意: {w}")
    if len(warnings) > 10:
        print(f"  注意: ほか {len(warnings) - 10} 件")
    return {"files": files, "bytes": size, "meshes": len(records), "units": len(units), "merged": hidden}
