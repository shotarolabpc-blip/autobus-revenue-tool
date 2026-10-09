"""元データの入手先と版。版を上げるときはここを変える。

国土数値情報はログイン・利用規約への同意なしで取得できるため、自動で取得する。
（取得できない環境では、README の手順で data_raw/ksj/ に手で置けば同じように動く）
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class KsjSource:
    key: str
    title: str
    version: str
    page_url: str
    url_template: str  # {pref} を都道府県コードに置き換える
    inner_template: str  # zip の中の GeoJSON

    def url(self, pref: str) -> str:
        return self.url_template.format(pref=pref)

    def file_name(self, pref: str) -> str:
        return self.url(pref).rsplit("/", 1)[-1]

    def inner(self, pref: str) -> str:
        return self.inner_template.format(pref=pref)


POPULATION = KsjSource(
    key="population",
    title="500mメッシュ別将来推計人口（R6国政局推計）",
    version="R6国政局推計（m500r6-24）",
    page_url="https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-mesh500r6.html",
    url_template="https://nlftp.mlit.go.jp/ksj/gml/data/m500r6/m500r6-24/500m_mesh_2024_{pref}_GEOJSON.zip",
    inner_template="500m_mesh_2024_{pref}_GEOJSON/500m_mesh_2024_{pref}.geojson",
)

BUSSTOPS = KsjSource(
    key="busstops",
    title="バス停留所（2022年度）",
    version="P11-2022",
    page_url="https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P11-2022.html",
    url_template="https://nlftp.mlit.go.jp/ksj/gml/data/P11/P11-22/P11-22_{pref}_SHP.zip",
    inner_template="P11-22_{pref}_SHP/P11-22_{pref}.geojson",
)

BUSROUTES = KsjSource(
    key="busroutes",
    title="バスルート（2022年度）",
    version="N07-2022",
    page_url="https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N07-2022.html",
    url_template="https://nlftp.mlit.go.jp/ksj/gml/data/N07/N07-22/N07-22_{pref}_SHP.zip",
    inner_template="N07-22_{pref}_SHP/N07-22_{pref}.geojson",
)

ADMIN = KsjSource(
    key="admin",
    title="行政区域（2026年1月1日時点）",
    version="N03-2026",
    page_url="https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2026.html",
    url_template="https://nlftp.mlit.go.jp/ksj/gml/data/N03/N03-2026/N03-20260101_{pref}_GML.zip",
    inner_template="N03-20260101_{pref}.geojson",
)

ALL = (POPULATION, BUSSTOPS, BUSROUTES, ADMIN)
