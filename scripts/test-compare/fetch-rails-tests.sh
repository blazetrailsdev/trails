#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAILS_DIR="$SCRIPT_DIR/../api-compare/.rails-source"
RAILS_TAG="v8.0.2"

if [ ! -d "$RAILS_DIR/.git" ]; then
  echo "Rails source not found at $RAILS_DIR — run api-compare/fetch-rails.sh first."
  exit 1
fi

echo "Expanding sparse checkout to include test directories..."

cd "$RAILS_DIR"

git sparse-checkout add \
  activerecord/test/cases/arel \
  activemodel/test/cases \
  activerecord/test/cases \
  activesupport/test \
  actionpack/test/dispatch \
  actionpack/test/controller \
  actionview/test \
  railties/test

echo "Rails test source ready at $RAILS_DIR"

# Quick check that test dirs exist
for dir in "activerecord/test/cases/arel" "activemodel/test/cases" "activerecord/test/cases" "activesupport/test" "actionview/test" "railties/test"; do
  if [ -d "$dir" ]; then
    count=$(find "$dir" -name "*_test.rb" -o -name "test_*.rb" | wc -l)
    echo "  $dir: $count test files"
  else
    echo "  WARNING: $dir not found"
  fi
done

# --- Rack (separate gem) ---
RACK_DIR="$SCRIPT_DIR/../api-compare/.rack-source"
RACK_REPO="https://github.com/rack/rack.git"
RACK_TAG="v3.1.14"

if [ ! -d "$RACK_DIR/.git" ]; then
  echo "Cloning Rack $RACK_TAG..."
  git clone --depth 1 --branch "$RACK_TAG" "$RACK_REPO" "$RACK_DIR"
else
  echo "Rack source already present at $RACK_DIR"
fi

if [ -d "$RACK_DIR/test" ]; then
  count=$(find "$RACK_DIR/test" -name "spec_*.rb" | wc -l)
  echo "  rack/test: $count spec files"
else
  echo "  WARNING: rack/test not found"
fi
