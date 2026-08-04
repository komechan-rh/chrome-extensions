import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const resolveFromRoot = (relativePath: string): string =>
  fileURLToPath(new URL(relativePath, import.meta.url));

/** manifest.json はリポジトリルートで管理し、ビルド成果物へコピーする。 */
function copyExtensionManifest(): Plugin {
  return {
    name: 'copy-extension-manifest',
    closeBundle() {
      copyFileSync(resolveFromRoot('./manifest.json'), resolveFromRoot('./dist/manifest.json'));
    },
  };
}

export default defineConfig({
  plugins: [copyExtensionManifest()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // content script は ESM を使えないため IIFE 単一ファイルとして出力する。
    target: 'chrome120',
    minify: false,
    sourcemap: false,
    cssCodeSplit: false,
    lib: {
      entry: resolveFromRoot('./src/content/index.ts'),
      formats: ['iife'],
      name: 'githubPrViewedTreeSync',
      fileName: () => 'content.js',
    },
    rollupOptions: {
      output: {
        // 出力アセットは content.css のみ。manifest.json から参照する。
        assetFileNames: 'content.[ext]',
      },
    },
  },
});
