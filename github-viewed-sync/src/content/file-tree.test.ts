import { afterEach, describe, expect, it } from 'vitest';
import { createPrFilesPage, resetDom } from '../test/fixtures';
import {
  VIEWED_BADGE_ATTRIBUTE,
  VIEWED_BADGE_LABEL,
  VIEWED_ITEM_ATTRIBUTE,
  VIEWED_ITEM_CLASS,
  applyViewedStateToTree,
  buildTreeIndex,
  clearViewedMarkers,
  markTreeItemViewed,
  readTreeFileEntries,
  resolveTreeItemPath,
  unmarkTreeItemViewed,
} from './file-tree';

afterEach(resetDom);

const badgesIn = (root: ParentNode): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(`[${VIEWED_BADGE_ATTRIBUTE}]`));

describe('ファイルツリーのパス解決', () => {
  it('ファイル名しか表示されていなくても祖先ディレクトリから完全パスを組み立てる', () => {
    const fixture = createPrFilesPage({
      files: [{ path: 'src/components/Button.tsx' }, { path: 'README.md' }],
    });

    expect(resolveTreeItemPath(fixture.getTreeItem('src/components/Button.tsx'))).toBe(
      'src/components/Button.tsx',
    );
    expect(resolveTreeItemPath(fixture.getTreeItem('README.md'))).toBe('README.md');
  });

  it('同名ファイルを完全パスで区別できる', () => {
    const fixture = createPrFilesPage({
      files: [{ path: 'src/components/index.ts' }, { path: 'src/pages/index.ts' }],
    });

    expect(resolveTreeItemPath(fixture.getTreeItem('src/components/index.ts'))).toBe(
      'src/components/index.ts',
    );
    expect(resolveTreeItemPath(fixture.getTreeItem('src/pages/index.ts'))).toBe(
      'src/pages/index.ts',
    );
  });

  it('data-file-path 属性があればそれを優先する', () => {
    const fixture = createPrFilesPage({
      files: [{ path: 'src/pages/index.ts' }],
      treePathAttribute: true,
    });

    expect(resolveTreeItemPath(fixture.getTreeItem('src/pages/index.ts'))).toBe(
      'src/pages/index.ts',
    );
  });

  it('新 UI は treeitem の id（完全パス）から解決する', () => {
    const fixture = createPrFilesPage({
      ui: 'next',
      files: [
        { path: 'src/features/notes/components/note-dialog.tsx' },
        { path: 'src/features/notes/index.tsx' },
      ],
    });

    expect(
      resolveTreeItemPath(fixture.getTreeItem('src/features/notes/components/note-dialog.tsx')),
    ).toBe('src/features/notes/components/note-dialog.tsx');
    expect(resolveTreeItemPath(fixture.getTreeItem('src/features/notes/index.tsx'))).toBe(
      'src/features/notes/index.tsx',
    );
  });

  it('id が内部 ID（_R_xxx_）の場合はラベルから解決する', () => {
    document.body.innerHTML = `
      <div id="repos-file-tree">
        <ul role="tree">
          <li role="treeitem" id="_R_abc_" aria-expanded="true">
            <span class="PRIVATE_TreeView-item-content-text">src</span>
            <ul role="group">
              <li role="treeitem" id="_R_def_">
                <span class="PRIVATE_TreeView-item-content-text">a.ts</span>
              </li>
            </ul>
          </li>
        </ul>
      </div>`;

    const entries = readTreeFileEntries(document.querySelector('#repos-file-tree'));

    expect(entries.map((entry) => entry.path)).toEqual(['src/a.ts']);
  });

  it('data-tree-entry-type が無い旧 UI でもファイル項目を判別できる', () => {
    document.body.innerHTML = `
      <div id="repos-file-tree">
        <ul role="tree">
          <li role="treeitem">
            <span class="ActionList-item-label">src</span>
            <ul role="group">
              <li role="treeitem">
                <a href="#diff-srcats" title="a.ts"><span class="ActionList-item-label">a.ts</span></a>
              </li>
            </ul>
          </li>
        </ul>
      </div>`;

    const entries = readTreeFileEntries(document.querySelector('#repos-file-tree'));

    expect(entries).toHaveLength(1);
    expect(entries[0]?.path).toBe('src/a.ts');
    expect(entries[0]?.anchorId).toBe('diff-srcats');
  });

  it('ディレクトリ項目はファイルとして扱わない', () => {
    const fixture = createPrFilesPage({ files: [{ path: 'src/a.ts' }] });

    const paths = readTreeFileEntries(fixture.treeContainer).map((entry) => entry.path);

    expect(paths).toEqual(['src/a.ts']);
  });
});

describe('レビュー済み表示の反映', () => {
  it('Viewed オン時にクラスとアイコンが追加される', () => {
    const fixture = createPrFilesPage({
      files: [{ path: 'src/components/index.ts' }, { path: 'src/pages/index.ts' }],
    });

    applyViewedStateToTree(
      fixture.treeContainer,
      new Map([
        ['src/components/index.ts', true],
        ['src/pages/index.ts', false],
      ]),
    );

    const viewedItem = fixture.getTreeItem('src/components/index.ts');
    const notViewedItem = fixture.getTreeItem('src/pages/index.ts');

    expect(viewedItem.classList.contains(VIEWED_ITEM_CLASS)).toBe(true);
    expect(viewedItem.getAttribute(VIEWED_ITEM_ATTRIBUTE)).toBe('true');
    expect(badgesIn(viewedItem)).toHaveLength(1);

    const badge = badgesIn(viewedItem)[0];
    expect(badge?.textContent).toBe('✓');
    expect(badge?.getAttribute('aria-label')).toBe(VIEWED_BADGE_LABEL);
    expect(badge?.getAttribute('title')).toBe(VIEWED_BADGE_LABEL);
    expect(badge?.getAttribute('role')).toBe('img');

    expect(notViewedItem.classList.contains(VIEWED_ITEM_CLASS)).toBe(false);
    expect(badgesIn(notViewedItem)).toHaveLength(0);
  });

  it('Viewed オフ時に表示が削除される', () => {
    const fixture = createPrFilesPage({ files: [{ path: 'src/a.ts' }] });
    const item = fixture.getTreeItem('src/a.ts');

    applyViewedStateToTree(fixture.treeContainer, new Map([['src/a.ts', true]]));
    expect(badgesIn(item)).toHaveLength(1);

    applyViewedStateToTree(fixture.treeContainer, new Map([['src/a.ts', false]]));

    expect(item.classList.contains(VIEWED_ITEM_CLASS)).toBe(false);
    expect(item.hasAttribute(VIEWED_ITEM_ATTRIBUTE)).toBe(false);
    expect(badgesIn(item)).toHaveLength(0);
  });

  it('再実行してもアイコンが重複しない', () => {
    const fixture = createPrFilesPage({ files: [{ path: 'src/a.ts' }] });
    const item = fixture.getTreeItem('src/a.ts');
    const state = new Map([['src/a.ts', true]]);

    applyViewedStateToTree(fixture.treeContainer, state);
    applyViewedStateToTree(fixture.treeContainer, state);
    markTreeItemViewed(item, 'src/a.ts');
    markTreeItemViewed(item, 'src/a.ts');

    expect(badgesIn(item)).toHaveLength(1);
  });

  it('2 回目以降の反映では DOM を変更しない（変更件数 0）', () => {
    const fixture = createPrFilesPage({ files: [{ path: 'src/a.ts' }] });
    const state = new Map([['src/a.ts', true]]);

    expect(applyViewedStateToTree(fixture.treeContainer, state)).toBe(1);
    expect(applyViewedStateToTree(fixture.treeContainer, state)).toBe(0);
  });

  it('パスが解決できない項目はアンカー ID で対応付ける', () => {
    document.body.innerHTML = `
      <div id="repos-file-tree">
        <ul role="tree">
          <li role="treeitem" data-tree-entry-type="file">
            <a href="#diff-anchoronly"><svg aria-hidden="true"></svg></a>
          </li>
        </ul>
      </div>`;
    const root = document.querySelector<HTMLElement>('#repos-file-tree');
    const item = document.querySelector<HTMLElement>('[role="treeitem"]');

    applyViewedStateToTree(root, new Map(), new Map([['diff-anchoronly', true]]));

    expect(item?.classList.contains(VIEWED_ITEM_CLASS)).toBe(true);
    expect(badgesIn(item!)).toHaveLength(1);
  });

  it('unmarkTreeItemViewed は変更が無ければ false を返す', () => {
    const fixture = createPrFilesPage({ files: [{ path: 'src/a.ts' }] });
    const item = fixture.getTreeItem('src/a.ts');

    expect(unmarkTreeItemViewed(item)).toBe(false);
    markTreeItemViewed(item, 'src/a.ts');
    expect(unmarkTreeItemViewed(item)).toBe(true);
  });

  it('clearViewedMarkers で拡張が付けた表示をすべて消せる', () => {
    const fixture = createPrFilesPage({ files: [{ path: 'src/a.ts' }, { path: 'src/b.ts' }] });

    applyViewedStateToTree(
      fixture.treeContainer,
      new Map([
        ['src/a.ts', true],
        ['src/b.ts', true],
      ]),
    );
    clearViewedMarkers(fixture.treeContainer);

    expect(badgesIn(document.body)).toHaveLength(0);
    expect(document.querySelectorAll(`.${VIEWED_ITEM_CLASS}`)).toHaveLength(0);
  });
});

describe('buildTreeIndex', () => {
  it('パスとアンカー ID の両方から項目を引ける', () => {
    const fixture = createPrFilesPage({ files: [{ path: 'src/a.ts' }] });

    const index = buildTreeIndex(fixture.treeContainer);

    expect(index.byPath.get('src/a.ts')).toEqual([fixture.getTreeItem('src/a.ts')]);
    expect(index.byAnchorId.get('diff-srcats')).toEqual([fixture.getTreeItem('src/a.ts')]);
    expect(index.entries).toHaveLength(1);
  });
});
