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
from dataclasses import dataclass
from datetime import date

import pdfplumber

from common import DATA_RAW, download, setup_console

REF_DIR = DATA_RAW / "reference" / "toei"
OUT = DATA_RAW / "reference" / "actuals.csv"
PDF_BASE = "https://www.kotsu.metro.tokyo.jp/about/information/closing/pdf/"
OPENDATA_PDF = "https://www.opendata.metro.tokyo.lg.jp/kotsu/about/about_r05_closing_r05_closing05.pdf"


@dataclass
class Source:
    """取り込む年度のPDF。file は data_raw/reference/toei/ に置いたファイル名、year は西暦の年度"""

    file: str
    year: int
    name: str
    url: str
    download_url: str | None = None  # プログラムで取得できる場合だけ
    # 公開用のデータ（public/data）に入れてよいか。利用条件が確認できるまでは False（actuals_unpublished.csv に出す）
    publish: bool = True


SOURCES = [
    Source(
        "r05_bus.pdf",
        2023,
        "東京都交通局 令和5年度 バス系統別収支状況（東京都オープンデータ「決算 参考」）",
        OPENDATA_PDF,
        OPENDATA_PDF,
    ),
    # 令和6・7年度は、東京都オープンデータの窓口にまだなく、東京都交通局のサイト（プログラムからの取得は拒否される）で公開。
    # 利用者がブラウザで取得して置いたPDFを使う（取得元のURLは利用者に教えてもらった）。
    # 利用条件：交通局のサイトポリシー（https://www.kotsu.metro.tokyo.jp/riyo/）では、掲載情報は著作権の対象で、
    # 私的使用の複製や引用など著作権法上認められた場合を除き、無断で複製・転用できないとされている。
    # オープンデータ（CC BY 4.0）として公開されている令和5年度と違い、公開してよいかが確認できていないため、
    # 公開用のデータには入れない（publish=False）。交通局に確認できたら True にする。
    # 令和7年度は決算の速報（監査委員の審査・都議会の認定の前）。
    Source(
        "r06_closing05.pdf",
        2024,
        "東京都交通局 令和6年度 バス系統別収支状況（東京都交通局の決算の公表ページに掲載）",
        PDF_BASE + "r06_closing05.pdf",
        publish=False,
    ),
    Source(
        "r07_closing05.pdf",
        2025,
        "東京都交通局 令和7年度 バス系統別収支状況（東京都交通局の決算の公表ページに掲載）",
        PDF_BASE + "r07_closing05.pdf",
        publish=False,
    ),
]

_DIGITS = str.maketrans("０１２３４５６７８９", "0123456789")
HEADER = re.compile(r"令和([０-９0-9]+)年度")

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


def pdf_lines(path) -> list[str]:
    lines: list[str] = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            lines += (page.extract_text() or "").splitlines()
    return lines


def check_year(lines: list[str], year: int) -> str | None:
    """PDFの見出し（令和N年度）が、取り込む年度と一致するか。違えば理由を返す"""
    for line in lines[:5]:
        m = HEADER.search(line)
        if m:
            reiwa = int(m.group(1).translate(_DIGITS))
            return None if 2018 + reiwa == year else f"見出しは令和{reiwa}年度（{2018 + reiwa}年度）で、{year}年度と違います"
    return "見出し（令和N年度）が見つかりません"


def main() -> None:
    setup_console()
    out_rows: list[list] = []
    held_rows: list[list] = []  # 公開しない年度の行（手元の確認用）
    for src in SOURCES:
        path = REF_DIR / src.file
        if not path.exists():
            if src.download_url is None:
                print(f"  {src.file} がありません。ブラウザで取得して {REF_DIR} に置いてください（{src.url}）。この年度は飛ばします")
                continue
            download(src.download_url, path)
        lines = pdf_lines(path)
        bad = check_year(lines, src.year)
        rows, problems = parse_lines(lines)
        if bad:
            problems.append(bad)
        if problems:
            detail = "\n  ".join(problems)
            raise SystemExit(f"{src.file}：検算が合わないため、CSVを作りません:\n  {detail}")
        print(f"  {src.file}：{src.year}年度 {len(rows)} 系統（検算OK）")
        for r in rows:
            (out_rows if src.publish else held_rows).append(
                [
                    f"{r['code']} {r['section']}",
                    "東京都交通局（都営バス）",
                    "route",
                    src.year,
                    r["riders"],
                    "",
                    r["fare_per_day_yen"],
                    "",
                    src.name,
                    src.url,
                    date.today().isoformat(),
                ]
            )
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(COLUMNS)
        w.writerows(out_rows)
    print(f"{OUT.relative_to(DATA_RAW.parent)}：{len(out_rows)} 行（公開用）")
    held = OUT.with_name("actuals_unpublished.csv")
    with open(held, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(COLUMNS)
        w.writerows(held_rows)
    print(f"{held.relative_to(DATA_RAW.parent)}：{len(held_rows)} 行（利用条件の確認待ちのため、公開しない）")


if __name__ == "__main__":
    main()
