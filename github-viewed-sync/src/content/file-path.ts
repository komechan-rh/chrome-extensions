import type { DiffAnchorId, FilePath } from '../types/github';
import { DIFF_ANCHOR_ID_PREFIX } from './dom-selectors';

/** リネーム表示（`old → new`）で使われる矢印表現。 */
const RENAME_ARROWS = ['→', '⇒', '->'];

/**
 * DOM から取得した生のパス文字列を正規化する。
 * - 前後の空白・不可視文字を除去
 * - リネーム表示は「新しいパス」を採用
 * - 先頭の `./` `/` を除去
 * 正規化できない場合は null。
 */
export function normalizeFilePath(raw: string | null | undefined): FilePath | null {
  if (raw === null || raw === undefined) return null;

  let value = raw.replace(/\s+/g, ' ').trim();
  if (value === '') return null;

  for (const arrow of RENAME_ARROWS) {
    const index = value.lastIndexOf(arrow);
    if (index >= 0) {
      value = value.slice(index + arrow.length).trim();
    }
  }

  value = value.replace(/^\.\//, '').replace(/^\/+/, '').trim();
  if (value === '' || value === '.') return null;

  return value;
}

/**
 * `#diff-xxxx` 形式の href / id から diff アンカー ID を取り出す。
 */
export function normalizeDiffAnchorId(raw: string | null | undefined): DiffAnchorId | null {
  if (raw === null || raw === undefined) return null;

  const value = raw.trim();
  if (value === '') return null;

  const hashIndex = value.lastIndexOf('#');
  const candidate = hashIndex >= 0 ? value.slice(hashIndex + 1) : value;
  if (!candidate.startsWith(DIFF_ANCHOR_ID_PREFIX)) return null;
  if (candidate.length <= DIFF_ANCHOR_ID_PREFIX.length) return null;

  // GitHub は `#diff-<hash>R12` のように行アンカーを付ける場合がある。
  return candidate.replace(/(L|R)\d+(-(L|R)?\d+)?$/, '');
}

/**
 * ディレクトリ階層のラベル列とファイル名から完全なパスを組み立てる。
 * ラベル側が既に完全パスを持っている場合（例: `src/components/Button.tsx`）は二重連結しない。
 */
export function joinTreePathSegments(
  ancestorLabels: readonly string[],
  ownLabel: string,
): FilePath | null {
  const normalizedOwn = normalizeFilePath(ownLabel);
  if (normalizedOwn === null) return null;

  const segments = ancestorLabels
    .map((label) => normalizeFilePath(label))
    .filter((label): label is string => label !== null);

  if (segments.length === 0) return normalizedOwn;

  const prefix = segments.join('/');
  if (normalizedOwn === prefix || normalizedOwn.startsWith(`${prefix}/`)) {
    return normalizedOwn;
  }

  return `${prefix}/${normalizedOwn}`;
}
