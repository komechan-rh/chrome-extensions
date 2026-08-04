/**
 * GitHub の DOM 依存はこのファイルに集約する。
 * GitHub 側の HTML 変更で拡張が動かなくなったら、まずここのセレクタ／属性定義を見直す。
 *
 * 優先順位の方針:
 *   1. data-* 属性
 *   2. aria-* 属性 / role
 *   3. id など安定した属性
 *   4. semantic な要素構造
 *   5. class 名（最後の手段。難読化されうるため単独では頼らない）
 *
 * 各定数は「候補の配列」で、前から順に試して最初にヒットしたものを採用する。
 * GitHub が新旧 2 種類の Files changed UI を出し分けるため、両方を並べている。
 */

/** diff 一覧（Files changed 本体）のルート候補。 */
export const DIFF_CONTAINER_SELECTORS = [
  '[data-testid="diff-view"]',
  '#files',
  '.js-diff-progressive-container',
  '[data-target="diff-layout.diffContainer"]',
  'main',
] as const;

/** diff の 1 ファイル分のコンテナ候補。 */
export const DIFF_FILE_SELECTORS = [
  '[data-tagsearch-path]',
  '[data-file-path]',
  '[data-testid="file-diff"]',
  'div.js-file',
] as const;

/** diff コンテナからファイルパスを読む属性候補。 */
export const DIFF_FILE_PATH_ATTRIBUTES = [
  'data-tagsearch-path',
  'data-file-path',
  'data-path',
] as const;

/** 属性から取れない場合にパス文字列を読むテキスト要素候補。 */
export const DIFF_FILE_PATH_TEXT_SELECTORS = [
  '[data-testid="file-name"]',
  '.file-info a[title]',
  '.file-header [title]',
  'a[title][href*="/blob/"]',
] as const;

/**
 * ファイル要素の子孫からパスを読むための「セレクタ + 属性」の組。
 * 新しいレビュー UI では完全パスがコンテナではなく子孫の要素に入っている。
 * 「Expand all lines」ボタンは折りたたみ行が無いファイルには存在しないため、
 * パスのコピー用要素なども候補に含める。
 */
export const DIFF_FILE_PATH_DEEP_SOURCES = [
  { selector: '[data-file-path]', attribute: 'data-file-path', loose: false },
  { selector: '[data-tagsearch-path]', attribute: 'data-tagsearch-path', loose: false },
  { selector: '[data-path]', attribute: 'data-path', loose: false },
  { selector: '[data-clipboard-text]', attribute: 'data-clipboard-text', loose: false },
  { selector: 'clipboard-copy[value]', attribute: 'value', loose: false },
  { selector: 'a[title][href*="/blob/"]', attribute: 'title', loose: false },
  // loose: 汎用属性からの推定。ディレクトリ区切りを含むものだけ採用する。
  { selector: '[title]', attribute: 'title', loose: true },
] as const;

/**
 * `aria-label="Expand all lines: <path>"` のように、ラベル末尾へパスが入るパターン。
 * ラベル文字列は変わりやすいので、あくまで最後のフォールバックとして使う。
 */
export const DIFF_FILE_PATH_LABEL_PATTERN = /^[^:：]{1,40}[:：]\s*(\S.*)$/;

/**
 * Viewed トグル候補。
 * 従来 UI はチェックボックスだが、新しいレビュー UI はボタン（`aria-pressed`）等の
 * 可能性があるため、input に限定しない。
 */
export const VIEWED_CONTROL_SELECTORS = [
  'input[type="checkbox"].js-reviewed-checkbox',
  'input[type="checkbox"][name="viewed"]',
  '[data-testid="viewed-checkbox"]',
  '[data-testid="file-viewed-checkbox"]',
  'input[type="checkbox"][aria-label="Viewed"]',
  '[role="checkbox"][aria-label="Viewed"]',
  '[role="switch"][aria-label="Viewed"]',
  'button[aria-label="Viewed"]',
  'input[type="checkbox"][data-viewed]',
] as const;

/**
 * 上記で見つからない場合に「ラベル文字列が Viewed のトグル」を探す対象。
 * チェックボックス・スイッチ・ボタン・label のいずれかを想定する。
 */
export const VIEWED_CONTROL_HOST_SELECTOR =
  'input[type="checkbox"], [role="checkbox"], [role="switch"], button, label';

/** ラベル文字列から Viewed トグルを判定するための語。 */
export const VIEWED_LABEL_TEXT = 'viewed';

/** ラベル文字列で判定する際、これより長いテキストを持つ要素は「囲みの親」とみなして除外する。 */
export const VIEWED_LABEL_MAX_LENGTH = 40;

/** トグルの ON / OFF 状態を保持しうる属性（前から順に見る）。 */
export const VIEWED_STATE_ATTRIBUTES = [
  'aria-checked',
  'aria-pressed',
  'data-viewed',
  'data-file-user-viewed',
] as const;

/** トグルが見つからない場合のフォールバック属性（diff コンテナ側に付く）。 */
export const VIEWED_FILE_ATTRIBUTE = 'data-file-user-viewed';

/** ファイルツリーのルート候補。 */
export const TREE_CONTAINER_SELECTORS = [
  '[data-testid="file-tree"]',
  'file-tree',
  '#repos-file-tree',
  '[aria-label="File Tree"]',
  '[data-target="diff-layout.sidebarContainer"] [role="tree"]',
  '[role="tree"]',
] as const;

/** ファイルツリーの項目（ファイル・ディレクトリ両方）候補。 */
export const TREE_ITEM_SELECTORS = ['[role="treeitem"]', 'li.ActionList-item'] as const;

/** ツリー項目からファイルパスを読む属性候補。 */
export const TREE_ITEM_PATH_ATTRIBUTES = [
  'data-file-path',
  'data-tree-entry-path',
  'data-tagsearch-path',
  'data-path',
] as const;

/** ツリー項目の表示名（ラベル）を読む要素候補。 */
export const TREE_ITEM_LABEL_SELECTORS = [
  '[data-testid="tree-item-name"]',
  '.PRIVATE_TreeView-item-content-text',
  '.ActionList-item-label',
  'a[title]',
  'a',
  'button',
] as const;

/** ツリー項目が「ファイル」であることを示す属性と値。 */
export const TREE_ENTRY_TYPE_ATTRIBUTE = 'data-tree-entry-type';
export const TREE_ENTRY_TYPE_FILE = 'file';

/** ツリー項目内の diff アンカーへのリンク。 */
export const TREE_ITEM_DIFF_LINK_SELECTOR = 'a[href*="#diff-"]';

/** diff アンカー ID の接頭辞。 */
export const DIFF_ANCHOR_ID_PREFIX = 'diff-';

/**
 * Files changed 画面の URL パターン。
 * 従来の `/pull/{number}/files` と、新しいレビュー UI の `/pull/{number}/changes` の両方に対応する。
 */
export const PR_FILES_PATHNAME_PATTERN = /^\/[^/]+\/[^/]+\/pull\/\d+\/(?:files|changes)(?:\/|$)/;

/**
 * セレクタ候補を順に試し、最初にヒットした 1 件を返す。
 */
export function findFirstElement(
  root: ParentNode,
  selectors: readonly string[],
): HTMLElement | null {
  for (const selector of selectors) {
    const found = root.querySelector<HTMLElement>(selector);
    if (found !== null) return found;
  }
  return null;
}

/**
 * セレクタ候補を順に試し、最初にヒットしたセレクタの全要素を返す。
 * 候補を union せず「最初にヒットしたものだけ」を採用することで、
 * 入れ子構造で同じファイルを二重に拾うのを防ぐ。
 */
export function findAllElements(root: ParentNode, selectors: readonly string[]): HTMLElement[] {
  for (const selector of selectors) {
    const found = root.querySelectorAll<HTMLElement>(selector);
    if (found.length > 0) return Array.from(found);
  }
  return [];
}

/** 属性候補を順に試し、最初に見つかった非空の値を返す。 */
export function readFirstAttribute(
  element: Element,
  attributes: readonly string[],
): string | null {
  for (const attribute of attributes) {
    const value = element.getAttribute(attribute);
    if (value !== null && value.trim() !== '') return value;
  }
  return null;
}

/** diff 一覧のルート要素を探す。 */
export function findDiffContainer(root: ParentNode): HTMLElement | null {
  return findFirstElement(root, DIFF_CONTAINER_SELECTORS);
}

/** ファイルツリーのルート要素を探す。 */
export function findFileTreeContainer(root: ParentNode): HTMLElement | null {
  return findFirstElement(root, TREE_CONTAINER_SELECTORS);
}

/** 現在の URL が PR の Files changed 画面かどうか。 */
export function isPrFilesPathname(pathname: string): boolean {
  return PR_FILES_PATHNAME_PATTERN.test(pathname);
}
