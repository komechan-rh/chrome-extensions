import { afterEach, describe, expect, it } from 'vitest';
import { createPrFilesPage, resetDom } from '../test/fixtures';
import { findDiffContainer } from './dom-selectors';
import {
  buildViewedStateByAnchorId,
  buildViewedStateMap,
  collectViewedPaths,
  diffViewedStates,
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

    const control = fixture.getViewedControl('src/a.ts');
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
