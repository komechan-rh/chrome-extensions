import { debugLog } from './debug';
import { isPrFilesPathname } from './dom-selectors';

/**
 * GitHub の SPA（Turbo / soft nav）遷移に追従し、対象画面でのみ同期を有効化する。
 *
 * content script は分離ワールドで動くため、ページ側の history.pushState を
 * ラップしても検知できない。そのため
 *   1. GitHub が発火する DOM イベント（DOM イベントはワールドを越えて届く）
 *   2. popstate / pageshow
 *   3. Navigation API（あれば）
 *   4. location.href の軽量ポーリング（最後の砦）
 * を併用する。
 */

/** GitHub が SPA 遷移で発火するイベント（新旧の実装を両方カバーする）。 */
const DOCUMENT_NAVIGATION_EVENTS = [
  'DOMContentLoaded',
  'turbo:load',
  'turbo:render',
  'turbo:visit',
  'turbo:frame-load',
  'turbo:frame-render',
  'pjax:end',
  'soft-nav:end',
  'soft-nav:success',
] as const;

const WINDOW_NAVIGATION_EVENTS = ['popstate', 'pageshow'] as const;

/** URL 変化のポーリング間隔（ms）。href の文字列比較のみなので負荷は無視できる。 */
const LOCATION_POLL_INTERVAL_MS = 500;

/** イベントが連続して飛ぶため、評価をまとめる待ち時間（ms）。 */
const EVALUATE_DEBOUNCE_MS = 50;

/** 遷移で start / stop / 再同期される対象。 */
export interface NavigationSyncTarget {
  start(): void;
  stop(): void;
  syncNow(reason?: string): void;
  isRunning(): boolean;
}

export interface NavigationWatcherOptions {
  window?: Window;
  /** 対象画面かどうかの判定（既定は PR の Files changed 画面）。 */
  matchesTargetPage?: (url: URL) => boolean;
  evaluateDebounceMs?: number;
  pollIntervalMs?: number;
}

export interface NavigationWatcher {
  start(): void;
  stop(): void;
  /** 現在の URL を評価して start / stop / 再同期を行う。 */
  evaluate(reason?: string): void;
}

interface NavigationApiLike {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

function getNavigationApi(win: Window): NavigationApiLike | null {
  const candidate = (win as unknown as { navigation?: NavigationApiLike }).navigation;
  if (candidate === undefined || typeof candidate.addEventListener !== 'function') return null;
  return candidate;
}

export function createNavigationWatcher(
  target: NavigationSyncTarget,
  options: NavigationWatcherOptions = {},
): NavigationWatcher {
  const win = options.window ?? window;
  const doc = win.document;
  const matchesTargetPage = options.matchesTargetPage ?? ((url: URL) => isPrFilesPathname(url.pathname));
  const evaluateDebounceMs = options.evaluateDebounceMs ?? EVALUATE_DEBOUNCE_MS;
  const pollIntervalMs = options.pollIntervalMs ?? LOCATION_POLL_INTERVAL_MS;

  let watching = false;
  let lastHref = '';
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  const navigationApi = getNavigationApi(win);

  const evaluate = (reason = 'manual'): void => {
    const href = win.location.href;
    const urlChanged = href !== lastHref;
    lastHref = href;

    if (!matchesTargetPage(new URL(href))) {
      if (target.isRunning()) {
        debugLog('leaving target page', { reason, href });
        target.stop();
      }
      return;
    }

    if (!target.isRunning()) {
      debugLog('entering target page', { reason, href });
      target.start();
      return;
    }

    // 同じ画面でも遅延レンダリングや部分更新があるため再同期する。
    target.syncNow(urlChanged ? `navigation:${reason}` : `update:${reason}`);
  };

  const scheduleEvaluate = (reason: string): void => {
    if (!watching) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      evaluate(reason);
    }, evaluateDebounceMs);
  };

  const documentListener = (event: Event): void => {
    scheduleEvaluate(event.type);
  };
  const windowListener = (event: Event): void => {
    scheduleEvaluate(event.type);
  };
  const navigationListener = (): void => {
    scheduleEvaluate('navigatesuccess');
  };

  return {
    start(): void {
      if (watching) return;
      watching = true;

      for (const type of DOCUMENT_NAVIGATION_EVENTS) {
        doc.addEventListener(type, documentListener);
      }
      for (const type of WINDOW_NAVIGATION_EVENTS) {
        win.addEventListener(type, windowListener);
      }
      navigationApi?.addEventListener('navigatesuccess', navigationListener);

      pollTimer = setInterval(() => {
        if (win.location.href !== lastHref) evaluate('poll');
      }, pollIntervalMs);

      evaluate('watcher-start');
    },

    stop(): void {
      if (!watching) return;
      watching = false;

      for (const type of DOCUMENT_NAVIGATION_EVENTS) {
        doc.removeEventListener(type, documentListener);
      }
      for (const type of WINDOW_NAVIGATION_EVENTS) {
        win.removeEventListener(type, windowListener);
      }
      navigationApi?.removeEventListener('navigatesuccess', navigationListener);

      if (timer !== null) clearTimeout(timer);
      timer = null;
      if (pollTimer !== null) clearInterval(pollTimer);
      pollTimer = null;

      target.stop();
    },

    evaluate,
  };
}
