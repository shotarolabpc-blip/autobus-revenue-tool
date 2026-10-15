"""全国都市交通特性調査（令和3年）の集計表から、需要推計の係数を public/data/coefficients.json に出力する。
要件 5.1A・付録B、P1-4。

使う集計表（国土交通省 https://www.mlit.go.jp/toshi/tosiko/toshi_tosiko_tk_000196.html、ログイン不要）:
  - 3_生成原単位集計（001732066.xlsx）表4「性別・年齢階層別・世帯構成別外出率、原単位」
      性別＝合計、世帯構成＝合計 の 外出率・ネット原単位
  - 5_目的・手段集計（001732069.xlsx）表8-2「性別・年齢階層別・代表交通手段別原単位、構成比」
      性別＝合計 の 構成比（ネット）の バス
いずれも 都市類型（10分類＋全国計）× 平日／休日 × 年齢階層。
年齢階層は調査の6区分をそのまま使う（Q3：B）。0〜4歳の扱いだけ暫定（Q2未決定）。coefficient_rules.yaml を参照。

令和7年度調査の公表後は、SURVEY の版とファイル名を差し替えて実行し直す。

使い方:
    .venv\\Scripts\\python data_build\\build_coefficients.py
"""

from __future__ import annotations

from collections import defaultdict

import openpyxl
import yaml

from common import DATA_RAW, PUBLIC_DATA, download, setup_console, write_json_pretty

SURVEY = {
    "name": "全国都市交通特性調査（令和3年）",
    "year": 2021,
    "provider": "国土交通省",
    "pageUrl": "https://www.mlit.go.jp/toshi/tosiko/toshi_tosiko_tk_000196.html",
}
OUTING = {
    "file": "001732066.xlsx",
    "url": "https://www.mlit.go.jp/toshi/tosiko/content/001732066.xlsx",
    "title": "3_生成原単位集計",
    "sheet": "4",
    "tableName": "表4 性別・年齢階層別・世帯構成別外出率、原単位",
}
MODE = {
    "file": "001732069.xlsx",
    "url": "https://www.mlit.go.jp/toshi/tosiko/content/001732069.xlsx",
    "title": "5_目的・手段集計",
    "sheet": "8-2",
    "tableName": "表8-2 性別・年齢階層別・代表交通手段別原単位、構成比",
}
DAY = {"平日": "weekday", "休日": "holiday"}

RAW = DATA_RAW / "mlit_r3"


def header_columns(ws, header_row: int, group_row: int) -> dict[tuple[str, str], int]:
    """（グループ名, 列名）→ 列番号。グループ名がない列は ("", 列名)"""
    rows = list(ws.iter_rows(min_row=1, max_row=header_row, values_only=True))
    groups = rows[group_row - 1]
    names = rows[header_row - 1]
    cols = {}
    for i, name in enumerate(names):
        if name is None:
            continue
        cols[(str(groups[i] or ""), str(name))] = i
    return cols


def read_table(path, sheet, filters: dict[str, str], values: dict[str, tuple[str, str]]):
    """6行目が見出し（4行目がグループ名）の表を読み、条件に合う行の値を返す"""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[sheet]
    cols = header_columns(ws, 6, 4)
    plain = {name: i for (g, name), i in cols.items() if g == ""} | {
        name: i for (g, name), i in cols.items() if g != "" and name in ("平日／休日", "地域", "性別", "年齢階層", "世帯構成", "地域コード")
    }
    out = []
    for row in ws.iter_rows(min_row=7, values_only=True):
        if row[0] is None:
            continue
        if any(str(row[plain[k]]) != v for k, v in filters.items()):
            continue
        rec = {k: row[plain[k]] for k in ("平日／休日", "地域", "地域コード", "年齢階層")}
        for key, col in values.items():
            rec[key] = row[cols[col]]
        out.append(rec)
    return out


def main() -> None:
    setup_console()
    rules = yaml.safe_load((DATA_RAW.parent / "data_build" / "coefficient_rules.yaml").read_text(encoding="utf-8"))
    for t in (OUTING, MODE):
        download(t["url"], RAW / t["file"])

    outing = read_table(
        RAW / OUTING["file"],
        OUTING["sheet"],
        {"性別": "合計", "世帯構成": "合計"},
        {"outingRate": ("外出率", "外出率"), "tripRate": (rules["trip_rate"], rules["trip_rate"])},
    )
    mode = read_table(
        RAW / MODE["file"],
        MODE["sheet"],
        {"性別": "合計"},
        {"busShare": (rules["bus_share"], "バス")},
    )
    # （都市類型コード, 曜日, 調査の年齢階層）→ 値
    raw: dict[tuple[int, str, str], dict] = defaultdict(dict)
    names: dict[int, str] = {}
    for rec in outing + mode:
        key = (int(rec["地域コード"]), DAY[rec["平日／休日"]], str(rec["年齢階層"]))
        names[key[0]] = str(rec["地域"])
        for k in ("outingRate", "tripRate", "busShare"):
            if k in rec:
                raw[key][k] = float(rec[k])

    tables = {
        "outingRate": f"{OUTING['title']} {OUTING['tableName']}（性別・世帯構成＝合計、外出率）",
        "tripRate": f"{OUTING['title']} {OUTING['tableName']}（性別・世帯構成＝合計、{rules['trip_rate']}）",
        "busShare": f"{MODE['title']} {MODE['tableName']}（性別＝合計、{rules['bus_share']}・バス）",
    }
    values: dict[str, dict] = {}
    missing = []
    for code in sorted(names):
        values[str(code)] = {}
        for day in ("weekday", "holiday"):
            values[str(code)][day] = {}
            for age, m in rules["age_mapping"].items():
                entry = {}
                if m.get("zero"):
                    # 需要に数えない区分（Q2：0〜4歳）。値はすべて0
                    values[str(code)][day][age] = {"outingRate": 0, "tripRate": 0, "busShare": 0}
                    continue
                for k in ("outingRate", "tripRate", "busShare"):
                    src = [raw.get((code, day, a), {}).get(k) for a in m["from"]]
                    if any(v is None for v in src):
                        missing.append((code, day, age, k))
                        continue
                    entry[k] = round(sum(src) / len(src), 6)
                values[str(code)][day][age] = entry
    if missing:
        raise SystemExit(f"集計表に見つからない値があります: {missing[:5]}")

    write_json_pretty(
        PUBLIC_DATA / "coefficients.json",
        {
            "_comment": "需要推計の係数。data_build/build_coefficients.py が生成。手で編集しない。",
            "survey": SURVEY,
            "tables": tables,
            "tableFiles": [
                {"title": OUTING["title"], "url": OUTING["url"]},
                {"title": MODE["title"], "url": MODE["url"]},
            ],
            "ageMapping": {
                age: {"from": m.get("from", []), "note": m.get("note", "")}
                for age, m in rules["age_mapping"].items()
            },
            "ageMappingStatus": "年齢階層は調査の区分をそのまま使う（Q3：B、2026-10-15 決定）。0〜4歳は需要に数えない（Q2：B、2026-10-15 決定。調査の対象外で、未就学児は同伴で無料が一般的なため）",
            "cityTypes": [{"code": c, "name": n} for c, n in sorted(names.items())],
            "values": values,
        },
    )
    print(f"coefficients.json：都市類型 {len(names)}（{', '.join(names[c] for c in sorted(names))}）")


if __name__ == "__main__":
    main()
