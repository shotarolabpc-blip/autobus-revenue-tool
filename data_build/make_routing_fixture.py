"""経路計算のテスト用の小さな道路網タイルを作る（src/routing/__fixtures__/）。

格子状の道路（経度 139.00〜139.06、緯度 35.00〜35.02）:

    y=35.02  A0 ── A1 ── A2 ── A3      上の段：双方向
             │     │     │     │
    y=35.01  B0 ←─ B1 ←─ B2 ←─ B3      中の段：西向きの一方通行
             │     │     │     │
    y=35.00  C0 ── C1 ── C2 ── C3      下の段：双方向

    x=     139.00 139.02 139.04 139.06   （139.05 でタイルが分かれる）

縦の道路はすべて双方向。B0→B3（東向き）は中の段を通れないので、上か下の段へ迂回する。
"""

from __future__ import annotations

import json
from pathlib import Path

import roadgraph as rg

OUT = Path(__file__).resolve().parent.parent / "src" / "routing" / "__fixtures__"
XS = [139.00, 139.02, 139.04, 139.06]
YS = {"A": 35.02, "B": 35.01, "C": 35.00}


def node_id(row: str, i: int) -> int:
    return {"A": 100, "B": 200, "C": 300}[row] + i


def main() -> None:
    ways = []
    for row, y in YS.items():
        ids = [node_id(row, i) for i in range(4)]
        coords = [(x, y) for x in XS]
        d = rg.BACKWARD if row == "B" else rg.BOTH  # B は東向きに描いて oneway=-1（西向き）
        cls = "primary" if row == "C" else "residential"
        ways.append(rg.Way(ids, coords, d, cls))
    for i, x in enumerate(XS):
        ids = [node_id(r, i) for r in "ABC"]
        ways.append(rg.Way(ids, [(x, YS[r]) for r in "ABC"], rg.BOTH, "residential"))
    segs, vertices = rg.split_at_junctions(ways)
    segs = rg.contract(segs)
    edges = rg.directed_edges(segs)
    classes = ["residential", "primary"]
    graph = rg.build_tiles(edges, vertices, 0.05, (120.0, 20.0), classes)
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.bin.gz"):
        old.unlink()
    for (tx, ty), data in graph.tiles.items():
        (OUT / f"{tx}_{ty}.bin.gz").write_bytes(data)
    index = {
        "prefCode": "99",
        "tileSizeDeg": 0.05,
        "origin": [120.0, 20.0],
        "classes": classes,
        "costFactor": [1.0, 1.0],
        "tiles": sorted([tx, ty] for tx, ty in graph.tiles),
        "osmTimestamp": "test",
        "nodeCount": graph.node_count,
        "edgeCount": graph.edge_count,
    }
    (OUT / "index.json").write_text(json.dumps(index, indent=2) + "\n", encoding="utf-8")
    print(f"{len(graph.tiles)} タイル、ノード {graph.node_count}、有向辺 {graph.edge_count} → {OUT}")


if __name__ == "__main__":
    main()
