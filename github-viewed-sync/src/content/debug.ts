/**
 * デバッグログ。既定では無効で、通常利用時に console を汚さない。
 *
 * 有効化（GitHub のページで DevTools のコンソールから実行）:
 *   localStorage.setItem('github-viewed-sync:debug', '1')
 * 無効化:
 *   localStorage.removeItem('github-viewed-sync:debug')
 */

/** ビルド時に固定で有効化したい場合はここを true にする。 */
const DEBUG = false;

export const DEBUG_STORAGE_KEY = 'github-viewed-sync:debug';

const LOG_PREFIX = '[github-viewed-sync]';

/** localStorage へのアクセス可否はブラウザ設定に依存するため、例外を握り潰す。 */
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

export function setDebugEnabled(enabled: boolean): void {
  try {
    if (enabled) {
      window.localStorage.setItem(DEBUG_STORAGE_KEY, '1');
    } else {
      window.localStorage.removeItem(DEBUG_STORAGE_KEY);
    }
  } catch {
    // ストレージが使えない環境では何もしない。
  }
}

export function debugLog(...args: unknown[]): void {
  if (!isDebugEnabled()) return;
  console.debug(LOG_PREFIX, ...args);
}

export function warnLog(...args: unknown[]): void {
  console.warn(LOG_PREFIX, ...args);
}
