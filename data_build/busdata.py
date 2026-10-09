"""バス停留所（P11-2022）・バスルート（N07-2022）・行政区域（N03）の加工。要件 F-2-2。"""

from __future__ import annotations

from pathlib import Path

import pyogrio
import shapely
from shapely.geometry import mapping

from common import write_json

# バス区分コード（P11_004）：国土数値情報 バス停留所 製品仕様書
BUS_TYPES = {1: "路線バス（民間）", 2: "路線バス（公営）", 3: "コミュニティバス", 4: "デマンドバス", 5: "その他"}

COORD_DIGITS = 6  # 約0.1m
ROUTE_DIGITS = 5  # 約1m
ROUTE_SIMPLIFY_DEG = 0.00002  # 約2m（表示用。線の形はほぼ変わらない）


def _clean(v: object) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def build_busstops(pref: str, src_path: str, out_path: Path) -> dict:
    df = pyogrio.read_dataframe(src_path)
    features = []
    for i, row in enumerate(df.itertuples(index=False)):
        d = row._asdict()
        routes = [r for r in (_clean(d.get(f"P11_003_{k:02d}")) for k in range(1, 36)) if r]
        # バス区分は「1,1,1」のようにカンマ区切りで入っていることがある
        types = sorted(
            {
                int(t)
                for k in range(1, 36)
                for t in str(d.get(f"P11_004_{k:02d}") or "").split(",")
                if t.strip().isdigit()
            }
        )
        geom = d["geometry"]
        features.append(
            {
                "type": "Feature",
                # 同じ版のデータから作れば同じIDになる（プロジェクトファイルの existingStopId に使う）
                "id": f"{pref}-{i:06d}",
                "geometry": {
                    "type": "Point",
                    "coordinates": [round(geom.x, COORD_DIGITS), round(geom.y, COORD_DIGITS)],
                },
                "properties": {
                    "name": _clean(d.get("P11_001")) or "",
                    "operator": _clean(d.get("P11_002")) or "",
                    "types": types,
                    "routes": routes,
                },
            }
        )
    size = write_json(out_path, {"type": "FeatureCollection", "features": features})
    return {"features": len(features), "bytes": size}


def build_busroutes(pref: str, src_path: str, out_path: Path) -> dict:
    df = pyogrio.read_dataframe(src_path)
    geoms = shapely.set_precision(
        shapely.simplify(df.geometry.values, ROUTE_SIMPLIFY_DEG, preserve_topology=False),
        10**-ROUTE_DIGITS,
    )
    features = []
    for i, (geom, op, note) in enumerate(zip(geoms, df["N07_001"], df["N07_002"])):
        if geom is None or geom.is_empty:
            continue
        features.append(
            {
                "type": "Feature",
                "id": f"{pref}-{i:06d}",
                "geometry": mapping(geom),
                "properties": {"operator": _clean(op) or "", "note": _clean(note)},
            }
        )
    size = write_json(out_path, {"type": "FeatureCollection", "features": features})
    return {"features": len(features), "bytes": size}


def municipality_name(row: dict) -> str:
    """郡・政令市名を付けた市区町村名（例：西多摩郡瑞穂町、横浜市中区）"""
    parts = [_clean(row.get("N03_003")), _clean(row.get("N03_004"))]
    return "".join(p for p in parts if p)


def build_admin(pref: str, src_path: str, municipalities_path: Path) -> dict:
    """市区町村の一覧と、都道府県の初期表示範囲（本土・本島の範囲）を作る"""
    df = pyogrio.read_dataframe(src_path)
    df = df[df["N03_007"].notna()]
    items: dict[str, str] = {}
    for row in df.drop(columns="geometry").to_dict("records"):
        code = str(row["N03_007"])
        # 末尾000 は「所属未定地」など市区町村ではない区域
        if code.endswith("000"):
            continue
        items.setdefault(code, municipality_name(row))
    write_json(
        municipalities_path,
        {"prefCode": pref, "items": [{"code": c, "name": n} for c, n in sorted(items.items())]},
    )
    # 最も大きい1つながりの陸地の範囲を初期表示にする（離島で範囲が広がりすぎないように）
    merged = shapely.union_all(shapely.make_valid(df.geometry.values))
    parts = list(merged.geoms) if hasattr(merged, "geoms") else [merged]
    main = max(parts, key=lambda g: g.area)
    view = [round(v, 4) for v in main.bounds]
    return {"municipalities": len(items), "view": view}
