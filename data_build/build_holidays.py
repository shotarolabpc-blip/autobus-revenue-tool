"""国民の祝日データ（内閣府）を public/data/holidays.json に変換する。要件 F-3-1・付録B。

- 内閣府が公表している年（CSV に載っている年）は、その値をそのまま使う。
- それより先の年は、現行の「国民の祝日に関する法律」の規定から計算した推定値とする（estimated=true）。
  春分の日・秋分の日は毎年2月に官報で公表されるため、将来の年は一般に使われる近似式で求める。
  推定値であることは画面と出力に表示する。

使い方:
    .venv\\Scripts\\python data_build\\build_holidays.py
"""

from __future__ import annotations

import csv
import io
from datetime import date, timedelta
from pathlib import Path

from common import DATA_RAW, PUBLIC_DATA, download, setup_console, write_json_pretty

CSV_URL = "https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv"
PAGE_URL = "https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html"
FIRST_YEAR = 2020
LAST_YEAR = 2080


def nth_monday(year: int, month: int, n: int) -> date:
    d = date(year, month, 1)
    offset = (0 - d.weekday()) % 7  # 月曜日＝0
    return d + timedelta(days=offset + 7 * (n - 1))


def equinox_day(year: int, base: float) -> int:
    """春分（base=20.8431）・秋分（base=23.2488）の日。1980〜2099年に使われる近似式"""
    return int(base + 0.242194 * (year - 1980) - (year - 1980) // 4)


def statutory_holidays(year: int) -> dict[date, str]:
    """現行の祝日法による祝日（振替休日・国民の休日を含む）"""
    h = {
        date(year, 1, 1): "元日",
        nth_monday(year, 1, 2): "成人の日",
        date(year, 2, 11): "建国記念の日",
        date(year, 2, 23): "天皇誕生日",
        date(year, 3, equinox_day(year, 20.8431)): "春分の日",
        date(year, 4, 29): "昭和の日",
        date(year, 5, 3): "憲法記念日",
        date(year, 5, 4): "みどりの日",
        date(year, 5, 5): "こどもの日",
        nth_monday(year, 7, 3): "海の日",
        date(year, 8, 11): "山の日",
        nth_monday(year, 9, 3): "敬老の日",
        date(year, 9, equinox_day(year, 23.2488)): "秋分の日",
        nth_monday(year, 10, 2): "スポーツの日",
        date(year, 11, 3): "文化の日",
        date(year, 11, 23): "勤労感謝の日",
    }
    # 振替休日：祝日が日曜日のときは、その後の最初の祝日でない日
    for d in sorted(h):
        if d.weekday() == 6:
            n = d + timedelta(days=1)
            while n in h:
                n += timedelta(days=1)
            h[n] = "休日"
    # 国民の休日：前日と翌日が祝日である日（日曜日を除く）
    for d in sorted(h):
        n = d + timedelta(days=2)
        mid = d + timedelta(days=1)
        if n in h and mid not in h and mid.weekday() != 6:
            h[mid] = "休日"
    return h


def read_published(path: Path) -> dict[date, str]:
    text = path.read_bytes().decode("cp932")
    rows = list(csv.reader(io.StringIO(text)))
    out = {}
    for y_m_d, name in rows[1:]:
        y, m, d = (int(x) for x in y_m_d.split("/"))
        out[date(y, m, d)] = name
    return out


def main() -> None:
    setup_console()
    src = download(CSV_URL, DATA_RAW / "cao" / "syukujitsu.csv")
    published = read_published(src)
    last_published_year = max(d.year for d in published)
    items = []
    for year in range(FIRST_YEAR, LAST_YEAR + 1):
        if year <= last_published_year:
            days = {d: n for d, n in published.items() if d.year == year}
            estimated = False
        else:
            days = statutory_holidays(year)
            estimated = True
        items += [{"date": d.isoformat(), "name": n, "estimated": estimated} for d, n in sorted(days.items())]
    # 公表済みの年で、計算結果が公表値と一致するかを確認（推定方法の検証）
    mismatch = []
    for year in range(FIRST_YEAR, last_published_year + 1):
        if year in (2020, 2021):  # 東京五輪に伴う特例で祝日が移動した年
            continue
        calc = statutory_holidays(year)
        pub = {d: n for d, n in published.items() if d.year == year}
        if set(calc) != set(pub):
            mismatch.append(year)
    if mismatch:
        print(f"注意：計算と公表値が一致しない年があります: {mismatch}")
    else:
        print(f"検証：{FIRST_YEAR + 2}〜{last_published_year}年は、計算した祝日が公表値と一致しました")
    write_json_pretty(
        PUBLIC_DATA / "holidays.json",
        {
            "source": "内閣府「国民の祝日について」（syukujitsu.csv）",
            "sourceUrl": PAGE_URL,
            "publishedThrough": max(published).isoformat(),
            "estimatedNote": (
                f"{last_published_year + 1}年以降は、現行の「国民の祝日に関する法律」の規定から計算した推定値"
                "（春分の日・秋分の日は近似式による）"
            ),
            "yearEnd": {
                "from": "12-29",
                "to": "01-03",
                "source": "行政機関の休日に関する法律 第1条（12月29日から翌年1月3日まで）",
            },
            "items": items,
        },
    )
    print(f"holidays.json：{FIRST_YEAR}〜{LAST_YEAR}年、{len(items)} 日（公表値は {max(published)} まで）")


if __name__ == "__main__":
    main()
