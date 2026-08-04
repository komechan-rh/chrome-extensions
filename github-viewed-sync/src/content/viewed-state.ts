import type { DiffAnchorId, DiffFileEntry, FilePath, ViewedStateChange } from '../types/github';
import {
  DIFF_ANCHOR_ID_PREFIX,
  DIFF_FILE_PATH_ATTRIBUTES,
  DIFF_FILE_PATH_DEEP_SOURCES,
  DIFF_FILE_PATH_LABEL_PATTERN,
  DIFF_FILE_PATH_TEXT_SELECTORS,
  DIFF_FILE_SELECTORS,
  VIEWED_CONTROL_HOST_SELECTOR,
  VIEWED_CONTROL_SELECTORS,
  VIEWED_FILE_ATTRIBUTE,
  VIEWED_LABEL_MAX_LENGTH,
  VIEWED_LABEL_TEXT,
  VIEWED_STATE_ATTRIBUTES,
  findAllElements,
  readFirstAttribute,
} from './dom-selectors';
import { normalizeDiffAnchorId, normalizeFilePath } from './file-path';

/**
 * diff（Files changed 本体）側から Viewed 状態を収集する処理。
 * DOM を読むだけで書き換えないため、すべて純関数として扱える。
 */

/** Viewed トグルからファイルコンテナを探すときに遡る最大の階層数。 */
const MAX_CONTAINER_SEARCH_DEPTH = 12;

/**
 * パスが解決できないファイルは、diff アンカー ID を疑似キーとして扱う。
 * 実パスと衝突しないよう、パスに使われない `#` を接頭辞にする。
 */
export function anchorFallbackKey(anchorId: DiffAnchorId): FilePath {
  return `#${anchorId}`;
}

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

/**
 * ファイルパスを、自身の属性だけでなく子孫の属性からも読む。
 * 新しいレビュー UI では完全パスがファイルコンテナではなく、
 * 中のボタン（例: Expand all lines）の `data-file-path` に入っている。
 * 複数ファイルを含む要素に対して使うと誤ったパスを返すため、
 * 呼び出し側で「1 ファイル分の範囲」であることを保証すること。
 */
export function readDiffFilePathDeep(element: HTMLElement): FilePath | null {
  const own = readDiffFilePath(element);
  if (own !== null) return own;

  for (const source of DIFF_FILE_PATH_DEEP_SOURCES) {
    for (const holder of element.querySelectorAll<HTMLElement>(source.selector)) {
      const path = normalizeFilePath(holder.getAttribute(source.attribute));
      if (path !== null && isFilePathLike(path, source.loose)) return path;
    }
  }

  // 最後の手段: `aria-label="Expand all lines: <path>"` のような形式から取り出す。
  for (const labelled of element.querySelectorAll<HTMLElement>('[aria-label]')) {
    const matched = DIFF_FILE_PATH_LABEL_PATTERN.exec(labelled.getAttribute('aria-label') ?? '');
    const path = normalizeFilePath(matched?.[1]);
    if (path !== null && isFilePathLike(path, true)) return path;
  }

  return null;
}

/**
 * 文字列がファイルパスらしいか（説明文を誤って拾わないための最低限の判定）。
 * loose（汎用属性からの推定）では、ファイル名だけの値を誤採用しないよう
 * ディレクトリ区切りを含むことを要求する。
 */
function isFilePathLike(value: string, loose: boolean): boolean {
  if (value.includes(' ')) return false;
  if (loose) return value.includes('/');
  return value.includes('/') || value.includes('.');
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

/** トグルに紐づくラベル文字列（aria-label / label 要素 / title / 自身のテキスト）を集める。 */
function readControlLabelText(control: HTMLElement): string {
  const parts: string[] = [];

  const ariaLabel = control.getAttribute('aria-label');
  if (ariaLabel !== null) parts.push(ariaLabel);

  const title = control.getAttribute('title');
  if (title !== null) parts.push(title);

  // ボタン型トグルは表示テキストが "Viewed" になる。
  parts.push(control.textContent ?? '');

  const wrappingLabel = control.closest('label');
  if (wrappingLabel !== null) parts.push(wrappingLabel.textContent ?? '');

  if (control.id !== '') {
    const associated = control.ownerDocument.querySelector<HTMLElement>(
      `label[for="${CSS.escape(control.id)}"]`,
    );
    if (associated !== null) parts.push(associated.textContent ?? '');
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** ラベル文字列が Viewed トグルらしいか（大きな親要素は除外する）。 */
function isViewedLabelLike(control: HTMLElement): boolean {
  const label = readControlLabelText(control);
  if (!label.includes(VIEWED_LABEL_TEXT)) return false;
  return label.length <= VIEWED_LABEL_MAX_LENGTH;
}

/**
 * トグルの ON / OFF を読む。判別できない場合は null を返す。
 * input の `checked` 属性は初期値（defaultChecked）でしかないため、必ずプロパティを見る。
 */
export function readControlViewedState(control: HTMLElement): boolean | null {
  if (control.tagName === 'INPUT') {
    const input = control as HTMLInputElement;
    if (input.type === 'checkbox') {
      if (input.indeterminate) return false;
      return input.checked;
    }
  }

  for (const attribute of VIEWED_STATE_ATTRIBUTES) {
    const value = control.getAttribute(attribute);
    if (value === null) continue;
    if (value === 'true' || value === '') return true;
    if (value === 'false') return false;
  }

  return null;
}

/**
 * diff の 1 ファイルコンテナから Viewed トグルを探す。
 * 既知のセレクタ → ラベル文字列（"Viewed"）＋状態が読める要素 → ラベル文字列のみ、の順で探す。
 */
export function findViewedControl(fileElement: HTMLElement): HTMLElement | null {
  for (const selector of VIEWED_CONTROL_SELECTORS) {
    const control = fileElement.querySelector<HTMLElement>(selector);
    if (control !== null) return control;
  }

  const candidates = fileElement.querySelectorAll<HTMLElement>(VIEWED_CONTROL_HOST_SELECTOR);
  const labelled = Array.from(candidates).filter(isViewedLabelLike);

  // 状態を読み取れる要素を優先する（囲みの label や装飾ボタンを避ける）。
  return labelled.find((control) => readControlViewedState(control) !== null) ?? labelled[0] ?? null;
}

/** Viewed が ON かどうか。 */
export function isViewedControlChecked(control: HTMLElement): boolean {
  return readControlViewedState(control) === true;
}

/**
 * イベントの発生元が Viewed トグル（またはその内部要素）かどうか。
 * change（チェックボックス）と click（ボタン内の svg / span）の両方に対応する。
 */
export function isViewedControl(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof Element)) return false;
  const element = target as HTMLElement;

  if (VIEWED_CONTROL_SELECTORS.some((selector) => element.matches(selector))) return true;

  const host = element.closest<HTMLElement>(VIEWED_CONTROL_HOST_SELECTOR);
  if (host === null) return false;
  if (VIEWED_CONTROL_SELECTORS.some((selector) => host.matches(selector))) return true;

  return isViewedLabelLike(host);
}

/** root 全体から Viewed トグルを列挙する（新 UI 向けの起点）。 */
export function findAllViewedControls(root: ParentNode): HTMLElement[] {
  for (const selector of VIEWED_CONTROL_SELECTORS) {
    const found = root.querySelectorAll<HTMLElement>(selector);
    if (found.length > 0) return Array.from(found);
  }

  return Array.from(root.querySelectorAll<HTMLElement>(VIEWED_CONTROL_HOST_SELECTOR)).filter(
    isViewedLabelLike,
  );
}

/** トグル本体で判別できない場合に、内部要素と祖先（コンテナまで）から状態を探す。 */
function readViewedStateAround(control: HTMLElement, container: HTMLElement | null): boolean | null {
  const own = readControlViewedState(control);
  if (own !== null) return own;

  const inner = control.querySelector<HTMLElement>(
    VIEWED_STATE_ATTRIBUTES.map((attribute) => `[${attribute}]`).join(','),
  );
  if (inner !== null) {
    const innerState = readControlViewedState(inner);
    if (innerState !== null) return innerState;
  }

  let current: HTMLElement | null = control.parentElement;
  while (current !== null) {
    const state = readControlViewedState(current);
    if (state !== null) return state;
    if (current === container) break;
    current = current.parentElement;
  }

  return null;
}

/**
 * Viewed トグルを起点に、そのファイルのコンテナとパスを遡って解決する。
 * 新しいレビュー UI では「ファイルコンテナに完全パス」という前提が崩れているため、
 * トグルから上に辿り、隣のファイルを巻き込まない範囲でパスを探す。
 */
function readEntriesFromViewedControls(root: ParentNode): DiffFileEntry[] {
  const controls = findAllViewedControls(root);
  const entries: DiffFileEntry[] = [];

  for (const [index, control] of controls.entries()) {
    // 隣接するトグルを含む祖先まで登ったら「1 ファイル分の範囲」を超えたと判断する。
    const target = resolveControlTarget(control, controls[index - 1], controls[index + 1]);
    if (target === null) continue;

    const viewed = readViewedStateAround(control, target.container);
    if (viewed === null) continue;

    entries.push({ path: target.path, anchorId: target.anchorId, viewed });
  }

  return entries;
}

interface ControlTarget {
  path: FilePath;
  anchorId: DiffAnchorId | null;
  container: HTMLElement;
}

/**
 * 解決結果のキャッシュ。パスの探索は祖先を遡りながら複数のセレクタを試すため、
 * 数百ファイルの PR で毎回やり直すと同期のたびに重くなる。
 * 同じトグル要素のファイルパスは変わらず、DOM が作り直されればキーごと破棄される。
 */
const targetByControl = new WeakMap<HTMLElement, ControlTarget>();

/** Viewed トグルから、そのファイルのコンテナ・パス（または疑似キー）を解決する。 */
function resolveControlTarget(
  control: HTMLElement,
  previous: HTMLElement | undefined,
  next: HTMLElement | undefined,
): ControlTarget | null {
  const cached = targetByControl.get(control);
  if (cached !== undefined && cached.container.isConnected) return cached;

  let fallback: ControlTarget | null = null;
  let current: HTMLElement | null = control.parentElement;

  for (let depth = 0; current !== null && depth < MAX_CONTAINER_SEARCH_DEPTH; depth += 1) {
    if (previous !== undefined && current.contains(previous)) break;
    if (next !== undefined && current.contains(next)) break;

    const path = readDiffFilePathDeep(current);
    if (path !== null) {
      const resolved: ControlTarget = {
        path,
        anchorId: readDiffAnchorId(current),
        container: current,
      };
      targetByControl.set(control, resolved);
      return resolved;
    }

    // パスが取れなくても `#diff-...` アンカーが一致すればツリーと対応付けられる。
    if (fallback === null) {
      const anchorId = readDiffAnchorId(current);
      if (anchorId !== null) {
        fallback = { path: anchorFallbackKey(anchorId), anchorId, container: current };
      }
    }

    current = current.parentElement;
  }

  if (fallback !== null) targetByControl.set(control, fallback);
  return fallback;
}

/**
 * diff 側の全ファイルの Viewed 状態を読み取る。
 * Viewed の状態を観測できないファイルは、状態を誤って上書きしないよう結果に含めない。
 */
export function readDiffFileEntries(root: ParentNode | null): DiffFileEntry[] {
  if (root === null) return [];

  const entries: DiffFileEntry[] = [];
  const seenPaths = new Set<FilePath>();

  for (const fileElement of findAllElements(root, DIFF_FILE_SELECTORS)) {
    const path = readDiffFilePath(fileElement);
    if (path === null || seenPaths.has(path)) continue;

    const control = findViewedControl(fileElement);
    let viewed = control === null ? null : readControlViewedState(control);

    if (viewed === null) {
      // トグルから読めない場合は、コンテナ側の属性を見る。
      const holder = fileElement.hasAttribute(VIEWED_FILE_ATTRIBUTE)
        ? fileElement
        : fileElement.querySelector<HTMLElement>(`[${VIEWED_FILE_ATTRIBUTE}]`);
      if (holder !== null) viewed = holder.getAttribute(VIEWED_FILE_ATTRIBUTE) !== 'false';
    }

    // Viewed 状態を観測できないファイルは、状態を誤って上書きしないよう除外する。
    if (viewed === null) continue;

    seenPaths.add(path);
    entries.push({ path, anchorId: readDiffAnchorId(fileElement), viewed });
  }

  // 新しいレビュー UI 向け: トグル起点でも収集し、未取得のファイルを補う。
  for (const entry of readEntriesFromViewedControls(root)) {
    if (seenPaths.has(entry.path)) continue;
    seenPaths.add(entry.path);
    entries.push(entry);
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
