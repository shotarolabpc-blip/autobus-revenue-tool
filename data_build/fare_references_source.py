"""運賃の参考データ（public/data/fare_references.json）を作る。

値はすべて、事業者・自治体・国土交通省（関東運輸局）の公式資料から確認したものだけ。推測で補わない。
資料が更新されたら、ここを書き換えて実行し直す。確認日は CHECKED_AT。

    .venv\\Scripts\\python data_build\\fare_references_source.py
"""

from __future__ import annotations

import json

from common import PUBLIC_DATA, setup_console

CHECKED_AT = "2026-10-14"
PREF = "13"
WARDS = [f"131{n:02d}" for n in range(1, 24)]  # 区部（特別区 13101〜13123）
# 市部（13201〜13229）。市区町村の一覧（国土数値情報の行政区域から作ったもの）に載っているコードだけを使う
_MUNICIPALITIES = {m["code"] for m in json.loads((PUBLIC_DATA / "municipalities" / "13.json").read_text(encoding="utf-8"))["items"]}
CITIES = [f"132{n:02d}" for n in range(1, 30) if f"132{n:02d}" in _MUNICIPALITIES]

KANTO = "https://wwwtb.mlit.go.jp/kanto/content"

# 種別（category）の分類基準（2026-10-15 決定）：
#   route      ＝路線バス。事業者が一般乗合旅客自動車運送事業として運行する通常の路線
#                （国土交通省・関東運輸局の認可・届出資料、事業者・東京都交通局の運賃表）
#   community  ＝コミュニティバス。**自治体が運行主体、または委託・補助して運行しているバス**
#                （自治体の公式資料で確認できるもの。呼び方は「循環バス」「ムーバス」などでもよい）。
#                根拠（運行主体・委託・補助が書かれた公式ページと、その文言）を categoryBasis に残す
#   autonomous ＝自動運転バス。資料に「自動運転バス」と書かれているもの
# 運行主体を公式資料で確認できなかったものは、推測で分類せず載せない（NOT_FOUND に記載）。
#
# コミュニティバスの参考データを当てはめる地域の単位（2026-10-15 決定）：
#   区が運行するバスは「区部（23区）の全区」、市が運行するバスは「市部（東京都の26市）の全市」で参考にする。
#   運行環境（人口密度・路線バスの密度）が近い単位で、市区町村ごとに分けると、データのない市区町村が増えるため。
#   町村・島しょのコミュニティバスの参考データは、まだ載せていない。
#   自動運転バスは事例が少ないため、都内全域で参考にする。
CATEGORIES = ("route", "community", "autonomous")


def src(title: str, url: str, quote: str | None = None) -> dict:
    d = {"title": title, "url": url, "checkedAt": CHECKED_AT}
    if quote:
        d["quote"] = quote
    return d


def basis(text: str, url: str) -> dict:
    """分類の根拠：運行主体・委託・補助が書かれた公式ページ（URL）と、その文言"""
    return {"text": text, "url": url}


def item(
    id_, kind, category, operator, fare_type, source, city_codes=None, flat=None, base=None, rate=None, note=None,
    category_basis=None,
):
    d = {
        "id": id_,
        "kind": kind,
        "category": category,
        "prefCode": PREF,
        "cityCodes": city_codes,
        "operator": operator,
        "fareType": fare_type,
        "flatFare": flat,
        "baseFare": base,
        "ratePerKm": rate,
        "source": source,
    }
    if note:
        d["note"] = note
    if category_basis:
        d["categoryBasis"] = category_basis
    return d


ITEMS = [
    # ---------------- 相場：実際に運行しているバスの運賃（大人・税込）
    item(
        "toei-23ku",
        "market",
        "route",
        "東京都交通局（都営バス）一般系統",
        "flat",
        src(
            "東京都交通局 バス 普通運賃（東京都オープンデータ）",
            "https://www.opendata.metro.tokyo.lg.jp/kotsu/bus_fare_ordinary_fare.csv",
            "一般系統,210円（IC 210円）,110円（IC 105円）",
        ),
        WARDS,
        flat=210,
        note="23区内は均一運賃（小児110円）",
    ),
    item(
        "kokusai-kogyo",
        "market",
        "route",
        "国際興業バス（東京都内）",
        "flat",
        src(
            "国際興業 運賃改定のお知らせ（2023年11月1日実施）",
            "https://kokusaikogyo.co.jp/cmswp/wp-content/uploads/2024/11/727_ext_01_0.pdf",
        ),
        flat=230,
        note="2023-11-01 の改定後の運賃（その後の改定は未確認）",
    ),
    item(
        "kanto-bus",
        "market",
        "route",
        "関東バス（都内均一）",
        "flat",
        src("関東運輸局 関東バス 乗合バス運賃の認可・届出（2024-03-01）", f"{KANTO}/000316336.pdf"),
        flat=230,
        note="2024-03-01 の改定後の運賃（その後の改定は未確認）",
    ),
    item(
        "tokyu-bus",
        "market",
        "route",
        "東急バス（都内・横浜均一）",
        "flat",
        src("関東運輸局 東急バス 乗合バス運賃の認可・届出（2024-03-24）", f"{KANTO}/000318588.pdf"),
        flat=230,
        note="2024-03-24 の改定後の運賃。2025年10月以降の都内の運賃は未確認",
    ),
    item(
        "seibu-bus",
        "market",
        "route",
        "西武バス（都内均一）",
        "flat",
        src("関東運輸局 西武バス 乗合バス運賃の認可・届出（2025-06-01）", f"{KANTO}/000348521.pdf"),
        flat=230,
        note="2025-06-01 の改定後の運賃（その後の改定は未確認）",
    ),
    item(
        "odakyu-bus",
        "market",
        "route",
        "小田急バス（都内・横浜均一）",
        "flat",
        src("関東運輸局 小田急バス 乗合バス運賃の認可・届出（2024-06-01）", f"{KANTO}/000324474.pdf"),
        flat=240,
        note="2024-06-01 の改定後の運賃（その後の改定は未確認）",
    ),
    item(
        "tobu-bus-central",
        "market",
        "route",
        "東武バスセントラル（特別区均一）",
        "flat",
        src(
            "東武バス 運賃改定のお知らせ（2025-08-02）",
            "https://www.tobu-bus.com/pc/topics/detail.html?key=21",
            "東京都内の均一運賃を２３０円→２５０円に変更",
        ),
        WARDS,
        flat=250,
    ),
    item(
        "keio-bus-23ku",
        "market",
        "route",
        "京王バス（都区内）",
        "flat",
        src("京王バス 運賃のご案内", "https://www.keio-bus.com/bus/fare/index.html"),
        WARDS,
        flat=230,
        note="掲載ページに更新日の記載なし。小児は現金120円・IC115円",
    ),
    # コミュニティバス（大人）。区のバスは区部の全区、市のバスは市部の全市で参考にする。
    # 市区町村コードは国土数値情報の行政区域の一覧と一致を確認
    item(
        "kita-kbus",
        "market",
        "community",
        "北区 K-バス",
        "flat",
        src(
            "北区 K-バス 運賃",
            "https://www.city.kita.lg.jp/living/transport/1002525/1002526.html",
            "料金100円（一律）",
        ),
        WARDS,
        flat=100,
        note="北区の運賃。区部のコミュニティバスの相場として、区部の全区で参考にする",
        category_basis=basis(
            "北区の公式ページの見出し「北区コミュニティバス「Kバス」のご案内」",
            "https://www.city.kita.lg.jp/living/transport/1002525/1002526.html",
        ),
    ),
    item(
        "taito-megurin",
        "market",
        "community",
        "台東区 めぐりん",
        "flat",
        src(
            "台東区 めぐりん 運賃",
            "https://www.city.taito.lg.jp/kenchiku/kotsu/megurin/gaiyou/ryoukin/index.html",
        ),
        WARDS,
        flat=100,
        note="台東区の運賃（大人・小児とも100円）。区部のコミュニティバスの相場として、区部の全区で参考にする。運賃のページに更新日の記載なし。分類の根拠は間接的（根拠の欄を参照）",
        category_basis=basis(
            "台東区地域公共交通会議のページに「台東区では、地域のニーズに応じたコミュニティバスを運行するために」とあり、同じページで台東区循環バス「めぐりん」が議題の対象。めぐりんをコミュニティバスと明記した文はなく、この読み取りは間接的",
            "https://www.city.taito.lg.jp/kenchiku/kotsu/megurin/koukyoukoutsukaigi.html",
        ),
    ),
    item(
        "sumida-hyakkei",
        "market",
        "community",
        "墨田区 すみだ百景",
        "flat",
        src(
            "墨田区 すみだ百景 運賃",
            "https://www.city.sumida.lg.jp/kurashi/jyunkanbus/gaiyou/unchin.html",
        ),
        WARDS,
        flat=100,
        note="墨田区の運賃（大人〈中学生以上〉100円・小学生50円）。区部のコミュニティバスの相場として、区部の全区で参考にする。基本運賃を200円に改定予定（令和9年度以降）",
        category_basis=basis(
            "墨田区の公式ページに「区が事業費を補助しているコミュニティバス」「区は収支不足額を補助しています」とあり、運行事業者は京成バス",
            "https://www.city.sumida.lg.jp/matizukuri/koutu/busminaosi/bus_minaoshi.html",
        ),
    ),
    item(
        "bunkyo-bgru",
        "market",
        "community",
        "文京区 B-ぐる",
        "flat",
        src(
            "文京区 B-ぐる 運賃",
            "https://www.city.bunkyo.lg.jp/b011/p001060.html",
            "大人 こども 各100円",
        ),
        WARDS,
        flat=100,
        note="文京区の運賃。区部のコミュニティバスの相場として、区部の全区で参考にする",
        category_basis=basis(
            "文京区の公式ページの見出し「文京区コミュニティバス「Bーぐる」のご案内」",
            "https://www.city.bunkyo.lg.jp/b011/p001060.html",
        ),
    ),
    item(
        "minato-chiibus",
        "market",
        "community",
        "港区 ちぃばす",
        "flat",
        src(
            "港区 ちぃばす 運賃",
            "https://www.city.minato.tokyo.jp/koutsuutaisaku/kankyo-machi/kotsu/bus/unchin.html",
            "路線を乗り継ぐ場合は、それぞれの路線で100円です。",
        ),
        WARDS,
        flat=100,
        note="港区の運賃（小学生以上100円）。区部のコミュニティバスの相場として、区部の全区で参考にする",
        category_basis=basis(
            "港区の公式ページに「港区コミュニティバス「ちぃばす」」とあり、運行事業者は株式会社フジエクスプレス",
            "https://www.city.minato.tokyo.jp/koutsuutaisaku/kankyo-machi/kotsu/bus/unchin.html",
        ),
    ),
    item(
        "shibuya-hachiko",
        "market",
        "community",
        "渋谷区 ハチ公バス",
        "flat",
        src(
            "渋谷区 ハチ公バス について",
            "https://www.city.shibuya.tokyo.jp/kurashi/kotsu/hachiko/hachiko_about.html",
            "大人・子供同額1乗車“ワンコイン”の100円",
        ),
        WARDS,
        flat=100,
        note="渋谷区の運賃。区部のコミュニティバスの相場として、区部の全区で参考にする",
        category_basis=basis(
            "渋谷区の公式ページでハチ公バスをコミュニティバスとして紹介。区が運行（東急バス・京王バスが路線を担当）",
            "https://www.city.shibuya.tokyo.jp/kurashi/kotsu/hachiko/hachiko_about.html",
        ),
    ),
    item(
        "musashino-mubus",
        "market",
        "community",
        "武蔵野市 ムーバス",
        "flat",
        src(
            "武蔵野市 ムーバス 運賃",
            "https://www.city.musashino.lg.jp/kurashi_tetsuzuki/bus_churin_chusha_kotsuanzen/mubus/1005137.html",
            "100円(未就学児は無料)",
        ),
        CITIES,
        flat=100,
        note="武蔵野市の運賃。市部のコミュニティバスの相場として、市部の全市で参考にする",
        category_basis=basis(
            "武蔵野市の公式ページに「ムーバスの運転士に対して住宅手当を月1万5,000円補助します。」とあり、市がムーバスの運行を補助している。運行事業者の名前、「コミュニティバス」という呼び方は、このページにはない",
            "https://www.city.musashino.lg.jp/kurashi_tetsuzuki/bus_churin_chusha_kotsuanzen/mubus/1054082.html",
        ),
    ),
    # 自動運転バス
    item(
        "keio-nishishinjuku-autonomous",
        "market",
        "autonomous",
        "京王バス 西新宿の自動運転バス（レベル2）",
        "flat",
        src("京王バス 自動運転バス", "https://www.keio-bus.com/jidounten/"),
        None,
        flat=190,
        note="新宿区（西新宿）の事例。東京都内の自動運転バスの運賃の例として、都内全域で参考にする。大人190円（IC）・小児95円（IC）。ページに更新日の記載なし",
    ),
    # ---------------- 上限運賃：運行事業者が国から認可を受けた額（税込）
    item(
        "limit-kokusai-kogyo",
        "upperLimit",
        "route",
        "国際興業バス（東京都内・均一）",
        "flat",
        src(
            "国際興業 運賃改定のお知らせ（認可 2023-10-03）",
            "https://kokusaikogyo.co.jp/cmswp/wp-content/uploads/2024/11/727_ext_01_0.pdf",
        ),
        flat=240,
        note="認可日 2023-10-03",
    ),
    item(
        "limit-kanto-bus",
        "upperLimit",
        "route",
        "関東バス（都内均一）",
        "flat",
        src(
            "関東運輸局 関東バス 乗合バス運賃の認可（2024-03-01 実施）",
            f"{KANTO}/000316336.pdf",
            "均一制：240 円",
        ),
        flat=240,
    ),
    item(
        "limit-tokyu-bus",
        "upperLimit",
        "route",
        "東急バス（都内・横浜均一）",
        "flat",
        src(
            "関東運輸局 東急バス 乗合バス運賃の認可（2024-03-24 実施）",
            f"{KANTO}/000318588.pdf",
            "均一制：250 円",
        ),
        flat=250,
    ),
    item(
        "limit-seibu-bus",
        "upperLimit",
        "route",
        "西武バス（都内均一）",
        "flat",
        src(
            "関東運輸局 西武バス 乗合バス運賃の認可（2025-06-01 実施）",
            f"{KANTO}/000348521.pdf",
            "均一制：250 円",
        ),
        flat=250,
    ),
    item(
        "limit-odakyu-bus",
        "upperLimit",
        "route",
        "小田急バス（都内・横浜均一）",
        "flat",
        src(
            "関東運輸局 小田急バス 乗合バス運賃の認可（2024-06-01 実施）",
            f"{KANTO}/000324474.pdf",
            "均一制：250 円",
        ),
        flat=250,
    ),
    item(
        "limit-keio-bus",
        "upperLimit",
        "route",
        "京王バス（都内〈京浜〉均一）",
        "flat",
        src(
            "国土交通省 京王電鉄バス 乗合バス運賃の上限運賃の認可（2023-03-10）",
            "https://www.mlit.go.jp/report/press/jidosha03_hh_000379.html",
        ),
        flat=240,
        note="認可日 2023-03-10",
    ),
    item(
        "limit-tobu-bus-central",
        "upperLimit",
        "route",
        "東武バスセントラル（特別区均一）",
        "flat",
        src("関東運輸局 東武バスセントラル 乗合バス運賃の認可（2023-06-13）", f"{KANTO}/000297473.pdf"),
        WARDS,
        flat=240,
        note="認可日 2023-06-13。2025年の改定後の上限は未確認",
    ),
    item(
        "limit-keio-bus-tama",
        "upperLimit",
        "route",
        "京王バス（多摩・対キロ区間制）",
        "distance",
        src(
            "関東運輸局 京王バス 乗合バス運賃の認可（2023-08-10）",
            f"{KANTO}/000301179.pdf",
            "対キロ区間制運賃：初乗運賃 230 円、基準賃率 46 円 10 銭",
        ),
        base=230,
        rate=46.1,
        note="多摩地域の路線。実施運賃は初乗り200円（2023-09-16 から）",
    ),
    item(
        "limit-seibu-bus-tama",
        "upperLimit",
        "route",
        "西武バス（多摩・対キロ区間制）",
        "distance",
        src(
            "関東運輸局 西武バス 乗合バス運賃の認可（2026-04-28）",
            f"{KANTO}/000372251.pdf",
            "初乗運賃 240 円、基準賃率 35 円 00 銭",
        ),
        base=240,
        rate=35.0,
        note="実施運賃は初乗り200円（2026-07-01 から）",
    ),
]

NOT_FOUND = [
    "東急バスの都内の運賃（2025年10月の改定後）",
    "三鷹市・調布市・日野市などのコミュニティバスの運賃（調べていません）",
    "羽田イノベーションシティの自動運転バスの運賃（公式資料に記載なし。運行は休止中）",
    "対キロ区間制の「相場」（初乗り運賃と賃率の両方を確認できた実施運賃がないため、対キロ区間制の「標準」は提案できません）",
    "乗合バスの「標準的な運賃」（国土交通省の公示はタクシー・トラック・貸切バスのみで、乗合バスにはありません）",
    "足立区の自動運転バス（大人230円・小児120円）は計画段階のため、参考にしていません",
]

NOTICE = (
    "運賃の参考データは、事業者・自治体・国土交通省（関東運輸局）の公式資料から確認できたものだけを載せています。"
    "「相場」は確認日時点で資料に載っていた実施運賃で、その後に改定されている場合があります。"
    "「上限運賃」は事業者ごとに認可された額で、実施運賃とは別です。"
    "実際の運賃は、運行事業者・自治体・協議会と調整して決めてください。"
)


def main() -> None:
    setup_console()
    path = PUBLIC_DATA / "fare_references.json"
    path.write_text(
        json.dumps(
            {"checkedAt": CHECKED_AT, "notice": NOTICE, "notFound": NOT_FOUND, "items": ITEMS},
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
        newline="\n",
    )
    n_market = sum(i["kind"] == "market" for i in ITEMS)
    print(f"{path.name}: {len(ITEMS)} 件（相場 {n_market}、上限運賃 {len(ITEMS) - n_market}）")


if __name__ == "__main__":
    main()
