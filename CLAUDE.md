# CLAUDE.md — 自動運転バス 収入予測Webツール

このファイルはClaude Codeが毎回読み込む前提のルール集です。要件の詳細は `docs/requirements.md`（要件定義書 v0.5）にあります。

## 必ず守ること
1. 作業前に `docs/requirements.md` の該当箇所を読む。 要件IDで指示された場合（例：F-2-5a）は、その行と関連する節を確認してから実装する。
2. サーバー処理・データベース・バックエンドAPIを追加しない。 成果物は静的ファイルだけで動き、GitHub Pagesで公開する。
3. ユーザーの入力データを外部へ送信しない。 外部への通信は、地図タイルの取得と、このサイト自身の静的データの取得だけにする。アクセス解析も入れない。
4. 係数・初期値をコードに直書きしない。 値は `public/data/coefficients.json` などの設定ファイルに置き、各値に「出典」「調査年」を持たせる。根拠が分からない数値は勝手に決めない。 必要なときは `TODO(根拠未確定)` と書き、私に確認する。
5. 出典表示を省略しない。 地理院タイル、国土数値情報（CC BY 4.0）、© OpenStreetMap contributors（ODbL）、全国都市交通特性調査、車両スペックの出典を、画面と出力物に表示する。
6. 計算ロジックは `src/calc` に純粋関数で書き、テスト（Vitest）を必ず付ける。 UIから計算ロジックを直接書かない。
7. プロジェクトファイルの形式を変えたら `schemaVersion` を上げ、`src/project/migrations` に変換処理を追加する。
8. 全都道府県に拡張できる作りにする。 都道府県コード（JIS X 0401、2桁）を引数にとり、東京都（13）専用の分岐を書かない。
9. GitHub Pagesの制約を守る。 公開サイトは合計1GB以下、1ファイル100MB未満。Git LFSのファイルはPagesで配信されないので使わない。
10. 全ページに `<meta name="robots" content="noindex, nofollow">` を入れる。 robots.txtでクロールを禁止しない。サイトマップを作らない。

## 技術構成
- React + TypeScript + Vite（静的ビルド）。ルーティングはハッシュ方式（GitHub Pagesで404にならないように）
- 地図：MapLibre GL JS ／ GIS計算：Turf.js ／ グラフ：Recharts または ECharts
- 入力検証・型：Zod ／ 一時保存：IndexedDB（idb-keyval 等）
- Excel出力：ExcelJS または SheetJS（ブラウザ内で生成）
- 経路計算：事前加工した道路網タイルを Web Worker で読み込み、ブラウザ内で計算
- データ加工：Python（`data_build`）。GitHub Actions で実行
- テスト：Vitest（計算・プロジェクトファイル）、Playwright（主要な操作の確認）

## ディレクトリ
```
docs/requirements.md       要件定義書
src/calc/                  需要推計・運賃・収入（純粋関数＋テスト）
src/gis/                   勢圏・面積按分・スナップ
src/routing/               経路計算（Web Worker）
src/project/               プロジェクトファイルのスキーマ・読込・保存・移行
src/export/                CSV / xlsx / PNG
src/components/ src/pages/ 画面
public/data/               配信する静的データ（生成物）
data_build/                データ加工スクリプト（Python）
data_raw/                  手動で置く元データ（.gitignore 対象）
.github/workflows/         データ加工・ビルド・Pages公開
```

## 作業の進め方
- 大きな作業は、まず計画（変更するファイル、手順、確認方法）を示してから実装する。
- 1つの依頼が終わったら、テストを実行し、結果と「私が画面で確認すべきこと」を箇条書きで報告する。
- 元データのダウンロードにログインや利用規約への同意が必要な場合は、自動取得せずに、私が手で置く場所（`data_raw`）と手順を伝える。
- 仕様が要件定義書と矛盾する、または書かれていない場合は、推測で進めずに質問する。
