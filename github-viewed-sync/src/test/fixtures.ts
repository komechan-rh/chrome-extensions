/**
 * テスト用の GitHub PR 画面モック。
 * 実 DOM の完全再現ではなく、拡張が依存している属性・構造だけを再現する。
 * GitHub 側の DOM が変わったときは、まずここを実際の HTML に合わせて更新する。
 */

/** アサーション用にテスト側だけが使う属性（拡張のパス解決には使わせない）。 */
export const TEST_PATH_ATTRIBUTE = 'data-test-path';

export interface FixtureFile {
  path: string;
  viewed?: boolean;
}

/**
 * 再現する UI の世代。
 * - `legacy`: `/pull/{n}/files`。`data-tagsearch-path` + `input.js-reviewed-checkbox`
 * - `next`: `/pull/{n}/changes`。`data-file-path` + `button[aria-pressed]`、ツリー項目の id が完全パス
 */
export type FixtureUi = 'legacy' | 'next';

export interface FixtureOptions {
  files?: readonly FixtureFile[];
  /** ファイルツリーを最初から描画するか（false なら後から appendTree で追加できる）。 */
  includeTree?: boolean;
  /** ツリー項目に data-file-path を持たせるか（新しい UI 相当）。 */
  treePathAttribute?: boolean;
  ui?: FixtureUi;
}

export interface Fixture {
  diffContainer: HTMLElement;
  treeContainer: HTMLElement | null;
  /** 後からツリーを描画する（遅延レンダリングの再現）。 */
  appendTree(files?: readonly FixtureFile[]): HTMLElement;
  /** 後から diff ファイルを追加する（追加読み込みの再現）。 */
  appendDiffFile(file: FixtureFile): HTMLElement;
  getDiffFile(path: string): HTMLElement;
  getViewedControl(path: string): HTMLElement;
  getTreeItem(path: string): HTMLElement;
  queryTreeItem(path: string): HTMLElement | null;
  /** Viewed チェックボックスをユーザー操作相当で切り替える。 */
  toggleViewed(path: string, viewed: boolean): void;
}

export function anchorIdFor(path: string): string {
  return `diff-${path.replace(/[^a-zA-Z0-9]/g, '')}`;
}

/** 新 UI の Viewed トグル（`button[aria-label="Viewed"]` + aria-pressed）。 */
function createViewedButton(doc: Document, viewed: boolean): HTMLElement {
  const button = doc.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', 'Viewed');
  button.setAttribute('aria-pressed', String(viewed));
  const icon = doc.createElement('svg');
  icon.setAttribute('aria-hidden', 'true');
  button.appendChild(icon);
  const text = doc.createElement('span');
  text.textContent = 'Viewed';
  button.appendChild(text);
  return button;
}

/**
 * 新しいレビュー UI（/changes）のファイル要素。
 * 実 DOM に合わせて、**コンテナ自身はパス属性を持たず**、
 * 完全パスは中の「Expand all lines」ボタンの data-file-path に入っている。
 */
function createNextDiffFile(doc: Document, file: FixtureFile): HTMLElement {
  const container = doc.createElement('div');
  container.id = anchorIdFor(file.path);

  const header = doc.createElement('div');

  const name = doc.createElement('span');
  // ヘッダーの表示は省略形（完全パスは取れない）。
  name.textContent = `…${file.path.slice(-30)}`;
  header.appendChild(name);

  const expandButton = doc.createElement('button');
  expandButton.type = 'button';
  expandButton.setAttribute('data-component', 'IconButton');
  expandButton.setAttribute('aria-label', `Expand all lines: ${file.path}`);
  expandButton.setAttribute('data-file-path', file.path);
  header.appendChild(expandButton);

  header.appendChild(createViewedButton(doc, file.viewed ?? false));
  container.appendChild(header);

  const body = doc.createElement('div');
  container.appendChild(body);

  return container;
}

function createLegacyDiffFile(doc: Document, file: FixtureFile): HTMLElement {
  const viewed = file.viewed ?? false;
  const container = doc.createElement('div');
  container.className = 'file js-file js-details-container';
  container.id = anchorIdFor(file.path);
  container.setAttribute('data-tagsearch-path', file.path);
  container.setAttribute('data-file-type', file.path.slice(file.path.lastIndexOf('.')));

  const header = doc.createElement('div');
  header.className = 'file-header js-file-header';

  const info = doc.createElement('div');
  info.className = 'file-info';
  const link = doc.createElement('a');
  link.setAttribute('title', file.path);
  link.setAttribute('href', `/octocat/hello-world/blob/abc123/${file.path}`);
  link.textContent = file.path;
  info.appendChild(link);

  const label = doc.createElement('label');
  label.className = 'form-checkbox';
  const checkbox = doc.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'js-reviewed-checkbox';
  checkbox.name = 'viewed';
  if (viewed) {
    // 初期描画では checked 属性が付いた状態で配信される。
    checkbox.setAttribute('checked', '');
    checkbox.checked = true;
  }
  label.appendChild(checkbox);
  label.appendChild(doc.createTextNode('Viewed'));

  header.appendChild(info);
  header.appendChild(label);
  container.appendChild(header);

  const body = doc.createElement('div');
  body.className = 'js-file-content';
  container.appendChild(body);

  return container;
}

function createDiffFile(doc: Document, file: FixtureFile, ui: FixtureUi): HTMLElement {
  return ui === 'next' ? createNextDiffFile(doc, file) : createLegacyDiffFile(doc, file);
}

interface TreeBuildOptions {
  pathAttribute: boolean;
  ui: FixtureUi;
}

function createTreeItemLabel(doc: Document, text: string): HTMLElement {
  const span = doc.createElement('span');
  span.className = 'PRIVATE_TreeView-item-content-text';
  span.textContent = text;
  return span;
}

function appendTreeFiles(
  doc: Document,
  rootList: HTMLElement,
  files: readonly FixtureFile[],
  options: TreeBuildOptions,
): void {
  /** ディレクトリパス -> 子項目を入れる ul（role="group"） */
  const groups = new Map<string, HTMLElement>([['', rootList]]);

  const ensureDirectory = (dirPath: string): HTMLElement => {
    const existing = groups.get(dirPath);
    if (existing !== undefined) return existing;

    const separatorIndex = dirPath.lastIndexOf('/');
    const parentPath = separatorIndex < 0 ? '' : dirPath.slice(0, separatorIndex);
    const name = separatorIndex < 0 ? dirPath : dirPath.slice(separatorIndex + 1);
    const parentList = ensureDirectory(parentPath);

    const item = doc.createElement('li');
    item.setAttribute('role', 'treeitem');
    item.setAttribute('aria-expanded', 'true');
    if (options.ui === 'next') {
      // 新 UI は id に完全パスが入り、data-tree-entry-type は無い。
      item.id = dirPath;
    } else {
      item.setAttribute('data-tree-entry-type', 'directory');
    }
    item.appendChild(createTreeItemLabel(doc, name));

    const group = doc.createElement('ul');
    group.setAttribute('role', 'group');
    item.appendChild(group);
    parentList.appendChild(item);

    groups.set(dirPath, group);
    return group;
  };

  for (const file of files) {
    const separatorIndex = file.path.lastIndexOf('/');
    const dirPath = separatorIndex < 0 ? '' : file.path.slice(0, separatorIndex);
    const fileName = separatorIndex < 0 ? file.path : file.path.slice(separatorIndex + 1);
    const parentList = ensureDirectory(dirPath);

    const item = doc.createElement('li');
    item.setAttribute('role', 'treeitem');
    item.setAttribute(TEST_PATH_ATTRIBUTE, file.path);
    if (options.ui === 'next') {
      item.id = file.path;
    } else {
      item.setAttribute('data-tree-entry-type', 'file');
    }
    if (options.pathAttribute) item.setAttribute('data-file-path', file.path);

    const link = doc.createElement('a');
    link.setAttribute('href', `#${anchorIdFor(file.path)}`);
    // GitHub のツリーはファイル名だけを表示する（同名ファイルはこれだけでは区別できない）。
    link.setAttribute('title', fileName);
    link.appendChild(createTreeItemLabel(doc, fileName));

    item.appendChild(link);
    parentList.appendChild(item);
  }
}

/** PR の Files changed 画面をざっくり再現した DOM を document.body に構築する。 */
export function createPrFilesPage(options: FixtureOptions = {}): Fixture {
  const doc = document;
  const files = options.files ?? [];
  const includeTree = options.includeTree ?? true;
  const pathAttribute = options.treePathAttribute ?? false;
  const ui = options.ui ?? 'legacy';

  const page = doc.createElement('div');
  page.id = 'js-repo-pjax-container';

  const layout = doc.createElement('div');
  layout.setAttribute('data-target', 'diff-layout.diffContainer');

  const sidebar = doc.createElement('div');
  sidebar.className = 'diff-sidebar';

  const diffContainer = doc.createElement('div');
  diffContainer.id = 'files';
  diffContainer.className = 'js-diff-progressive-container';

  layout.appendChild(sidebar);
  layout.appendChild(diffContainer);
  page.appendChild(layout);
  doc.body.appendChild(page);

  for (const file of files) {
    diffContainer.appendChild(createDiffFile(doc, file, ui));
  }

  const buildTree = (treeFiles: readonly FixtureFile[]): HTMLElement => {
    // 実画面ではツリーは常に 1 つ。再描画時は差し替えられる。
    for (const existing of sidebar.querySelectorAll('#repos-file-tree')) existing.remove();

    const container = doc.createElement('div');
    container.id = 'repos-file-tree';
    container.setAttribute('data-testid', 'file-tree');

    const list = doc.createElement('ul');
    list.setAttribute('role', 'tree');
    list.setAttribute('aria-label', 'File Tree');
    container.appendChild(list);

    appendTreeFiles(doc, list, treeFiles, { pathAttribute, ui });
    sidebar.appendChild(container);
    return container;
  };

  const fixture: Fixture = {
    diffContainer,
    treeContainer: includeTree ? buildTree(files) : null,

    appendTree(treeFiles = files) {
      const container = buildTree(treeFiles);
      fixture.treeContainer = container;
      return container;
    },

    appendDiffFile(file) {
      const element = createDiffFile(doc, file, ui);
      diffContainer.appendChild(element);
      return element;
    },

    getDiffFile(path) {
      const selector =
        ui === 'next'
          ? `#${CSS.escape(anchorIdFor(path))}`
          : `[data-tagsearch-path="${CSS.escape(path)}"]`;
      const element = diffContainer.querySelector<HTMLElement>(selector);
      if (element === null) throw new Error(`diff file not found: ${path}`);
      return element;
    },

    getViewedControl(path) {
      const selector =
        ui === 'next' ? 'button[aria-label="Viewed"]' : 'input.js-reviewed-checkbox';
      const control = fixture.getDiffFile(path).querySelector<HTMLElement>(selector);
      if (control === null) throw new Error(`viewed control not found: ${path}`);
      return control;
    },

    queryTreeItem(path) {
      return doc.body.querySelector<HTMLElement>(
        `[${TEST_PATH_ATTRIBUTE}="${CSS.escape(path)}"]`,
      );
    },

    getTreeItem(path) {
      const item = fixture.queryTreeItem(path);
      if (item === null) throw new Error(`tree item not found: ${path}`);
      return item;
    },

    toggleViewed(path, viewed) {
      const control = fixture.getViewedControl(path);

      if (ui === 'next') {
        // ボタン型トグル: クリックで GitHub が aria-pressed を更新する挙動を再現する。
        control.setAttribute('aria-pressed', String(viewed));
        control.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return;
      }

      (control as HTMLInputElement).checked = viewed;
      control.dispatchEvent(new Event('change', { bubbles: true }));
    },
  };

  return fixture;
}

export function resetDom(): void {
  document.body.innerHTML = '';
}
