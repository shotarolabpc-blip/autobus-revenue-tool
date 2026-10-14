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
WARDS = [f"131{n:02d}" for n in range(1, 24)]  # 特別区（13101〜13123）

KANTO = "https://wwwtb.mlit.go.jp/kanto/content"


def src(title: str, url: str, quote: str | None = None) -> dict:
    d = {"title": title, "url": url, "checkedAt": CHECKED_AT}
    if quote:
        d["quote"] = quote
    return d


def item(id_, kind, operator, fare_type, source, city_codes=None, flat=None, base=None, rate=None, note=None):
    d = {
        "id": id_,
        "kind": kind,
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
    return d


ITEMS = [
    # ---------------- 相場：実際に運行しているバスの運賃（大人・税込）
    item(
        "toei-23ku",
        "market",
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
        "関東バス（都内均一）",
        "flat",
        src("関東運輸局 関東バス 乗合バス運賃の認可・届出（2024-03-01）", f"{KANTO}/000316336.pdf"),
        flat=230,
        note="2024-03-01 の改定後の運賃（その後の改定は未確認）",
    ),
    item(
        "tokyu-bus",
        "market",
        "東急バス（都内・横浜均一）",
        "flat",
        src("関東運輸局 東急バス 乗合バス運賃の認可・届出（2024-03-24）", f"{KANTO}/000318588.pdf"),
        flat=230,
        note="2024-03-24 の改定後の運賃。2025年10月以降の都内の運賃は未確認",
    ),
    item(
        "seibu-bus",
        "market",
        "西武バス（都内均一）",
        "flat",
        src("関東運輸局 西武バス 乗合バス運賃の認可・届出（2025-06-01）", f"{KANTO}/000348521.pdf"),
        flat=230,
        note="2025-06-01 の改定後の運賃（その後の改定は未確認）",
    ),
    item(
        "odakyu-bus",
        "market",
        "小田急バス（都内・横浜均一）",
        "flat",
        src("関東運輸局 小田急バス 乗合バス運賃の認可・届出（2024-06-01）", f"{KANTO}/000324474.pdf"),
        flat=240,
        note="2024-06-01 の改定後の運賃（その後の改定は未確認）",
    ),
    item(
        "tobu-bus-central",
        "market",
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
        "京王バス（都区内）",
        "flat",
        src("京王バス 運賃のご案内", "https://www.keio-bus.com/bus/fare/index.html"),
        WARDS,
        flat=230,
        note="掲載ページに更新日の記載なし。小児は現金120円・IC115円",
    ),
    # コミュニティバス（大人。市区町村コードは国土数値情報の行政区域の一覧と一致を確認）
    item(
        "kita-kbus",
        "market",
        "北区 K-バス",
        "flat",
        src(
            "北区 K-バス 運賃",
            "https://www.city.kita.lg.jp/living/transport/1002525/1002526.html",
            "料金100円（一律）",
        ),
        ["13117"],
        flat=100,
    ),
    item(
        "taito-megurin",
        "market",
        "台東区 めぐりん",
        "flat",
        src(
            "台東区 めぐりん 運賃",
            "https://www.city.taito.lg.jp/kenchiku/kotsu/megurin/gaiyou/ryoukin/index.html",
        ),
        ["13106"],
        flat=100,
        note="大人・小児とも100円。ページに更新日の記載なし",
    ),
    item(
        "sumida-hyakkei",
        "market",
        "墨田区 すみだ百景",
        "flat",
        src(
            "墨田区 すみだ百景 運賃",
            "https://www.city.sumida.lg.jp/kurashi/jyunkanbus/gaiyou/unchin.html",
        ),
        ["13107"],
        flat=100,
        note="大人（中学生以上）100円・小学生50円。基本運賃を200円に改定予定（令和9年度以降）",
    ),
    item(
        "bunkyo-bgru",
        "market",
        "文京区 B-ぐる",
        "flat",
        src(
            "文京区 B-ぐる 運賃",
            "https://www.city.bunkyo.lg.jp/b011/p001060.html",
            "大人 こども 各100円",
        ),
        ["13105"],
        flat=100,
    ),
    item(
        "minato-chiibus",
        "market",
        "港区 ちぃばす",
        "flat",
        src(
            "港区 ちぃばす 運賃",
            "https://www.city.minato.tokyo.jp/koutsuutaisaku/kankyo-machi/kotsu/bus/unchin.html",
            "路線を乗り継ぐ場合は、それぞれの路線で100円です。",
        ),
        ["13103"],
        flat=100,
        note="小学生以上100円",
    ),
    item(
        "shibuya-hachiko",
        "market",
        "渋谷区 ハチ公バス",
        "flat",
        src(
            "渋谷区 ハチ公バス について",
            "https://www.city.shibuya.tokyo.jp/kurashi/kotsu/hachiko/hachiko_about.html",
            "大人・子供同額1乗車“ワンコイン”の100円",
        ),
        ["13113"],
        flat=100,
    ),
    item(
        "musashino-mubus",
        "market",
        "武蔵野市 ムーバス",
        "flat",
        src(
            "武蔵野市 ムーバス 運賃",
            "https://www.city.musashino.lg.jp/kurashi_tetsuzuki/bus_churin_chusha_kotsuanzen/mubus/1005137.html",
            "100円(未就学児は無料)",
        ),
        ["13203"],
        flat=100,
    ),
    # 自動運転バス
    item(
        "keio-nishishinjuku-autonomous",
        "market",
        "京王バス 西新宿の自動運転バス（レベル2）",
        "flat",
        src("京王バス 自動運転バス", "https://www.keio-bus.com/jidounten/"),
        ["13104"],
        flat=190,
        note="大人190円（IC）・小児95円（IC）。ページに更新日の記載なし",
    ),
    # ---------------- 上限運賃：運行事業者が国から認可を受けた額（税込）
    item(
        "limit-kokusai-kogyo",
        "upperLimit",
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
