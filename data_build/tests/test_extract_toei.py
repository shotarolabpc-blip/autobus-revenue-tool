import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from extract_toei_actuals import parse_lines  # noqa: E402

OK = [
    "1 Ｃ・Ｈ０１ 新宿駅西口～（都庁第一本庁舎循環）～新宿駅西口 31,054 43,053 -11,999 69 390 139",
    "2 ＦＬ０１ 葛西駅前～錦糸町駅前 23,016 24,333 -1,317 158 1,047 106",
    "系 統 収 入 支 出 損 益 額 乗 車 料 収 入 乗 車 人 員",  # 見出しは読み飛ばす
]


def test_rows_are_parsed_and_units_converted():
    rows, problems = parse_lines(OK)
    assert problems == []
    assert [r["code"] for r in rows] == ["Ｃ・Ｈ０１", "ＦＬ０１"]
    assert rows[0]["riders"] == 390
    assert rows[0]["fare_per_day_yen"] == 69000  # 千円/日 → 円/日
    assert rows[1]["section"] == "葛西駅前～錦糸町駅前"


def test_rounding_difference_is_allowed_but_a_wrong_value_is_reported():
    # 収入−支出＝-31,310 だが損益額は -31,311（千円未満の四捨五入による差）→ 許す
    ok, p = parse_lines(["1 ＲＨ０１ 渋谷駅前～六本木ヒルズ 120,652 151,962 -31,311 263 1,413 126"])
    assert p == []
    # 損益額が大きく違う → 報告
    _, p = parse_lines(["1 ＲＨ０１ 渋谷駅前～六本木ヒルズ 120,652 151,962 -3,131 263 1,413 126"])
    assert any("損益額" in x for x in p)
    # 営業係数が 支出÷収入 と合わない → 報告
    _, p = parse_lines(["1 ＲＨ０１ 渋谷駅前～六本木ヒルズ 120,652 151,962 -31,311 263 1,413 99"])
    assert any("営業係数" in x for x in p)


def test_missing_row_is_reported():
    _, p = parse_lines([OK[1].replace("2 ", "3 ", 1)])
    assert any("通し番号" in x for x in p)
