#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAILS_DIR="$SCRIPT_DIR/.rails-source"
RAILS_TAG="v8.0.2"

if [ -d "$RAILS_DIR/.git" ]; then
  echo "Rails source already cloned at $RAILS_DIR — skipping."
  exit 0
fi

echo "Cloning Rails $RAILS_TAG (sparse checkout)..."
rm -rf "$RAILS_DIR"

git clone \
  --filter=blob:none \
  --sparse \
  --depth=1 \
  --branch "$RAILS_TAG" \
  https://github.com/rails/rails.git \
  "$RAILS_DIR"

cd "$RAILS_DIR"

git sparse-checkout set \
  activerecord/lib/active_record \
  activerecord/lib/arel \
  activemodel/lib/active_model \
  actionpack/lib/action_dispatch \
  actionpack/lib/action_controller

echo "Rails source ready at $RAILS_DIR"
