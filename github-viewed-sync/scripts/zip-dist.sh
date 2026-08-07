#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

DIST_DIR="dist"
OUT_DIR="release"

if [ ! -d "$DIST_DIR" ]; then
  echo "エラー: $DIST_DIR が存在しません。先に \`pnpm build\` を実行してください。" >&2
  exit 1
fi

NAME=$(node -p "require('./manifest.json').name" | tr 'A-Z ' 'a-z-')
VERSION=$(node -p "require('./manifest.json').version")
ZIP_NAME="${NAME}-v${VERSION}.zip"

mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR/$ZIP_NAME"

(cd "$DIST_DIR" && zip -r -X "../$OUT_DIR/$ZIP_NAME" . -x ".*")

echo "作成しました: $OUT_DIR/$ZIP_NAME"
