/**
 * デバッグログ。既定では無効で、通常利用時に console を汚さない。
 *
 * 有効化 / 無効化は DevTools の Application → Local Storage（`https://github.com`）で
 * `github-viewed-sync:debug` に `1` を設定 / 行を削除する。
 * コンソールへのコード貼り付けは Chrome にブロックされるため、手順は README を参照。
 */

/** ビルド時に固定で有効化したい場合はここを true にする。 */
const DEBUG = false;

export const DEBUG_STORAGE_KEY = 'github-viewed-sync:debug';

const LOG_PREFIX = '[github-viewed-sync]';

/**
 * localStorage へのアクセス可否はブラウザ設定に依存するため、例外を握り潰す。
 * ここで失敗しても「デバッグログが出ない」だけで、拡張の動作には影響しない。
 */
function readStoredFlag(): boolean {
  try {
    return window.localStorage.getItem(DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function isDebugEnabled(): boolean {
  return DEBUG || readStoredFlag();
}

export function debugLog(...args: unknown[]): void {
  if (!isDebugEnabled()) return;
  console.debug(LOG_PREFIX, ...args);
}

export function warnLog(...args: unknown[]): void {
  console.warn(LOG_PREFIX, ...args);
}
