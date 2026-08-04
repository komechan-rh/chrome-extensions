import { debugLog, isDebugEnabled } from './debug';
import {
  DIFF_CONTAINER_SELECTORS,
  DIFF_FILE_SELECTORS,
  TREE_CONTAINER_SELECTORS,
  TREE_ITEM_SELECTORS,
  VIEWED_CONTROL_HOST_SELECTOR,
  VIEWED_CONTROL_SELECTORS,
  VIEWED_LABEL_TEXT,
  findAllElements,
  findDiffContainer,
  findFileTreeContainer,
  isPrFilesPathname,
} from './dom-selectors';
import { readTreeFileEntries } from './file-tree';
import {
  findAllViewedControls,
  findViewedControl,
  readControlViewedState,
  readDiffFileEntries,
  readDiffFilePath,
} from './viewed-state';

/**
 * GitHub の DOM 変更で同期できなくなったときに、どのセレクタが外れたのかを
 * 1 回のログで判別するための診断レポート。
 * debug 有効時のみ出力し、通常利用では動かない。
 */

const MAX_HTML_LENGTH = 300;
const MAX_SAMPLES = 3;

/** 診断で追加確認したい、まだセレクタ候補に入っていない属性など。 */
const EXTRA_PROBE_SELECTORS = [
  '[data-tagsearch-path]',
  '[data-file-path]',
  '[data-path]',
  'copilot-diff-entry',
  '[id^="diff-"]',
  'a[href*="#diff-"]',
  '[data-tree-entry-type]',
  'input[type="checkbox"]',
  '[role="treeitem"]',
] as const;

function truncate(value: string, max = MAX_HTML_LENGTH): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/** セレクタ候補のうち、実際にヒットしたものと件数の一覧。 */
function describeHits(root: ParentNode, selectors: readonly string[]): string {
  return selectors
    .map((selector) => {
      try {
        return `${selector}=${root.querySelectorAll(selector).length}`;
      } catch {
        return `${selector}=ERR`;
      }
    })
    .join(' ');
}

/** ラベル文字列から Viewed らしいチェックボックスを探す（セレクタが外れていても見つける）。 */
function findViewedLikeCheckbox(doc: Document): HTMLInputElement | null {
  for (const checkbox of doc.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
    const label = [
      checkbox.getAttribute('aria-label') ?? '',
      checkbox.closest('label')?.textContent ?? '',
      checkbox.id === ''
        ? ''
        : (doc.querySelector(`label[for="${CSS.escape(checkbox.id)}"]`)?.textContent ?? ''),
    ]
      .join(' ')
      .toLowerCase();
    if (label.includes(VIEWED_LABEL_TEXT)) return checkbox;
  }
  return null;
}

/** 要素から上位へ辿り、data-* / title / aria-label を列挙する（パスの在り処を探すため）。 */
function describeAncestors(element: Element | null, limit = 8): string {
  const lines: string[] = [];
  let current: Element | null = element;

  for (let depth = 0; current !== null && depth < limit; depth += 1) {
    const attributes = current
      .getAttributeNames()
      .filter((name) => name.startsWith('data-') || name === 'title' || name === 'aria-label')
      .map((name) => `${name}="${truncate(current?.getAttribute(name) ?? '', 60)}"`);
    const id = current.id === '' ? '' : `#${current.id}`;
    lines.push(`    ${depth}: <${current.tagName.toLowerCase()}${id}> ${attributes.join(' ')}`);
    current = current.parentElement;
  }

  return lines.join('\n');
}

/** 拡張が今どう見えているかを 1 つの文字列にまとめる。 */
export function buildDiagnosticsReport(doc: Document): string {
  const diffContainer = findDiffContainer(doc);
  const treeContainer = findFileTreeContainer(doc);
  const diffEntries = readDiffFileEntries(diffContainer);
  const treeEntries = readTreeFileEntries(treeContainer);
  const viewedCheckbox = findViewedLikeCheckbox(doc);
  const treeItem = doc.querySelector<HTMLElement>(TREE_ITEM_SELECTORS.join(','));

  const lines = [
    'diagnostics report ------------------------------',
    `url: ${doc.location.pathname} (target=${String(isPrFilesPathname(doc.location.pathname))})`,
    `diff container: ${diffContainer === null ? 'NOT FOUND' : (diffContainer.id || diffContainer.tagName)}`,
    `tree container: ${treeContainer === null ? 'NOT FOUND' : (treeContainer.id || treeContainer.tagName)}`,
    `diff files: ${diffEntries.length} (viewed=${diffEntries.filter((entry) => entry.viewed).length})`,
    `tree files: ${treeEntries.length} (path resolved=${treeEntries.filter((entry) => entry.path !== null).length})`,
    `diff paths: ${diffEntries.slice(0, MAX_SAMPLES + 2).map((entry) => `${entry.path}[viewed=${String(entry.viewed)},anchor=${entry.anchorId ?? 'none'}]`).join(', ') || '(none)'}`,
    `tree paths: ${treeEntries.slice(0, MAX_SAMPLES).map((entry) => `${entry.path ?? '(unresolved)'}[anchor=${entry.anchorId ?? 'none'}]`).join(', ') || '(none)'}`,
    `hits[diff container]: ${describeHits(doc, DIFF_CONTAINER_SELECTORS)}`,
    `hits[diff file]: ${describeHits(doc, DIFF_FILE_SELECTORS)}`,
    `hits[viewed control]: ${describeHits(doc, VIEWED_CONTROL_SELECTORS)}`,
    `hits[tree container]: ${describeHits(doc, TREE_CONTAINER_SELECTORS)}`,
    `hits[tree item]: ${describeHits(doc, TREE_ITEM_SELECTORS)}`,
    `hits[probe]: ${describeHits(doc, EXTRA_PROBE_SELECTORS)}`,
    'viewed controls:',
    describeViewedControls(doc),
    'diff file details:',
    describeDiffFiles(doc),
    `viewed checkbox: ${viewedCheckbox === null ? 'NOT FOUND' : truncate(viewedCheckbox.outerHTML)}`,
    'viewed checkbox ancestors:',
    viewedCheckbox === null ? '    (none)' : describeAncestors(viewedCheckbox),
    `tree item: ${treeItem === null ? 'NOT FOUND' : truncate(treeItem.outerHTML)}`,
    `tree item aria text: ${treeItem === null ? '(none)' : describeAriaText(doc, treeItem)}`,
    '------------------------------------------------',
  ];

  return lines.join('\n');
}

/** class / style を除いた属性一覧（パスや状態がどこに入っているかを見るため）。 */
function describeAttributes(element: Element): string {
  return element
    .getAttributeNames()
    .filter((name) => name !== 'class' && name !== 'style')
    .map((name) => `${name}="${truncate(element.getAttribute(name) ?? '', 70)}"`)
    .join(' ');
}

/** ファイル内の「Viewed らしい要素」を列挙する（トグルの実体を特定するため）。 */
function describeViewedCandidates(fileElement: Element): string {
  const lines: string[] = [];

  for (const candidate of fileElement.querySelectorAll<HTMLElement>(VIEWED_CONTROL_HOST_SELECTOR)) {
    const text = `${candidate.getAttribute('aria-label') ?? ''} ${candidate.textContent ?? ''}`
      .replace(/\s+/g, ' ')
      .trim();
    if (!text.toLowerCase().includes(VIEWED_LABEL_TEXT)) continue;

    lines.push(
      `      <${candidate.tagName.toLowerCase()}> text="${truncate(text, 40)}" ${describeAttributes(candidate)}`,
    );
    if (lines.length >= 4) break;
  }

  return lines.length === 0 ? '      (none)' : lines.join('\n');
}

/** diff のファイル要素とその中身を詳しく出す。 */
function describeDiffFiles(doc: Document): string {
  const diffContainer = findDiffContainer(doc) ?? doc;
  const files = findAllElements(diffContainer, DIFF_FILE_SELECTORS).slice(0, 2);
  if (files.length === 0) return '  (no diff file element matched)';

  return files
    .map((file, index) => {
      const control = findViewedControl(file);
      return [
        `  [${index}] <${file.tagName.toLowerCase()}> ${describeAttributes(file)}`,
        `      resolved path: ${readDiffFilePath(file) ?? 'NOT RESOLVED'}`,
        `      findViewedControl: ${control === null ? 'NOT FOUND' : `<${control.tagName.toLowerCase()}> state=${String(readControlViewedState(control))} ${describeAttributes(control)}`}`,
        '      viewed-like elements:',
        describeViewedCandidates(file),
      ].join('\n');
    })
    .join('\n');
}

/** Viewed トグルの実体と、その周辺（内部・祖先）の属性を出す。 */
function describeViewedControls(doc: Document): string {
  const root = findDiffContainer(doc) ?? doc.body;
  const controls = findAllViewedControls(root);
  if (controls.length === 0) return '  (no viewed control found)';

  const lines = [`  count: ${controls.length}`];

  for (const [index, control] of controls.slice(0, 3).entries()) {
    lines.push(
      `  [${index}] <${control.tagName.toLowerCase()}> state=${String(readControlViewedState(control))} ${describeAttributes(control)}`,
      `      text: "${truncate((control.textContent ?? '').replace(/\s+/g, ' ').trim(), 60)}"`,
      '      inner elements with attributes:',
      describeInnerElements(control),
      '      ancestors:',
      describeAncestors(control.parentElement, 7),
    );
  }

  return lines.join('\n');
}

/** トグル内部の要素（アイコン・span）の属性。状態がここに出ることがある。 */
function describeInnerElements(control: Element): string {
  const lines: string[] = [];

  for (const child of control.querySelectorAll('*')) {
    const attributes = describeAttributes(child);
    lines.push(`        <${child.tagName.toLowerCase()}> ${attributes}`);
    if (lines.length >= 4) break;
  }

  return lines.length === 0 ? '        (none)' : lines.join('\n');
}

/** aria-labelledby / aria-describedby の参照先テキスト（GitHub が状態を持たせている可能性がある）。 */
function describeAriaText(doc: Document, element: Element): string {
  const parts: string[] = [];

  for (const attribute of ['aria-labelledby', 'aria-describedby']) {
    const ids = (element.getAttribute(attribute) ?? '').split(/\s+/).filter((id) => id !== '');
    const texts = ids.map((id) => {
      const target = doc.getElementById(id);
      return `${id}="${truncate((target?.textContent ?? '(missing)').replace(/\s+/g, ' ').trim(), 60)}"`;
    });
    if (texts.length > 0) parts.push(`${attribute}: ${texts.join(' ')}`);
  }

  return parts.length === 0 ? '(none)' : parts.join(' | ');
}

/** debug 有効時のみ診断レポートを出力する。 */
export function logDiagnostics(doc: Document, reason: string): void {
  if (!isDebugEnabled()) return;
  debugLog(`${reason}\n${buildDiagnosticsReport(doc)}`);
}
