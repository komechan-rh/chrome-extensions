import { afterEach, describe, expect, it } from 'vitest';
import { createPrFilesPage, resetDom } from '../test/fixtures';
import { findDiffContainer } from './dom-selectors';
import {
  buildViewedStateByAnchorId,
  buildViewedStateMap,
  collectViewedPaths,
  diffViewedStates,
  isViewedControl,
  readDiffFileEntries,
  readDiffFilePath,
} from './viewed-state';

afterEach(resetDom);

describe('diff 側の Viewed 状態の収集', () => {
  it('Viewed 済みのファイルパスを取得できる', () => {
    createPrFilesPage({
      files: [
        { path: 'src/components/Button.tsx', viewed: true },
        { path: 'src/main.ts', viewed: false },
        { path: 'README.md', viewed: true },
      ],
    });

    const viewedPaths = collectViewedPaths(findDiffContainer(document));

    expect([...viewedPaths].toSorted()).toEqual(['README.md', 'src/components/Button.tsx']);
  });

  it('Viewed でないファイルも状態 false として保持する', () => {
    createPrFilesPage({
      files: [
        { path: 'src/a.ts', viewed: true },
        { path: 'src/b.ts', viewed: false },
      ],
    });

    const state = buildViewedStateMap(findDiffContainer(document));

    expect(state.get('src/a.ts')).toBe(true);
    expect(state.get('src/b.ts')).toBe(false);
    expect(state.size).toBe(2);
  });

  it('同名ファイルを完全パスで区別できる', () => {
    createPrFilesPage({
      files: [
        { path: 'src/components/index.ts', viewed: true },
        { path: 'src/pages/index.ts', viewed: false },
      ],
    });

    const viewedPaths = collectViewedPaths(findDiffContainer(document));

    expect(viewedPaths.has('src/components/index.ts')).toBe(true);
    expect(viewedPaths.has('src/pages/index.ts')).toBe(false);
    expect(viewedPaths.size).toBe(1);
  });

  it('チェックを外した状態を（checked 属性ではなくプロパティで）検知する', () => {
    const fixture = createPrFilesPage({
      files: [{ path: 'src/a.ts', viewed: true }],
    });

    const control = fixture.getViewedControl('src/a.ts') as HTMLInputElement;
    // GitHub の初期 HTML では checked 属性が残るため、属性ではなくプロパティを見る必要がある。
    control.checked = false;

    expect(control.hasAttribute('checked')).toBe(true);
    expect(collectViewedPaths(findDiffContainer(document)).size).toBe(0);
  });

  it('ツリーとの対応付け用に diff アンカー ID も収集する', () => {
    createPrFilesPage({ files: [{ path: 'src/a.ts', viewed: true }] });

    const byAnchorId = buildViewedStateByAnchorId(findDiffContainer(document));

    expect(byAnchorId.get('diff-srcats')).toBe(true);
  });

  it('data-* 属性が無い場合はファイル名リンクの title からパスを読む', () => {
    document.body.innerHTML = `
      <div id="files">
        <div class="file js-file">
          <div class="file-header">
            <div class="file-info">
              <a title="src/legacy/Widget.tsx" href="/o/r/blob/abc/src/legacy/Widget.tsx">src/legacy/Widget.tsx</a>
            </div>
            <label><input type="checkbox" class="js-reviewed-checkbox" checked> Viewed</label>
          </div>
        </div>
      </div>`;

    const entries = readDiffFileEntries(findDiffContainer(document));

    expect(entries).toHaveLength(1);
    expect(entries[0]?.path).toBe('src/legacy/Widget.tsx');
    expect(entries[0]?.viewed).toBe(true);
  });

  it('リネーム表示（old → new）は新しいパスとして扱う', () => {
    const element = document.createElement('div');
    element.setAttribute('data-tagsearch-path', 'src/old/Name.ts → src/new/Name.ts');

    expect(readDiffFilePath(element)).toBe('src/new/Name.ts');
  });

  it('Viewed を観測できないファイルは結果に含めない', () => {
    document.body.innerHTML = `
      <div id="files">
        <div class="file js-file" data-tagsearch-path="src/not-loaded.ts"></div>
      </div>`;

    expect(readDiffFileEntries(findDiffContainer(document))).toEqual([]);
  });

  it('ラベル文字列からも Viewed チェックボックスを判定できる', () => {
    document.body.innerHTML = `
      <div id="files">
        <div class="file js-file" data-tagsearch-path="src/a.ts">
          <input type="checkbox" id="viewed-a">
          <label for="viewed-a">Viewed</label>
        </div>
      </div>`;

    const control = document.querySelector<HTMLInputElement>('#viewed-a');
    control!.checked = true;

    expect(collectViewedPaths(findDiffContainer(document)).has('src/a.ts')).toBe(true);
  });
});

describe('新しいレビュー UI（/changes）', () => {
  it('data-file-path とボタン型トグル（aria-pressed）から Viewed を取得できる', () => {
    createPrFilesPage({
      ui: 'next',
      files: [
        { path: 'src/features/notes/index.tsx', viewed: true },
        { path: 'src/features/notes/components/note-dialog.tsx', viewed: false },
      ],
    });

    const state = buildViewedStateMap(findDiffContainer(document));

    expect(state.get('src/features/notes/index.tsx')).toBe(true);
    expect(state.get('src/features/notes/components/note-dialog.tsx')).toBe(false);
  });

  it('完全パスが「Expand all lines」ボタン側にあってもトグル起点で解決できる', () => {
    // 実 DOM 準拠: ファイルコンテナ自身はパスを持たず、中のボタンが data-file-path を持つ。
    document.body.innerHTML = `
      <main>
        <div id="diff-1">
          <div>
            <button data-component="IconButton" aria-label="Expand all lines: src/components/index.ts"
                    data-file-path="src/components/index.ts"></button>
            <button aria-label="Viewed" aria-pressed="true"><svg></svg><span>Viewed</span></button>
          </div>
        </div>
        <div id="diff-2">
          <div>
            <button data-component="IconButton" aria-label="Expand all lines: src/pages/index.ts"
                    data-file-path="src/pages/index.ts"></button>
            <button aria-label="Viewed" aria-pressed="false"><svg></svg><span>Viewed</span></button>
          </div>
        </div>
      </main>`;

    const state = buildViewedStateMap(findDiffContainer(document));

    expect(state.get('src/components/index.ts')).toBe(true);
    expect(state.get('src/pages/index.ts')).toBe(false);
    expect(state.size).toBe(2);
  });

  it('隣のファイルのパスを取り違えない（同名ファイル・トグル起点）', () => {
    document.body.innerHTML = `
      <main>
        <div>
          <button data-file-path="a/index.ts" aria-label="Expand all lines: a/index.ts"></button>
          <button aria-label="Viewed" aria-pressed="true"></button>
        </div>
        <div>
          <button data-file-path="b/index.ts" aria-label="Expand all lines: b/index.ts"></button>
          <button aria-label="Viewed" aria-pressed="false"></button>
        </div>
      </main>`;

    const viewed = collectViewedPaths(findDiffContainer(document));

    expect([...viewed]).toEqual(['a/index.ts']);
  });

  it('Expand all lines ボタンが無いファイルでも title からパスを解決する', () => {
    // 折りたたみ行が無いファイルには「Expand all lines」ボタンが存在しない。
    document.body.innerHTML = `
      <main>
        <div id="diff-1">
          <div>
            <span title="src/features/notes/components/note-dialog.tsx">…components/note-dialog.tsx</span>
            <button aria-label="Viewed" aria-pressed="true"></button>
          </div>
        </div>
      </main>`;

    const viewed = collectViewedPaths(findDiffContainer(document));

    expect([...viewed]).toEqual(['src/features/notes/components/note-dialog.tsx']);
  });

  it('パスが全く取れない場合は #diff- アンカーで対応付ける', () => {
    document.body.innerHTML = `
      <main>
        <div id="diff-abc123">
          <div>
            <span>…dialog.tsx</span>
            <button aria-label="Viewed" aria-pressed="true"></button>
          </div>
        </div>
      </main>`;

    const entries = readDiffFileEntries(findDiffContainer(document));

    expect(entries).toHaveLength(1);
    expect(entries[0]?.anchorId).toBe('diff-abc123');
    expect(entries[0]?.viewed).toBe(true);
    // 疑似キーなので、実パスと衝突しない形式になっている。
    expect(entries[0]?.path).toBe('#diff-abc123');
  });

  it('ファイル名だけの title は完全パスとして採用しない', () => {
    document.body.innerHTML = `
      <main>
        <div id="diff-1">
          <div>
            <span title="dialog.tsx">dialog.tsx</span>
            <button aria-label="Viewed" aria-pressed="true"></button>
          </div>
        </div>
      </main>`;

    const entries = readDiffFileEntries(findDiffContainer(document));

    // 誤ったパスで別ファイルを汚さないよう、アンカー側へフォールバックする。
    expect(entries[0]?.path).toBe('#diff-1');
  });

  it('role="checkbox" の aria-checked でも判定できる', () => {
    document.body.innerHTML = `
      <div id="files">
        <div data-file-path="src/a.ts">
          <div role="checkbox" aria-checked="true" aria-label="Viewed"></div>
        </div>
      </div>`;

    expect(collectViewedPaths(findDiffContainer(document)).has('src/a.ts')).toBe(true);
  });

  it('コンテナ側の data-file-user-viewed でも判定できる', () => {
    document.body.innerHTML = `
      <div id="files">
        <div data-file-path="src/a.ts" data-file-user-viewed="true"></div>
        <div data-file-path="src/b.ts" data-file-user-viewed="false"></div>
      </div>`;

    const state = buildViewedStateMap(findDiffContainer(document));

    expect(state.get('src/a.ts')).toBe(true);
    expect(state.get('src/b.ts')).toBe(false);
  });

  it('ボタン内部の要素をクリック対象としても Viewed トグルと判定できる', () => {
    const fixture = createPrFilesPage({
      ui: 'next',
      files: [{ path: 'src/a.ts' }],
    });
    const control = fixture.getViewedControl('src/a.ts');
    const innerIcon = control.querySelector('svg');

    expect(isViewedControl(control)).toBe(true);
    expect(isViewedControl(innerIcon)).toBe(true);
    expect(isViewedControl(document.body)).toBe(false);
  });
});

describe('diffViewedStates', () => {
  it('変化したファイルのみを返す', () => {
    const previous = new Map([
      ['a.ts', true],
      ['b.ts', false],
      ['c.ts', true],
    ]);
    const next = new Map([
      ['a.ts', true],
      ['b.ts', true],
      ['c.ts', false],
    ]);

    expect(diffViewedStates(previous, next)).toEqual([
      { path: 'b.ts', viewed: true },
      { path: 'c.ts', viewed: false },
    ]);
  });

  it('diff から消えた Viewed 済みファイルは解除として扱う', () => {
    const previous = new Map([['a.ts', true]]);

    expect(diffViewedStates(previous, new Map())).toEqual([{ path: 'a.ts', viewed: false }]);
  });
});
