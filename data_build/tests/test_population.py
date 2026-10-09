import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from population import YEARS, age_population, build_units, group_meshes, split_tiles  # noqa: E402


def mesh(mid: str, per_class: float = 0.0, hidden: dict | None = None) -> dict:
    """5歳階級すべてに per_class 人いるメッシュ（PT00 は合計）"""
    r: dict = {"MESH_ID": mid}
    for y in YEARS:
        for c in range(1, 21):
            r[f"PT{c:02d}_{y}"] = per_class
        r[f"PT00_{y}"] = per_class * 20
        r[f"HITOKU{y}"] = None
        r[f"GASSAN{y}"] = None
    for y, (mark, target) in (hidden or {}).items():
        r[f"HITOKU{y}"] = mark
        r[f"GASSAN{y}"] = target
    return r


def test_age_groups_sum_5yr_classes():
    r = mesh("533945111", 1.0)
    # 0-14＝3階級、15-64＝10階級、65-74＝2階級、75+＝5階級
    assert age_population(r, 2025) == [3.0, 10.0, 2.0, 5.0]


def test_hidden_meshes_are_grouped_with_merge_target_across_years():
    a = mesh("533945111", hidden={2025: ("*", "533945112")})
    b = mesh("533945112", 1.0, hidden={2025: ("@", None)})
    c = mesh("533945113", hidden={2040: ("*", "533945112")})
    d = mesh("533945114", 1.0)
    groups = group_meshes([a, b, c, d])
    assert groups == {
        "533945111": ["533945111", "533945112", "533945113"],
        "533945114": ["533945114"],
    }


def test_unit_population_is_sum_of_members_without_double_counting():
    # 2025年：a は秘匿（0人）、合算先 b に a の分も入っている
    a = mesh("533945111", 0.0, hidden={2025: ("*", "533945112")})
    b = mesh("533945112", 2.0, hidden={2025: ("@", None)})
    units, warnings = build_units([a, b])
    assert warnings == []
    assert len(units) == 1
    u = units[0]
    assert u["meshes"] == ["533945111", "533945112"]
    assert u["pop"][0] == [6.0, 20.0, 4.0, 10.0]


def test_mismatch_with_total_is_reported():
    r = mesh("533945111", 1.0)
    r["PT00_2030"] = 999
    _, warnings = build_units([r])
    assert any("一致しません" in w for w in warnings)


def test_units_are_placed_in_every_tile_they_touch():
    units = [{"id": "533945991", "meshes": ["533945991", "533946001"], "pop": []}]
    tiles = split_tiles(units)
    assert sorted(tiles) == ["533945", "533946"]
