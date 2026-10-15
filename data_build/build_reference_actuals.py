r"""参考実績データ（要件 5.4、F-5-5）を、手で置いたCSVから public/data/reference_actuals.json に作る。

公開されている実績（都営バスの系統別収支、自治体のコミュニティバスの利用実績など）は、PDFや、
自動取得を断るサイトで公開されていることが多く、表の読み取りには人の確認が必要です（要件定義書 5.4）。
そのため、このスクリプトは自動取得をせず、人が読み取って確認したCSVだけを取り込みます。

手順（docs/reference_data.md）:
1. 公式の資料から、路線ごとの実績を読み取り、data_raw/reference/actuals.csv に書く（見出しは下の COLUMNS）
2. .venv\Scripts\python data_build\build_reference_actuals.py
3. public/data/reference_actuals.json ができる（出典・確認日のない行は取り込まない）

使い方:
    .venv\Scripts\python data_build\build_reference_actuals.py [CSVのパス]
"""

from __future__ import annotations

import csv
import sys
from datetime import date
from pathlib import Path

from common import DATA_RAW, PUBLIC_DATA, setup_console, write_json_pretty

COLUMNS = [
    "名称",
    "事業者",
    "種別",  # route＝路線バス／community＝コミュニティバス／other
    "年度",
    "1日乗車人員",
    "1日便数",
    "1日乗車料収入",
    "路線延長km",
    "出典名",
    "出典URL",
    "確認日",  # YYYY-MM-DD
]
CATEGORIES = {"route", "community", "other"}
DEFAULT_CSV = DATA_RAW / "reference" / "actuals.csv"
OUT = PUBLIC_DATA / "reference_actuals.json"


def _num(s: str) -> float | None:
    t = s.replace(",", "").strip()
    if t == "":
        return None
    return float(t)


def parse_rows(rows: list[dict[str, str]]) -> tuple[list[dict], list[str]]:
    """CSV の行を検証して、配信用の項目にする。読めない行は理由つきで返す（黙って捨てない）"""
    items: list[dict] = []
    errors: list[str] = []
    for i, r in enumerate(rows, start=2):
        name = (r.get("名称") or "").strip()
        try:
            riders = _num(r.get("1日乗車人員") or "")
            trips = _num(r.get("1日便数") or "")
            revenue = _num(r.get("1日乗車料収入") or "")
            length = _num(r.get("路線延長km") or "")
            year = _num(r.get("年度") or "")
        except ValueError:
            errors.append(f"{i}行目：数値でない値があります")
            continue
        url = (r.get("出典URL") or "").strip()
        checked = (r.get("確認日") or "").strip()
        cat = (r.get("種別") or "").strip()
        if not name:
            errors.append(f"{i}行目：名称がありません")
        elif riders is None or riders <= 0:
            errors.append(f"{i}行目（{name}）：1日乗車人員がありません")
        elif not url.startswith("http") or not (r.get("出典名") or "").strip():
            errors.append(f"{i}行目（{name}）：出典名・出典URLがありません（出典は必須です）")
        elif not _is_date(checked):
            errors.append(f"{i}行目（{name}）：確認日が YYYY-MM-DD の形ではありません")
        elif cat not in CATEGORIES:
            errors.append(f"{i}行目（{name}）：種別は route / community / other のどれかです")
        else:
            items.append(
                {
                    "id": f"ref-{len(items) + 1:04d}",
                    "name": name,
                    "operator": (r.get("事業者") or "").strip(),
                    "category": cat,
                    "fiscalYear": int(year) if year is not None else None,
                    "dailyRiders": riders,
                    "dailyTrips": trips,
                    "dailyFareRevenue": revenue,
                    "routeLengthKm": length,
                    "source": {
                        "title": r["出典名"].strip(),
                        "url": url,
                        "checkedAt": checked,
                    },
                }
            )
    return items, errors


def _is_date(s: str) -> bool:
    try:
        date.fromisoformat(s)
        return True
    except ValueError:
        return False


def main() -> None:
    setup_console()
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CSV
    if not path.exists():
        raise SystemExit(
            f"{path} がありません。docs/reference_data.md の手順で、読み取って確認した実績のCSVを置いてください"
        )
    with open(path, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        missing = [c for c in COLUMNS if c not in (reader.fieldnames or [])]
        if missing:
            raise SystemExit(f"見出しに次の列がありません: {missing}")
        items, errors = parse_rows(list(reader))
    for e in errors:
        print(f"  注意: {e}")
    write_json_pretty(
        OUT,
        {
            "checkedAt": date.today().isoformat(),
            "note": "公式の資料から読み取った実績（都営バスは、東京都オープンデータのPDFから読み取り、行ごとに検算済み。data_build/extract_toei_actuals.py）。都市部の公営バスは自動運転バスより規模がかなり大きいため、上限の目安として使う。",
            "items": items,
        },
    )
    print(f"reference_actuals.json：{len(items)} 件（取り込めなかった行 {len(errors)} 件）")


if __name__ == "__main__":
    main()
