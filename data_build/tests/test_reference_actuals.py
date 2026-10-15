import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from build_reference_actuals import parse_rows  # noqa: E402

OK = {
    "名称": "A線",
    "事業者": "A市",
    "種別": "community",
    "年度": "2024",
    "1日乗車人員": "1,200",
    "1日便数": "40",
    "1日乗車料収入": "",
    "路線延長km": "6.5",
    "出典名": "A市 協議会資料",
    "出典URL": "https://example.com/a",
    "確認日": "2026-10-15",
}


def test_valid_row_is_imported():
    items, errors = parse_rows([OK])
    assert errors == []
    assert items[0]["dailyRiders"] == 1200
    assert items[0]["dailyFareRevenue"] is None
    assert items[0]["source"]["checkedAt"] == "2026-10-15"


def test_rows_without_source_or_date_are_reported_not_dropped_silently():
    rows = [
        {**OK, "出典URL": ""},
        {**OK, "確認日": "2026/10/15"},
        {**OK, "種別": "bus"},
        {**OK, "1日乗車人員": "abc"},
        {**OK, "名称": ""},
    ]
    items, errors = parse_rows(rows)
    assert items == []
    assert len(errors) == 5
    assert "出典" in errors[0] and "確認日" in errors[1] and "種別" in errors[2]
