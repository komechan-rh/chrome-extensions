# GitHub PR Viewed Sync

GitHub の Pull Request「Files changed」画面で `Viewed` にしたファイルを、**左サイドバーのファイルツリーにも視覚的に表示する** Chrome 拡張です。

レビュー中に「どのファイルを見終わったか」がツリー側だけを見て分かるようになります。

## 概要

- diff 側の `Viewed` チェックボックスの状態を監視し、左ファイルツリーの対応する項目へ反映する
- 反映内容: 対象項目を薄く表示（`opacity`）＋ チェックアイコン `✓` の追加
  - アイコンは `<span role="img" aria-label="Reviewed" title="Reviewed">✓</span>` として挿入し、擬似要素だけに依存しない
  - 色は Primer の CSS 変数（`--fgColor-success`）を使うため、ライト／ダークどちらのテーマでも視認できる
- ページを開いた時点で既に `Viewed` のファイルも初期同期する
- `Viewed` を外すとツリー側の表示も消える
- GitHub の SPA 遷移（Turbo / soft nav）・ツリーの遅延レンダリング・diff の追加読み込みに追従して再初期化する
- diff 側とツリー側の対応付けは**完全なファイルパス**で行うため、`src/components/index.ts` と `src/pages/index.ts` のような同名ファイルを誤判定しない
- content script のみで完結（React・popup・設定画面・権限要求なし）

## 対応 URL

同期が動作するのは PR の Files changed 画面のみです。従来 UI と新レビュー UI の両方に対応します。

```text
https://github.com/*/*/pull/*/files      # 従来 UI
https://github.com/*/*/pull/*/changes    # 新レビュー UI
```

content script 自体は `https://github.com/*` に注入されます。これは GitHub が SPA（Turbo）遷移するため、Conversation タブから Files changed タブへ移動しただけでは Chrome が content script を再注入しないためです。注入後、URL が上記パターンに一致するときだけ同期を開始し、離れると監視を解除して付与した表示も取り除きます。

## 技術構成

- Chrome Extension Manifest V3
- TypeScript（strict / `noUncheckedIndexedAccess`）
- Vite（content script は ESM 不可のため IIFE 単一ファイルへバンドル）
- MutationObserver
- oxlint
- Vitest + jsdom
- パッケージマネージャ: pnpm

## セットアップ

```bash
cd github-viewed-sync
pnpm install
```

> [!NOTE]
> `pnpm` を使います。未インストールの場合は `corepack enable pnpm` などで用意してください。

## 開発方法

```bash
pnpm dev         # dist を watch ビルド（変更後に chrome://extensions で拡張をリロード）
pnpm typecheck   # 型チェック
pnpm lint        # oxlint
pnpm lint:fix    # oxlint --fix
pnpm test        # Vitest（jsdom）
pnpm test:watch  # Vitest watch
```

### デバッグログ

通常時はコンソールへ何も出しません。調査したいときだけ GitHub のページの DevTools コンソールで有効化します。

```js
localStorage.setItem('github-viewed-sync:debug', '1'); // 有効化（ページ再読み込み不要）
localStorage.removeItem('github-viewed-sync:debug'); // 無効化
```

ビルド時に固定で有効化したい場合は `src/content/debug.ts` の `const DEBUG = false;` を `true` にします。

## ビルド方法

```bash
pnpm build
```

`dist/` に以下が出力されます。

```text
dist/
  manifest.json
  content.js
  content.css
```

## Chrome への読み込み方法

```text
1. pnpm install
2. pnpm build
3. chrome://extensions を開く
4. デベロッパーモードを有効化
5. 「パッケージ化されていない拡張機能を読み込む」から dist を選択
```

npm を使う場合は `npm install` / `npm run build` でも同じ成果物が得られます（リポジトリのロックファイルは pnpm 用です）。

## 動作確認手順

1. 上記手順で `dist` を読み込む
2. 任意の PR の Files changed 画面を開く（ファイルツリーが表示されるよう、ウィンドウ幅は広めにする）
3. **初期同期**: 既に `Viewed` のファイルがあれば、ツリー側でも薄く表示され `✓` が付いていることを確認する
4. **オン**: 任意のファイルの `Viewed` にチェックを入れる → ツリーの対応ファイルに即座に `✓` が付く
5. **オフ**: 同じファイルの `Viewed` を外す → ツリーの `✓` と薄い表示が消える
6. **同名ファイル**: 別ディレクトリの同名ファイル（例 `src/components/index.ts` と `src/pages/index.ts`）を含む PR で、チェックしたファイルだけに `✓` が付くことを確認する
7. **SPA 遷移**: Conversation タブ → Files changed タブへ切り替えても同期されることを確認する
8. **PR 間遷移**: 別の PR の Files changed へ移動しても同期されることを確認する
9. **追加読み込み**: 数百ファイルの PR を下までスクロールし、遅延読み込みされた diff の `Viewed` もツリーへ反映されることを確認する
10. **テーマ**: ライト／ダークの両テーマで `✓` が視認できることを確認する

## ファイル構成

```text
github-viewed-sync/
  manifest.json              # MV3 マニフェスト（ビルド時に dist へコピー）
  vite.config.ts             # IIFE ビルド設定 + manifest コピー
  vitest.config.ts           # jsdom 環境設定
  .oxlintrc.json             # oxlint 設定
  src/
    content/
      index.ts               # エントリ（多重注入ガード → watcher 起動）
      navigation.ts          # SPA 遷移検知と再初期化（start / stop / 再同期）
      github-pr-review.ts    # MutationObserver 管理・debounce・差分適用
      viewed-state.ts        # diff 側の Viewed 状態収集（純関数）
      file-tree.ts           # ツリーのパス解決とレビュー済み表示の付与／削除
      file-path.ts           # パス正規化・アンカー ID 正規化（純関数）
      dom-selectors.ts       # GitHub DOM 依存（セレクタ・属性）の集約点
      debug.ts               # デバッグログ切り替え
    styles/
      content.css            # レビュー済み表示のスタイル
    types/
      github.ts              # 抽出結果の型
      assets.d.ts            # CSS import の型宣言
    test/
      fixtures.ts            # GitHub PR 画面の DOM モック
```

## 仕組み

1. `navigation.ts` が SPA 遷移を検知し、対象 URL のときだけ `github-pr-review.ts` のコントローラを `start()` する
   - GitHub の DOM イベント（`turbo:load` / `turbo:render` / `turbo:frame-render` / `soft-nav:end` など）
   - `popstate` / `pageshow`
   - Navigation API（利用可能な場合）
   - `location.href` の軽量ポーリング（500ms、文字列比較のみ）
   - content script は分離ワールドで動くため、ページ側の `history.pushState` をラップしても検知できません。そのため上記を併用しています
2. コントローラが diff コンテナとファイルツリーコンテナへ個別に `MutationObserver` を張る（同じ要素には再登録しない）
3. `viewed-state.ts` が diff 側を走査して `Map<完全パス, boolean>` を作る
4. 前回状態との差分を取り、**変化したファイルの項目だけ** `file-tree.ts` で更新する
5. ツリーが再描画された場合はインデックスを作り直して全項目へ再適用する（付与処理は冪等）

### パフォーマンス上の工夫

- observer のコールバックは debounce（diff/ツリー 100ms、コンテナ検知 250ms）。`Viewed` のクリックだけは即時反映
- 走査対象は diff / ツリーのコンテナ配下に限定し、`document` 全体をフルスキャンしない
- 定常状態では前回状態との差分のみ DOM 更新（数百ファイルでも触る要素は変化分だけ）
- パス → 要素は `Map`、パス集合は `Set` で管理
- アイコンは `data-gh-viewed-badge` 属性で存在確認するため重複挿入しない
- 自分が挿入・削除したアイコンによる mutation は無視してループを防ぐ
- 停止時（対象外画面へ遷移時）に observer を解除し、付与した表示も撤去する

## GitHub の DOM に依存している箇所

すべて `src/content/dom-selectors.ts` に集約しています。他のファイルは属性名・セレクタを直接書きません。

| 用途 | 定数 | 依存している主な属性 |
| --- | --- | --- |
| diff 一覧のルート | `DIFF_CONTAINER_SELECTORS` | `[data-testid="diff-view"]` / `#files` / `main` |
| diff の 1 ファイル | `DIFF_FILE_SELECTORS` | `[data-tagsearch-path]` / `[data-file-path]` |
| ファイルパス | `DIFF_FILE_PATH_ATTRIBUTES`, `DIFF_FILE_PATH_TEXT_SELECTORS`, `DIFF_FILE_PATH_DEEP_SOURCES`, `DIFF_FILE_PATH_LABEL_PATTERN` | `data-tagsearch-path` / `data-file-path` / `data-clipboard-text` / `title` / `aria-label` |
| Viewed トグル | `VIEWED_CONTROL_SELECTORS`, `VIEWED_CONTROL_HOST_SELECTOR`, `VIEWED_LABEL_TEXT` | `input[name="viewed"]` / `.js-reviewed-checkbox` / `button[aria-label="Viewed"]` / ラベル文字列 `Viewed` |
| Viewed の ON/OFF | `VIEWED_STATE_ATTRIBUTES`, `VIEWED_FILE_ATTRIBUTE` | `input.checked` / `aria-checked` / `aria-pressed` / `data-file-user-viewed` |
| ファイルツリーのルート | `TREE_CONTAINER_SELECTORS` | `[data-testid="file-tree"]` / `#repos-file-tree` / `[aria-label="File Tree"]` / `[role="tree"]` |
| ツリー項目 | `TREE_ITEM_SELECTORS`, `TREE_ENTRY_TYPE_ATTRIBUTE` | `[role="treeitem"]` / `data-tree-entry-type` |
| ツリー項目のパス | `TREE_ITEM_PATH_ATTRIBUTES`, `TREE_ITEM_LABEL_SELECTORS` | `data-file-path` / **treeitem の `id`（新 UI では完全パス）** / 表示ラベル＋祖先ディレクトリ名 |
| diff アンカー | `TREE_ITEM_DIFF_LINK_SELECTOR`, `DIFF_ANCHOR_ID_PREFIX` | `a[href*="#diff-"]` / `id="diff-…"` |
| 対象 URL | `PR_FILES_PATHNAME_PATTERN` | `/{owner}/{repo}/pull/{number}/(files\|changes)` |

各定数は**候補の配列**で、前から順に試して最初にヒットしたものだけを採用します（新旧 UI の両方をカバーするため）。

### 2 系統の収集方式

新レビュー UI では「ファイルコンテナに完全パスがある」という前提が成り立たないため、次の 2 方式を併用し結果をマージしています。

1. **コンテナ起点**（従来 UI）: `DIFF_FILE_SELECTORS` でファイル要素を列挙し、中の Viewed トグルを読む
2. **トグル起点**（新 UI）: Viewed トグルを列挙し、そこから祖先を遡って「隣のファイルのトグルを含まない範囲」でパスを探す
   - パスの探索順: 子孫の `data-file-path` 等 → `title`（`/` を含むものだけ）→ `aria-label` の `… : <path>` 形式
   - どれも取れない場合は `#diff-<hash>` アンカー ID をキーにしてツリーと対応付ける（疑似キー `#diff-…`）
   - 解決結果は `WeakMap` にキャッシュし、同期ごとの再探索を避ける

## GitHub の DOM 変更時に確認する箇所

デバッグログを有効化すると、起動 1.5 秒後に**診断レポート**がコンソールへ出ます。どのセレクタが 0 件か、Viewed トグルの実体・属性・祖先、ツリー項目の構造が 1 回でまとめて確認できます。まずこれを見てください。

さらに次の順で切り分けます。

1. **コンテナが取れているか**
   - `document.querySelector('#files')` / `document.querySelector('[data-testid="file-tree"]')` が取れるか
   - 取れない → `DIFF_CONTAINER_SELECTORS` / `TREE_CONTAINER_SELECTORS` を更新
2. **diff の 1 ファイル要素とパスが取れているか**
   - `document.querySelectorAll('[data-tagsearch-path]').length` が 0 なら `DIFF_FILE_SELECTORS` と `DIFF_FILE_PATH_ATTRIBUTES` を更新
3. **Viewed トグルが取れているか**
   - 診断レポートの `viewed controls:` の `count` が 0 なら `VIEWED_CONTROL_SELECTORS` / `VIEWED_CONTROL_HOST_SELECTOR` を更新
   - `state=null` になっている場合は ON/OFF の在り処が変わっている。レポートに出るトグルの属性を見て `VIEWED_STATE_ATTRIBUTES` を更新
4. **ツリー項目とパス解決**
   - `✓` が付かない／別ファイルに付く場合はパス解決を疑う。ツリー項目には `data-gh-viewed-path` に解決結果が入るので、DevTools で実際の値を確認する
   - ズレている → `TREE_ITEM_PATH_ATTRIBUTES` / `TREE_ITEM_LABEL_SELECTORS` / `TREE_ENTRY_TYPE_ATTRIBUTE` を更新
5. **SPA 遷移で初期化されない**
   - `navigation.ts` の `DOCUMENT_NAVIGATION_EVENTS` に GitHub の新しいイベント名を追加する（最終的には URL ポーリングが拾うため、まず遅延の有無を確認）

## セレクタを修正する方法

1. `src/content/dom-selectors.ts` の該当定数の**先頭**に新しいセレクタを追加する（既存の候補は後方互換のため残す）

   ```ts
   export const TREE_CONTAINER_SELECTORS = [
     '[data-testid="new-file-tree"]', // ← 追加
     '[data-testid="file-tree"]',
     '#repos-file-tree',
     // ...
   ] as const;
   ```

2. `src/test/fixtures.ts` の DOM モックを実際の HTML に合わせて更新する（DevTools で対象要素を「Copy outerHTML」して構造を確認するのが早い）
3. `pnpm test` で回帰がないか確認する
4. `pnpm build` して Chrome で再読み込みし、実画面で確認する

DOM 解析は `viewed-state.ts` / `file-tree.ts` / `file-path.ts` の純関数に寄せてあるため、セレクタ更新の影響範囲は基本的にこの 3 ファイルとテストに収まります。

## テスト

```bash
pnpm test
```

`jsdom` 上に PR 画面のモック（`src/test/fixtures.ts`）を構築して検証しています。カバーしている観点:

1. diff 側から Viewed 済みファイルパスを取得できる
2. 同名ファイルを完全パスで区別できる
3. Viewed オン時にツリーへクラスとアイコンが追加される
4. Viewed オフ時に表示が削除される
5. 再実行してもアイコンが重複しない
6. ファイルツリーが後から追加されても同期される
7. GitHub のページ遷移後に再初期化される

加えて、`checked` 属性ではなくプロパティで判定していること、リネーム表示（`old → new`）の扱い、diff の追加読み込み、ツリー再描画、`stop()` 後のクリーンアップ、`popstate` 追従なども検証しています。

## 制約

- content script は `https://github.com/*` に注入されます（SPA 遷移に追従するため）。権限（`permissions`）は一切要求せず、同期処理は Files changed 画面以外では動きません。注入範囲を狭めると「リポジトリ画面 → PR」のようなソフトナビゲーションで注入されず動作しなくなります
- 新レビュー UI（`/changes`）では diff が遅延描画されるため、**まだ描画されていないファイルには ✓ が付きません**（スクロールして描画されると反映されます）。Viewed 状態の取得元が DOM のみである以上の制約です
- デバッグフラグは github.com オリジンの `localStorage` に保存します（`chrome.storage` を使わないため権限が不要）。既定では読み取りのみで、書き込みは利用者が明示的に有効化したときだけです
- GitHub Enterprise Server（独自ドメイン）は対象外です。使う場合は `manifest.json` の `matches` にドメインを追加してください
- ファイルツリーが表示されていない場合（ウィンドウ幅が狭い、ツリーを閉じている等）は反映先が無いため何も起きません。ツリーを開くと同期されます
- 表示は DOM への付与のみで、`Viewed` の状態自体は GitHub 側の管理に従います（拡張は状態を保存しません）
- ツリー項目のパスは、`data-*` 属性が無い UI では「表示ラベル＋祖先ディレクトリ名」から組み立てます。ラベルが省略表示（中略）される UI になった場合は誤対応の可能性があるため、`data-gh-viewed-path` で解決結果を確認してください
- 拡張アイコン画像は同梱していません（機能に影響はありません）
- 現状ユーザー設定 UI はありません（デバッグログのみ localStorage で切り替え）
