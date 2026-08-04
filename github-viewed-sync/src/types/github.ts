/**
 * GitHub の PR 画面から読み取った情報を表す型定義。
 * DOM そのものではなく「抽出後の値」を表現し、解析処理を純関数に保つための境界になる。
 */

/** リポジトリルートからの完全なファイルパス（例: `src/components/Button.tsx`）。 */
export type FilePath = string;

/**
 * ファイルツリーのリンク先アンカー ID（`#` を含まない。例: `diff-1a2b3c`）。
 * パス解決に失敗した場合の代替キーとして使う。
 */
export type DiffAnchorId = string;

/** diff 側の 1 ファイル分の Viewed 状態。 */
export interface DiffFileEntry {
  path: FilePath;
  anchorId: DiffAnchorId | null;
  viewed: boolean;
}

/** ファイルツリー側の 1 ファイル分のエントリ。 */
export interface TreeFileEntry {
  /** 解決できなかった場合は null（その場合は anchorId で対応付ける）。 */
  path: FilePath | null;
  anchorId: DiffAnchorId | null;
  element: HTMLElement;
}

/** ファイルパスごとの Viewed 状態。 */
export type ViewedStateMap = Map<FilePath, boolean>;

/** 前回状態との差分 1 件。 */
export interface ViewedStateChange {
  path: FilePath;
  viewed: boolean;
}
