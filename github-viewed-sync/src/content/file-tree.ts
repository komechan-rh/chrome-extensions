import type { DiffAnchorId, FilePath, TreeFileEntry } from '../types/github';
import {
  TREE_ENTRY_TYPE_ATTRIBUTE,
  TREE_ENTRY_TYPE_FILE,
  TREE_ITEM_DIFF_LINK_SELECTOR,
  TREE_ITEM_LABEL_SELECTORS,
  TREE_ITEM_PATH_ATTRIBUTES,
  TREE_ITEM_SELECTORS,
  findAllElements,
  readFirstAttribute,
} from './dom-selectors';
import { joinTreePathSegments, normalizeDiffAnchorId, normalizeFilePath } from './file-path';

/**
 * 左サイドバーのファイルツリーに対する読み取り（パス解決）と書き込み（レビュー済み表示）。
 * CSS クラス名・属性名の管理もここに集約する。
 */

/** レビュー済みのツリー項目に付与するクラス。 */
export const VIEWED_ITEM_CLASS = 'gh-viewed-tree-item';
/** 追加するチェックアイコンのクラス。 */
export const VIEWED_BADGE_CLASS = 'gh-viewed-tree-badge';
/** 付与済みかどうかの判定に使う属性（class 名変更に影響されないようにする）。 */
export const VIEWED_ITEM_ATTRIBUTE = 'data-gh-viewed';
/** アイコン要素の目印。重複追加の防止に使う。 */
export const VIEWED_BADGE_ATTRIBUTE = 'data-gh-viewed-badge';
/** デバッグ用に解決済みのパスを保持する属性。 */
export const VIEWED_PATH_ATTRIBUTE = 'data-gh-viewed-path';
/** スクリーンリーダー向けのラベル。 */
export const VIEWED_BADGE_LABEL = 'Reviewed';

const TREE_ITEM_SELECTOR_LIST = TREE_ITEM_SELECTORS.join(',');
const BADGE_SELECTOR = `[${VIEWED_BADGE_ATTRIBUTE}]`;

/** ツリー項目のインデックス。パス優先・アンカー ID を代替キーとする。 */
export interface TreeIndex {
  byPath: Map<FilePath, HTMLElement[]>;
  byAnchorId: Map<DiffAnchorId, HTMLElement[]>;
  entries: TreeFileEntry[];
}

/** 子ツリーと自前のアイコンを除いた、その項目自身の表示テキスト。 */
function readOwnVisibleText(element: HTMLElement): string | null {
  const clone = element.cloneNode(true) as HTMLElement;
  for (const nested of clone.querySelectorAll('[role="group"], ul, ol, ' + BADGE_SELECTOR)) {
    nested.remove();
  }
  return normalizeFilePath(clone.textContent);
}

/**
 * ツリー項目自身のラベル（ファイル名 or ディレクトリ名）を読む。
 * 入れ子の項目のラベルを拾わないよう、最近接の treeitem が自分自身であることを確認する。
 */
export function readTreeItemLabel(item: HTMLElement): string | null {
  for (const selector of TREE_ITEM_LABEL_SELECTORS) {
    for (const candidate of item.querySelectorAll<HTMLElement>(selector)) {
      if (candidate.closest<HTMLElement>(TREE_ITEM_SELECTOR_LIST) !== item) continue;

      const fromTitle = normalizeFilePath(candidate.getAttribute('title'));
      if (fromTitle !== null) return fromTitle;

      const fromText = readOwnVisibleText(candidate);
      if (fromText !== null) return fromText;
    }
  }

  return readOwnVisibleText(item);
}

/**
 * 新しいレビュー UI のツリー項目は `id` 属性にファイル／ディレクトリの完全パスが入る。
 * ただし `_R_xxx_` のような内部 ID もあるため、パスらしいものだけを採用する。
 */
function readTreeItemIdPath(item: HTMLElement): FilePath | null {
  const id = item.id;
  if (id === '' || id.startsWith('_') || !id.includes('/')) return null;
  return normalizeFilePath(id);
}

/** 属性・id から明示的に取得できる完全パス。 */
function readTreeItemExplicitPath(item: HTMLElement): FilePath | null {
  const fromAttribute = normalizeFilePath(readFirstAttribute(item, TREE_ITEM_PATH_ATTRIBUTES));
  if (fromAttribute !== null) return fromAttribute;
  return readTreeItemIdPath(item);
}

/** ツリー項目内の diff アンカー ID。 */
export function readTreeItemAnchorId(item: HTMLElement): DiffAnchorId | null {
  const link = item.querySelector<HTMLAnchorElement>(TREE_ITEM_DIFF_LINK_SELECTOR);
  if (link === null) return null;
  if (link.closest<HTMLElement>(TREE_ITEM_SELECTOR_LIST) !== item) return null;
  return normalizeDiffAnchorId(link.getAttribute('href'));
}

/** ツリー項目がファイル（ディレクトリでない）かどうか。 */
export function isTreeFileItem(item: HTMLElement): boolean {
  const entryType = item.getAttribute(TREE_ENTRY_TYPE_ATTRIBUTE);
  if (entryType !== null) return entryType === TREE_ENTRY_TYPE_FILE;

  // 子に別の項目を含むものはディレクトリとみなす。
  if (item.querySelector(TREE_ITEM_SELECTOR_LIST) !== null) return false;
  if (item.querySelector('[role="group"]') !== null) return false;

  return true;
}

/**
 * ツリー項目の完全なファイルパスを解決する。
 * ファイル名だけでは同名ファイルを区別できないため、
 * 属性 → title → 祖先ディレクトリ名の連結、の順で完全パスを組み立てる。
 */
export function resolveTreeItemPath(item: HTMLElement): FilePath | null {
  const ownExplicitPath = readTreeItemExplicitPath(item);
  if (ownExplicitPath !== null) return ownExplicitPath;

  const link = item.querySelector<HTMLAnchorElement>('a');
  if (link !== null && link.closest<HTMLElement>(TREE_ITEM_SELECTOR_LIST) === item) {
    const linkAttributePath = normalizeFilePath(readFirstAttribute(link, TREE_ITEM_PATH_ATTRIBUTES));
    if (linkAttributePath !== null) return linkAttributePath;
  }

  const ownLabel = readTreeItemLabel(item);
  if (ownLabel === null) return null;

  const ancestorLabels: string[] = [];
  let current = item.parentElement?.closest<HTMLElement>(TREE_ITEM_SELECTOR_LIST) ?? null;
  while (current !== null) {
    const explicitPath = readTreeItemExplicitPath(current);
    if (explicitPath !== null) {
      ancestorLabels.unshift(explicitPath);
      break;
    }

    const label = readTreeItemLabel(current);
    if (label !== null) ancestorLabels.unshift(label);
    current = current.parentElement?.closest<HTMLElement>(TREE_ITEM_SELECTOR_LIST) ?? null;
  }

  return joinTreePathSegments(ancestorLabels, ownLabel);
}

/** ファイルツリーからファイル項目を列挙する。 */
export function readTreeFileEntries(root: ParentNode | null): TreeFileEntry[] {
  if (root === null) return [];

  const entries: TreeFileEntry[] = [];
  for (const item of findAllElements(root, TREE_ITEM_SELECTORS)) {
    if (!isTreeFileItem(item)) continue;
    entries.push({
      path: resolveTreeItemPath(item),
      anchorId: readTreeItemAnchorId(item),
      element: item,
    });
  }
  return entries;
}

/** ツリー項目をキー（パス / アンカー ID）から引けるインデックスを作る。 */
export function buildTreeIndex(root: ParentNode | null): TreeIndex {
  const byPath = new Map<FilePath, HTMLElement[]>();
  const byAnchorId = new Map<DiffAnchorId, HTMLElement[]>();
  const entries = readTreeFileEntries(root);

  for (const entry of entries) {
    if (entry.path !== null) {
      const bucket = byPath.get(entry.path);
      if (bucket === undefined) byPath.set(entry.path, [entry.element]);
      else bucket.push(entry.element);
    }
    if (entry.anchorId !== null) {
      const bucket = byAnchorId.get(entry.anchorId);
      if (bucket === undefined) byAnchorId.set(entry.anchorId, [entry.element]);
      else bucket.push(entry.element);
    }
  }

  return { byPath, byAnchorId, entries };
}

function createBadge(doc: Document): HTMLElement {
  const badge = doc.createElement('span');
  badge.className = VIEWED_BADGE_CLASS;
  badge.setAttribute(VIEWED_BADGE_ATTRIBUTE, '');
  // 疑似要素だけに頼らず、支援技術からも「レビュー済み」と分かるようにする。
  badge.setAttribute('role', 'img');
  badge.setAttribute('aria-label', VIEWED_BADGE_LABEL);
  badge.setAttribute('title', VIEWED_BADGE_LABEL);
  badge.textContent = '✓';
  return badge;
}

/** アイコンを差し込む先（リンク要素があればその中）。 */
function findBadgeHost(item: HTMLElement): HTMLElement {
  const link = item.querySelector<HTMLElement>(TREE_ITEM_DIFF_LINK_SELECTOR) ?? null;
  if (link !== null && link.closest<HTMLElement>(TREE_ITEM_SELECTOR_LIST) === item) return link;

  for (const selector of TREE_ITEM_LABEL_SELECTORS) {
    const candidate = item.querySelector<HTMLElement>(selector);
    if (candidate !== null && candidate.closest<HTMLElement>(TREE_ITEM_SELECTOR_LIST) === item) {
      return candidate;
    }
  }

  return item;
}

/** その項目自身に付いているアイコン（入れ子項目のものは除く）。 */
function findOwnBadges(item: HTMLElement): HTMLElement[] {
  return Array.from(item.querySelectorAll<HTMLElement>(BADGE_SELECTOR)).filter(
    (badge) => badge.closest<HTMLElement>(TREE_ITEM_SELECTOR_LIST) === item,
  );
}

/**
 * レビュー済み表示を付与する。何度呼んでもアイコンは 1 つだけになる（冪等）。
 * 変更が発生した場合のみ true を返す。
 */
export function markTreeItemViewed(item: HTMLElement, path: FilePath | null = null): boolean {
  let changed = false;

  if (!item.classList.contains(VIEWED_ITEM_CLASS)) {
    item.classList.add(VIEWED_ITEM_CLASS);
    changed = true;
  }
  if (item.getAttribute(VIEWED_ITEM_ATTRIBUTE) !== 'true') {
    item.setAttribute(VIEWED_ITEM_ATTRIBUTE, 'true');
    changed = true;
  }
  if (path !== null && item.getAttribute(VIEWED_PATH_ATTRIBUTE) !== path) {
    item.setAttribute(VIEWED_PATH_ATTRIBUTE, path);
    changed = true;
  }

  const badges = findOwnBadges(item);
  if (badges.length === 0) {
    findBadgeHost(item).appendChild(createBadge(item.ownerDocument));
    changed = true;
  } else if (badges.length > 1) {
    // 何らかの理由で重複した場合は 1 つに戻す。
    for (const extra of badges.slice(1)) extra.remove();
    changed = true;
  }

  return changed;
}

/** レビュー済み表示を取り除く。変更が発生した場合のみ true を返す。 */
export function unmarkTreeItemViewed(item: HTMLElement): boolean {
  let changed = false;

  if (item.classList.contains(VIEWED_ITEM_CLASS)) {
    item.classList.remove(VIEWED_ITEM_CLASS);
    changed = true;
  }
  if (item.hasAttribute(VIEWED_ITEM_ATTRIBUTE)) {
    item.removeAttribute(VIEWED_ITEM_ATTRIBUTE);
    changed = true;
  }
  if (item.hasAttribute(VIEWED_PATH_ATTRIBUTE)) {
    item.removeAttribute(VIEWED_PATH_ATTRIBUTE);
    changed = true;
  }
  for (const badge of findOwnBadges(item)) {
    badge.remove();
    changed = true;
  }

  return changed;
}

/**
 * ツリー全体へ Viewed 状態を反映する（初期同期・ツリー再描画時に使用）。
 * 反映した項目数を返す。
 */
export function applyViewedStateToTree(
  root: ParentNode | null,
  viewedByPath: ReadonlyMap<FilePath, boolean>,
  viewedByAnchorId: ReadonlyMap<DiffAnchorId, boolean> = new Map(),
): number {
  let updated = 0;

  for (const entry of readTreeFileEntries(root)) {
    const byPath = entry.path === null ? undefined : viewedByPath.get(entry.path);
    const byAnchor = entry.anchorId === null ? undefined : viewedByAnchorId.get(entry.anchorId);
    const viewed = byPath ?? byAnchor ?? false;

    const changed = viewed
      ? markTreeItemViewed(entry.element, entry.path)
      : unmarkTreeItemViewed(entry.element);
    if (changed) updated += 1;
  }

  return updated;
}

/** 拡張が付けた表示をすべて取り除く（停止時のクリーンアップ）。 */
export function clearViewedMarkers(root: ParentNode | null): void {
  if (root === null) return;

  for (const item of root.querySelectorAll<HTMLElement>(`.${VIEWED_ITEM_CLASS}`)) {
    item.classList.remove(VIEWED_ITEM_CLASS);
    item.removeAttribute(VIEWED_ITEM_ATTRIBUTE);
    item.removeAttribute(VIEWED_PATH_ATTRIBUTE);
  }
  for (const badge of root.querySelectorAll<HTMLElement>(BADGE_SELECTOR)) {
    badge.remove();
  }
}
