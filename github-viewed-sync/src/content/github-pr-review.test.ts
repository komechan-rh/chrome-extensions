import { afterEach, describe, expect, it } from 'vitest';
import { createPrFilesPage, resetDom, type Fixture } from '../test/fixtures';
import { VIEWED_BADGE_ATTRIBUTE, VIEWED_ITEM_CLASS } from './file-tree';
import { createPrReviewSync, type PrReviewSync } from './github-pr-review';

/** debounce を短くして待ち時間を抑える。 */
const DEBOUNCE_MS = 5;
/** ルート監視（コンテナ出現の検知）は 250ms debounce のため、それより長く待つ。 */
const CONTAINER_WAIT_MS = 400;

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

let sync: PrReviewSync | null = null;

function startSync(): PrReviewSync {
  const created = createPrReviewSync({ debounceMs: DEBOUNCE_MS });
  sync = created;
  created.start();
  return created;
}

const isMarked = (fixture: Fixture, path: string): boolean => {
  const item = fixture.getTreeItem(path);
  return (
    item.classList.contains(VIEWED_ITEM_CLASS) &&
    item.querySelectorAll(`[${VIEWED_BADGE_ATTRIBUTE}]`).length === 1
  );
};

afterEach(() => {
  sync?.stop();
  sync = null;
  resetDom();
});

describe('createPrReviewSync', () => {
  it('初期表示時点で Viewed 済みのファイルをツリーへ反映する', () => {
    const fixture = createPrFilesPage({
      files: [
        { path: 'src/components/index.ts', viewed: true },
        { path: 'src/pages/index.ts', viewed: false },
      ],
    });

    startSync();

    expect(isMarked(fixture, 'src/components/index.ts')).toBe(true);
    expect(isMarked(fixture, 'src/pages/index.ts')).toBe(false);
  });

  it('Viewed をオンにするとツリーへクラスとアイコンが追加される', async () => {
    const fixture = createPrFilesPage({
      files: [{ path: 'src/components/index.ts' }, { path: 'src/pages/index.ts' }],
    });
    startSync();

    fixture.toggleViewed('src/components/index.ts', true);
    await wait(50);

    expect(isMarked(fixture, 'src/components/index.ts')).toBe(true);
    // 同名ファイルへ誤って付かないこと。
    expect(isMarked(fixture, 'src/pages/index.ts')).toBe(false);
  });

  it('Viewed をオフに戻すと表示が削除される', async () => {
    const fixture = createPrFilesPage({ files: [{ path: 'src/a.ts', viewed: true }] });
    startSync();
    expect(isMarked(fixture, 'src/a.ts')).toBe(true);

    fixture.toggleViewed('src/a.ts', false);
    await wait(50);

    const item = fixture.getTreeItem('src/a.ts');
    expect(item.classList.contains(VIEWED_ITEM_CLASS)).toBe(false);
    expect(item.querySelectorAll(`[${VIEWED_BADGE_ATTRIBUTE}]`)).toHaveLength(0);
  });

  it('同期を何度実行してもアイコンが重複しない', async () => {
    const fixture = createPrFilesPage({ files: [{ path: 'src/a.ts', viewed: true }] });
    const controller = startSync();

    controller.syncNow('test');
    controller.syncNow('test');
    fixture.toggleViewed('src/a.ts', true);
    await wait(50);
    controller.syncNow('test');

    expect(fixture.getTreeItem('src/a.ts').querySelectorAll(`[${VIEWED_BADGE_ATTRIBUTE}]`)).toHaveLength(
      1,
    );
  });

  it('ファイルツリーが後から追加されても同期される', async () => {
    const fixture = createPrFilesPage({
      files: [
        { path: 'src/components/index.ts', viewed: true },
        { path: 'src/pages/index.ts', viewed: false },
      ],
      includeTree: false,
    });
    startSync();
    expect(fixture.queryTreeItem('src/components/index.ts')).toBeNull();

    fixture.appendTree();
    await wait(CONTAINER_WAIT_MS);

    expect(isMarked(fixture, 'src/components/index.ts')).toBe(true);
    expect(isMarked(fixture, 'src/pages/index.ts')).toBe(false);
  });

  it('diff ファイルが後から読み込まれても同期される', async () => {
    const fixture = createPrFilesPage({ files: [{ path: 'src/a.ts', viewed: true }] });
    startSync();

    fixture.appendDiffFile({ path: 'src/lazy.ts', viewed: true });
    fixture.appendTree([{ path: 'src/a.ts' }, { path: 'src/lazy.ts' }]);
    await wait(CONTAINER_WAIT_MS);

    expect(isMarked(fixture, 'src/lazy.ts')).toBe(true);
  });

  it('ツリーが GitHub 側で再描画されても再反映される', async () => {
    const fixture = createPrFilesPage({ files: [{ path: 'src/a.ts', viewed: true }] });
    startSync();
    expect(isMarked(fixture, 'src/a.ts')).toBe(true);

    // ツリーの中身だけを差し替える（React の再描画相当）。
    const container = fixture.treeContainer;
    container!.innerHTML = '';
    fixture.appendTree([{ path: 'src/a.ts' }]);
    await wait(CONTAINER_WAIT_MS);

    expect(isMarked(fixture, 'src/a.ts')).toBe(true);
  });

  it('stop で observer を解除し、付けた表示を取り除く', async () => {
    const fixture = createPrFilesPage({ files: [{ path: 'src/a.ts', viewed: true }] });
    const controller = startSync();
    expect(isMarked(fixture, 'src/a.ts')).toBe(true);

    controller.stop();

    expect(controller.isRunning()).toBe(false);
    expect(document.querySelectorAll(`.${VIEWED_ITEM_CLASS}`)).toHaveLength(0);
    expect(document.querySelectorAll(`[${VIEWED_BADGE_ATTRIBUTE}]`)).toHaveLength(0);

    // 停止後は DOM 変化に反応しない。
    fixture.toggleViewed('src/a.ts', true);
    await wait(50);
    expect(document.querySelectorAll(`[${VIEWED_BADGE_ATTRIBUTE}]`)).toHaveLength(0);
  });

  it('start を重ねて呼んでも二重に動作しない', () => {
    const fixture = createPrFilesPage({ files: [{ path: 'src/a.ts', viewed: true }] });
    const controller = startSync();

    controller.start();

    expect(fixture.getTreeItem('src/a.ts').querySelectorAll(`[${VIEWED_BADGE_ATTRIBUTE}]`)).toHaveLength(
      1,
    );
  });
});
