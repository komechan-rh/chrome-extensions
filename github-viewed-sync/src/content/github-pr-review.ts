import type { DiffAnchorId, FilePath } from '../types/github';
import { debugLog } from './debug';
import { findDiffContainer, findFileTreeContainer } from './dom-selectors';
import {
  VIEWED_BADGE_ATTRIBUTE,
  applyViewedStateToTree,
  buildTreeIndex,
  clearViewedMarkers,
  markTreeItemViewed,
  unmarkTreeItemViewed,
  type TreeIndex,
} from './file-tree';
import { diffViewedStates, isViewedControl, readDiffFileEntries } from './viewed-state';

/**
 * diff 側の Viewed 状態とファイルツリー表示を同期させるコントローラ。
 * MutationObserver の登録・解除、debounce、差分適用（＝毎回フルスキャンしない）を担う。
 */

/** diff 側で監視する属性。class は変更が多くノイズになるため対象にしない。 */
const DIFF_ATTRIBUTE_FILTER = ['checked', 'aria-checked', 'data-viewed', 'data-file-user-viewed'];

/** DOM 変化をまとめる既定の待ち時間（ms）。 */
const DEFAULT_DEBOUNCE_MS = 100;
/** ルート監視（コンテナの出現・差し替え検知）の待ち時間（ms）。 */
const CONTAINER_CHECK_DEBOUNCE_MS = 250;

/** 自分が追加・削除したアイコンによる変化かどうか。 */
function isOwnBadgeNode(node: Node): boolean {
  return (
    node.nodeType === Node.ELEMENT_NODE && (node as Element).hasAttribute(VIEWED_BADGE_ATTRIBUTE)
  );
}

/** 自分の DOM 操作だけが原因の mutation は無視する（無駄な再同期を防ぐ）。 */
function isOwnTreeMutation(record: MutationRecord): boolean {
  if (record.type !== 'childList') return false;
  const nodes = [...record.addedNodes, ...record.removedNodes];
  return nodes.length > 0 && nodes.every(isOwnBadgeNode);
}

export interface PrReviewSyncOptions {
  /** テスト用に document を差し替えられるようにする。 */
  document?: Document;
  debounceMs?: number;
}

export interface PrReviewSync {
  start(): void;
  stop(): void;
  /** debounce を挟まず即座に同期する。 */
  syncNow(reason?: string): void;
  isRunning(): boolean;
}

export function createPrReviewSync(options: PrReviewSyncOptions = {}): PrReviewSync {
  const doc = options.document ?? document;
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;

  let running = false;

  /** 直前に反映した Viewed 状態。差分適用の基準になる。 */
  let viewedState = new Map<FilePath, boolean>();
  let anchorIdByPath = new Map<FilePath, DiffAnchorId>();

  let treeIndex: TreeIndex | null = null;
  let treeIndexDirty = true;

  let diffTarget: HTMLElement | null = null;
  let treeTarget: HTMLElement | null = null;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let scheduledDelay = Number.POSITIVE_INFINITY;

  const scheduleSync = (delay: number): void => {
    if (!running) return;
    if (timer !== null) {
      if (delay >= scheduledDelay) return;
      clearTimeout(timer);
    }
    scheduledDelay = delay;
    timer = setTimeout(() => {
      timer = null;
      scheduledDelay = Number.POSITIVE_INFINITY;
      sync('debounced');
    }, delay);
  };

  const cancelScheduledSync = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    scheduledDelay = Number.POSITIVE_INFINITY;
  };

  const diffObserver = new MutationObserver(() => {
    scheduleSync(debounceMs);
  });

  const treeObserver = new MutationObserver((records) => {
    if (records.every(isOwnTreeMutation)) return;
    treeIndexDirty = true;
    scheduleSync(debounceMs);
  });

  /** diff / ツリーのコンテナ自体が差し替わったかを見張る。 */
  const rootObserver = new MutationObserver(() => {
    scheduleSync(CONTAINER_CHECK_DEBOUNCE_MS);
  });

  const handleChangeEvent = (event: Event): void => {
    if (!isViewedControl(event.target)) return;
    // クリック直後は即座に反映して待たせない。
    scheduleSync(0);
  };

  /**
   * 現在のコンテナに observer を張り直す。同じ要素なら再登録しない（重複登録の防止）。
   */
  const attachContainerObservers = (): void => {
    const nextDiffTarget = findDiffContainer(doc);
    if (nextDiffTarget !== diffTarget) {
      diffObserver.disconnect();
      diffTarget = nextDiffTarget;
      if (diffTarget !== null) {
        diffObserver.observe(diffTarget, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: DIFF_ATTRIBUTE_FILTER,
        });
        debugLog('diff observer attached');
      }
    }

    const nextTreeTarget = findFileTreeContainer(doc);
    if (nextTreeTarget !== treeTarget) {
      treeObserver.disconnect();
      treeTarget = nextTreeTarget;
      treeIndex = null;
      treeIndexDirty = true;
      if (treeTarget !== null) {
        treeObserver.observe(treeTarget, { childList: true, subtree: true });
        debugLog('file tree observer attached');
      }
    }
  };

  const elementsForPath = (index: TreeIndex, path: FilePath): HTMLElement[] => {
    const byPath = index.byPath.get(path);
    if (byPath !== undefined) return byPath;

    const anchorId = anchorIdByPath.get(path);
    if (anchorId === undefined) return [];
    return index.byAnchorId.get(anchorId) ?? [];
  };

  const sync = (reason: string): void => {
    if (!running) return;
    cancelScheduledSync();
    attachContainerObservers();

    const diffEntries = readDiffFileEntries(diffTarget);
    const nextState = new Map<FilePath, boolean>();
    const nextAnchorIdByPath = new Map<FilePath, DiffAnchorId>();
    const nextStateByAnchorId = new Map<DiffAnchorId, boolean>();

    for (const entry of diffEntries) {
      nextState.set(entry.path, entry.viewed);
      if (entry.anchorId !== null) {
        nextAnchorIdByPath.set(entry.path, entry.anchorId);
        nextStateByAnchorId.set(entry.anchorId, entry.viewed);
      }
    }

    const changes = diffViewedStates(viewedState, nextState);
    viewedState = nextState;
    anchorIdByPath = nextAnchorIdByPath;

    const needsFullApply = treeIndexDirty || treeIndex === null;
    if (needsFullApply) {
      treeIndex = buildTreeIndex(treeTarget);
      treeIndexDirty = false;
    }

    let updated = 0;
    if (needsFullApply) {
      // ツリーが（再）描画された直後は全項目へ反映する。
      updated = applyViewedStateToTree(treeTarget, nextState, nextStateByAnchorId);
    } else if (changes.length > 0 && treeIndex !== null) {
      // 定常状態では変化したファイルのみ触る。
      for (const change of changes) {
        for (const element of elementsForPath(treeIndex, change.path)) {
          const changed = change.viewed
            ? markTreeItemViewed(element, change.path)
            : unmarkTreeItemViewed(element);
          if (changed) updated += 1;
        }
      }
    }

    if (updated > 0 || changes.length > 0) {
      debugLog('sync', {
        reason,
        diffFiles: diffEntries.length,
        viewedFiles: [...nextState.values()].filter(Boolean).length,
        treeFiles: treeIndex?.entries.length ?? 0,
        changes: changes.length,
        updatedTreeItems: updated,
        fullApply: needsFullApply,
      });
    }
  };

  return {
    start(): void {
      if (running) return;
      running = true;

      doc.addEventListener('change', handleChangeEvent, true);
      rootObserver.observe(doc.documentElement, { childList: true, subtree: true });
      debugLog('started');

      sync('start');
    },

    stop(): void {
      if (!running) return;
      running = false;

      cancelScheduledSync();
      doc.removeEventListener('change', handleChangeEvent, true);
      rootObserver.disconnect();
      diffObserver.disconnect();
      treeObserver.disconnect();

      // ツリーが差し替わっていても取り残しが出ないよう、document 全体から撤去する
      // （検索対象は拡張が付けたクラス・属性のみなので負荷は小さい）。
      clearViewedMarkers(doc);

      diffTarget = null;
      treeTarget = null;
      treeIndex = null;
      treeIndexDirty = true;
      viewedState = new Map();
      anchorIdByPath = new Map();
      debugLog('stopped');
    },

    syncNow(reason = 'manual'): void {
      sync(reason);
    },

    isRunning(): boolean {
      return running;
    },
  };
}
