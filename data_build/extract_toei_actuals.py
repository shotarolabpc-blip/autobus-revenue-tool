r"""都営バス「バス系統別収支状況」（東京都交通局。東京都オープンデータの PDF）から、
参考実績のCSV（data_raw/reference/actuals.csv）の行を作る。要件 5.4、F-5-5。

元データ：東京都オープンデータカタログ「決算 参考」のうち「令和5年度 バス路線別収支」
  https://www.opendata.metro.tokyo.lg.jp/kotsu/about/about_r05_closing_r05_closing05.pdf
（東京都交通局のサイトは、プログラムからの取得を拒否するが、オープンデータの窓口は取得できる。
 ログイン・利用規約への同意は不要。ダウンロードは手動でもよい：data_raw/reference/toei/r05_bus.pdf に置く）

PDFの表の読み取りは間違えやすいので、行ごとに次の検算をして、合わない行があれば止まる:
  - 損益額 ＝ 収入 − 支出（千円未満の四捨五入による ±2 までの差は許す）
  - 営業係数 ＝ 支出 ÷ 収入 × 100（四捨五入。±1の誤差まで）
  - 系統の通し番号が1から欠けずに続いていること
さらに、人が見て確かめる（抜き取りで、PDFの数字と画面の数字が一致するか。docs/reference_data.md）。

使い方:
    .venv\\Scripts\\python data_build\\extract_toei_actuals.py
    .venv\\Scripts\\python data_build\\build_reference_actuals.py
"""

from __future__ import annotations

import csv
import re
from datetime import date
from pathlib import Path

import pdfplumber

from common import DATA_RAW, download, setup_console

PDF_URL = "https://www.opendata.metro.tokyo.lg.jp/kotsu/about/about_r05_closing_r05_closing05.pdf"
PDF_PATH = DATA_RAW / "reference" / "toei" / "r05_bus.pdf"
OUT = DATA_RAW / "reference" / "actuals.csv"

FISCAL_YEAR = 2023  # 令和5年度
SOURCE_NAME = "東京都交通局 令和5年度 バス系統別収支状況（東京都オープンデータ「決算 参考」）"

NUM = r"-?[\d,]+"
ROW = re.compile(rf"^(\d+) (\S+) (.+) ({NUM}) ({NUM}) ({NUM}) ({NUM}) ({NUM}) (\d+)$")

COLUMNS = [
    "名称",
    "事業者",
    "種別",
    "年度",
    "1日乗車人員",
    "1日便数",
    "1日乗車料収入",
    "路線延長km",
    "出典名",
    "出典URL",
    "確認日",
]


def _n(s: str) -> int:
    return int(s.replace(",", ""))


def parse_lines(lines: list[str]) -> tuple[list[dict], list[str]]:
    """PDFの行から系統別の値を取り出し、検算する。読めなかった行・合わない行を返す"""
    rows: list[dict] = []
    problems: list[str] = []
    for line in lines:
        m = ROW.match(line.strip())
        if not m:
            continue
        no, code, section, income, expense, balance, fare_k, riders, coef = m.groups()
        income, expense, balance = _n(income), _n(expense), _n(balance)
        fare_k, riders, coef = _n(fare_k), _n(riders), int(coef)
        # 千円未満を四捨五入した値なので、±2（千円）までの差は誤差とみなす
        if abs(income - expense - balance) > 2:
            problems.append(f"{no} {code}：損益額が 収入−支出 と合いません")
        if income > 0 and abs(round(expense / income * 100) - coef) > 1:
            problems.append(f"{no} {code}：営業係数が 支出÷収入 と合いません")
        rows.append(
            {
                "no": int(no),
                "code": code,
                "section": section,
                "fare_per_day_yen": fare_k * 1000,  # 千円/日 → 円/日
                "riders": riders,
            }
        )
    nos = [r["no"] for r in rows]
    if nos != list(range(1, len(nos) + 1)):
        problems.append("系統の通し番号が、1から欠けずに続いていません（読み取れていない行があります）")
    return rows, problems


def main() -> None:
    setup_console()
    download(PDF_URL, PDF_PATH)
    lines: list[str] = []
    with pdfplumber.open(PDF_PATH) as pdf:
        for page in pdf.pages:
            lines += (page.extract_text() or "").splitlines()
    rows, problems = parse_lines(lines)
    if problems:
        raise SystemExit("検算が合わないため、CSVを作りません:\n  " + "\n  ".join(problems))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(COLUMNS)
        for r in rows:
            w.writerow(
                [
                    f"{r['code']} {r['section']}",
                    "東京都交通局（都営バス）",
                    "route",
                    FISCAL_YEAR,
                    r["riders"],
                    "",
                    r["fare_per_day_yen"],
                    "",
                    SOURCE_NAME,
                    PDF_URL,
                    date.today().isoformat(),
                ]
            )
    print(f"{OUT.relative_to(DATA_RAW.parent)}：{len(rows)} 系統（検算OK）")


if __name__ == "__main__":
    main()
