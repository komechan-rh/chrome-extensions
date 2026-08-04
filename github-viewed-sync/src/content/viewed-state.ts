import type { DiffAnchorId, DiffFileEntry, FilePath, ViewedStateChange } from '../types/github';
import {
  DIFF_ANCHOR_ID_PREFIX,
  DIFF_FILE_PATH_ATTRIBUTES,
  DIFF_FILE_PATH_TEXT_SELECTORS,
  DIFF_FILE_SELECTORS,
  VIEWED_CONTROL_SELECTORS,
  VIEWED_FILE_ATTRIBUTE,
  VIEWED_LABEL_TEXT,
  findAllElements,
  readFirstAttribute,
} from './dom-selectors';
import { normalizeDiffAnchorId, normalizeFilePath } from './file-path';

/**
 * diff（Files changed 本体）側から Viewed 状態を収集する処理。
 * DOM を読むだけで書き換えないため、すべて純関数として扱える。
 */

/** diff の 1 ファイルコンテナから完全なファイルパスを読む。 */
export function readDiffFilePath(fileElement: HTMLElement): FilePath | null {
  const fromAttribute = readFirstAttribute(fileElement, DIFF_FILE_PATH_ATTRIBUTES);
  const normalizedAttribute = normalizeFilePath(fromAttribute);
  if (normalizedAttribute !== null) return normalizedAttribute;

  for (const selector of DIFF_FILE_PATH_TEXT_SELECTORS) {
    const element = fileElement.querySelector<HTMLElement>(selector);
    if (element === null) continue;

    const fromTitle = normalizeFilePath(element.getAttribute('title'));
    if (fromTitle !== null) return fromTitle;

    const fromText = normalizeFilePath(element.textContent);
    if (fromText !== null) return fromText;
  }

  return null;
}

/** diff の 1 ファイルコンテナからツリーのリンク先となるアンカー ID を読む。 */
export function readDiffAnchorId(fileElement: HTMLElement): DiffAnchorId | null {
  const fromOwnId = normalizeDiffAnchorId(fileElement.id);
  if (fromOwnId !== null) return fromOwnId;

  const owner = fileElement.closest<HTMLElement>(`[id^="${DIFF_ANCHOR_ID_PREFIX}"]`);
  const fromAncestor = normalizeDiffAnchorId(owner?.id);
  if (fromAncestor !== null) return fromAncestor;

  const anchor = fileElement.querySelector<HTMLElement>(`[id^="${DIFF_ANCHOR_ID_PREFIX}"]`);
  return normalizeDiffAnchorId(anchor?.id);
}

/** チェックボックスに紐づくラベル文字列（aria-label / label 要素 / タイトル）を集める。 */
function readControlLabelText(control: HTMLInputElement): string {
  const parts: string[] = [];

  const ariaLabel = control.getAttribute('aria-label');
  if (ariaLabel !== null) parts.push(ariaLabel);

  const title = control.getAttribute('title');
  if (title !== null) parts.push(title);

  const wrappingLabel = control.closest('label');
  if (wrappingLabel !== null) parts.push(wrappingLabel.textContent ?? '');

  if (control.id !== '') {
    const associated = control.ownerDocument.querySelector<HTMLElement>(
      `label[for="${CSS.escape(control.id)}"]`,
    );
    if (associated !== null) parts.push(associated.textContent ?? '');
  }

  return parts.join(' ').toLowerCase();
}

/**
 * diff の 1 ファイルコンテナから Viewed チェックボックスを探す。
 * 既知のセレクタで見つからない場合はラベル文字列（"Viewed"）から推定する。
 */
export function findViewedControl(fileElement: HTMLElement): HTMLInputElement | null {
  for (const selector of VIEWED_CONTROL_SELECTORS) {
    const control = fileElement.querySelector<HTMLInputElement>(selector);
    if (control !== null) return control;
  }

  const checkboxes = fileElement.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
  for (const checkbox of checkboxes) {
    if (readControlLabelText(checkbox).includes(VIEWED_LABEL_TEXT)) return checkbox;
  }

  return null;
}

/**
 * Viewed かどうかを判定する。
 * checked 属性は初期値（defaultChecked）でしかないため、必ずプロパティを見る。
 */
export function isViewedControlChecked(control: HTMLInputElement): boolean {
  if (control.indeterminate) return false;
  return control.checked;
}

/** チェックボックスが Viewed トグルかどうか（change イベントの絞り込み用）。 */
export function isViewedControl(target: EventTarget | null): target is HTMLInputElement {
  if (!(target instanceof HTMLElement)) return false;
  if (target.tagName !== 'INPUT') return false;

  const input = target as HTMLInputElement;
  if (input.type !== 'checkbox') return false;

  const matchesKnownSelector = VIEWED_CONTROL_SELECTORS.some((selector) =>
    input.matches(selector),
  );
  if (matchesKnownSelector) return true;

  return readControlLabelText(input).includes(VIEWED_LABEL_TEXT);
}

/**
 * diff 側の全ファイルの Viewed 状態を読み取る。
 * Viewed の状態を観測できない（チェックボックスも属性も無い）ファイルは、
 * 状態を誤って上書きしないよう結果に含めない。
 */
export function readDiffFileEntries(root: ParentNode | null): DiffFileEntry[] {
  if (root === null) return [];

  const entries: DiffFileEntry[] = [];
  const seenPaths = new Set<FilePath>();

  for (const fileElement of findAllElements(root, DIFF_FILE_SELECTORS)) {
    const path = readDiffFilePath(fileElement);
    if (path === null || seenPaths.has(path)) continue;

    const control = findViewedControl(fileElement);
    let viewed: boolean;

    if (control !== null) {
      viewed = isViewedControlChecked(control);
    } else if (fileElement.hasAttribute(VIEWED_FILE_ATTRIBUTE)) {
      viewed = fileElement.getAttribute(VIEWED_FILE_ATTRIBUTE) !== 'false';
    } else {
      continue;
    }

    seenPaths.add(path);
    entries.push({ path, anchorId: readDiffAnchorId(fileElement), viewed });
  }

  return entries;
}

/** Viewed 済みのファイルパス集合を返す。 */
export function collectViewedPaths(root: ParentNode | null): Set<FilePath> {
  const viewedPaths = new Set<FilePath>();
  for (const entry of readDiffFileEntries(root)) {
    if (entry.viewed) viewedPaths.add(entry.path);
  }
  return viewedPaths;
}

/** ファイルパス → Viewed 状態の Map を作る。 */
export function buildViewedStateMap(root: ParentNode | null): Map<FilePath, boolean> {
  const state = new Map<FilePath, boolean>();
  for (const entry of readDiffFileEntries(root)) {
    state.set(entry.path, entry.viewed);
  }
  return state;
}

/** アンカー ID → Viewed 状態の Map を作る（パス解決に失敗したツリー項目向けの代替）。 */
export function buildViewedStateByAnchorId(root: ParentNode | null): Map<DiffAnchorId, boolean> {
  const state = new Map<DiffAnchorId, boolean>();
  for (const entry of readDiffFileEntries(root)) {
    if (entry.anchorId !== null) state.set(entry.anchorId, entry.viewed);
  }
  return state;
}

/**
 * 前回状態と今回状態を比較し、変化したファイルだけを返す。
 * 数百ファイルの PR でも DOM 更新を変化分に限定するために使う。
 * diff から消えたファイルは「Viewed 解除」として扱い、表示を残さない。
 */
export function diffViewedStates(
  previous: ReadonlyMap<FilePath, boolean>,
  next: ReadonlyMap<FilePath, boolean>,
): ViewedStateChange[] {
  const changes: ViewedStateChange[] = [];

  for (const [path, viewed] of next) {
    if (previous.get(path) !== viewed) changes.push({ path, viewed });
  }

  for (const [path, viewed] of previous) {
    if (viewed && !next.has(path)) changes.push({ path, viewed: false });
  }

  return changes;
}
