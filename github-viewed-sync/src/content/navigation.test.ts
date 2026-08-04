import { afterEach, describe, expect, it } from 'vitest';
import { createPrFilesPage, resetDom } from '../test/fixtures';
import { isPrFilesPathname } from './dom-selectors';
import { VIEWED_BADGE_ATTRIBUTE, VIEWED_ITEM_CLASS } from './file-tree';
import { createPrReviewSync } from './github-pr-review';
import { createNavigationWatcher, type NavigationWatcher } from './navigation';

const FILES_URL = '/octocat/hello-world/pull/42/files';
const CONVERSATION_URL = '/octocat/hello-world/pull/42';

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

let watcher: NavigationWatcher | null = null;

function startWatcher(): NavigationWatcher {
  const created = createNavigationWatcher(createPrReviewSync({ debounceMs: 5 }), {
    evaluateDebounceMs: 5,
    // ポーリングはテストでは使わない（イベント経由の再初期化を検証する）。
    pollIntervalMs: 10_000,
  });
  watcher = created;
  created.start();
  return created;
}

const badgeCount = (): number =>
  document.querySelectorAll(`[${VIEWED_BADGE_ATTRIBUTE}]`).length;

afterEach(() => {
  watcher?.stop();
  watcher = null;
  resetDom();
  history.pushState({}, '', '/');
});

describe('isPrFilesPathname', () => {
  it('PR の Files changed 画面だけに一致する', () => {
    expect(isPrFilesPathname('/octocat/hello-world/pull/42/files')).toBe(true);
    expect(isPrFilesPathname('/octocat/hello-world/pull/42/files/abc123')).toBe(true);
    expect(isPrFilesPathname('/octocat/hello-world/pull/42')).toBe(false);
    expect(isPrFilesPathname('/octocat/hello-world/pull/42/commits')).toBe(false);
    expect(isPrFilesPathname('/octocat/hello-world/issues/42')).toBe(false);
    expect(isPrFilesPathname('/octocat/hello-world')).toBe(false);
  });
});

describe('SPA 遷移への追従', () => {
  it('対象外の画面では同期を開始しない', () => {
    history.pushState({}, '', CONVERSATION_URL);
    const fixture = createPrFilesPage({ files: [{ path: 'src/a.ts', viewed: true }] });

    startWatcher();

    expect(fixture.getTreeItem('src/a.ts').classList.contains(VIEWED_ITEM_CLASS)).toBe(false);
  });

  it('Conversation から Files changed へ遷移すると再初期化される', async () => {
    history.pushState({}, '', CONVERSATION_URL);
    startWatcher();
    const fixture = createPrFilesPage({
      files: [
        { path: 'src/components/index.ts', viewed: true },
        { path: 'src/pages/index.ts', viewed: false },
      ],
    });
    expect(badgeCount()).toBe(0);

    // GitHub の SPA 遷移（Turbo）を再現する。
    history.pushState({}, '', FILES_URL);
    document.dispatchEvent(new Event('turbo:load'));
    await wait(40);

    expect(fixture.getTreeItem('src/components/index.ts').classList.contains(VIEWED_ITEM_CLASS)).toBe(
      true,
    );
    expect(fixture.getTreeItem('src/pages/index.ts').classList.contains(VIEWED_ITEM_CLASS)).toBe(
      false,
    );
    expect(badgeCount()).toBe(1);
  });

  it('別 PR へ遷移しても新しい画面へ反映される', async () => {
    history.pushState({}, '', FILES_URL);
    createPrFilesPage({ files: [{ path: 'src/a.ts', viewed: true }] });
    startWatcher();
    expect(badgeCount()).toBe(1);

    // 画面が丸ごと差し替わる遷移を再現する。
    resetDom();
    history.pushState({}, '', '/octocat/hello-world/pull/43/files');
    const nextFixture = createPrFilesPage({
      files: [{ path: 'src/b.ts', viewed: true }, { path: 'src/c.ts' }],
    });
    document.dispatchEvent(new Event('turbo:render'));
    await wait(40);

    expect(nextFixture.getTreeItem('src/b.ts').classList.contains(VIEWED_ITEM_CLASS)).toBe(true);
    expect(nextFixture.getTreeItem('src/c.ts').classList.contains(VIEWED_ITEM_CLASS)).toBe(false);
    expect(badgeCount()).toBe(1);
  });

  it('Files changed から離れると表示を取り除いて停止する', async () => {
    history.pushState({}, '', FILES_URL);
    createPrFilesPage({ files: [{ path: 'src/a.ts', viewed: true }] });
    startWatcher();
    expect(badgeCount()).toBe(1);

    history.pushState({}, '', CONVERSATION_URL);
    document.dispatchEvent(new Event('turbo:load'));
    await wait(40);

    expect(badgeCount()).toBe(0);
    expect(document.querySelectorAll(`.${VIEWED_ITEM_CLASS}`)).toHaveLength(0);
  });

  it('同じ画面での部分更新イベントでも再同期する（ツリーの遅延レンダリング）', async () => {
    history.pushState({}, '', FILES_URL);
    const fixture = createPrFilesPage({
      files: [{ path: 'src/a.ts', viewed: true }],
      includeTree: false,
    });
    startWatcher();
    expect(badgeCount()).toBe(0);

    fixture.appendTree();
    document.dispatchEvent(new Event('turbo:frame-render'));
    await wait(40);

    expect(fixture.getTreeItem('src/a.ts').classList.contains(VIEWED_ITEM_CLASS)).toBe(true);
  });

  it('popstate（ブラウザバック）でも評価される', async () => {
    history.pushState({}, '', FILES_URL);
    const fixture = createPrFilesPage({ files: [{ path: 'src/a.ts', viewed: true }] });
    startWatcher();
    expect(badgeCount()).toBe(1);

    history.pushState({}, '', CONVERSATION_URL);
    window.dispatchEvent(new PopStateEvent('popstate'));
    await wait(40);
    expect(badgeCount()).toBe(0);

    history.pushState({}, '', FILES_URL);
    window.dispatchEvent(new PopStateEvent('popstate'));
    await wait(40);

    expect(fixture.getTreeItem('src/a.ts').classList.contains(VIEWED_ITEM_CLASS)).toBe(true);
  });
});
