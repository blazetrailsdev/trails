#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAILS_DIR="$SCRIPT_DIR/../api-compare/.rails-source"
RAILS_TAG="v8.0.2"

if [ ! -d "$RAILS_DIR/.git" ]; then
  echo "Rails source not found at $RAILS_DIR — run api-compare/fetch-rails.sh first."
  exit 1
fi

# Rails source is now a full clone (see fetch-rails.sh). Test directories
# are already present — no sparse-checkout expansion needed. Historically
# this script ran `git sparse-checkout add ...` to fetch test/cases etc.
# on demand; that's a no-op now.
echo "Verifying Rails test directories are present..."
cd "$RAILS_DIR"

# Required test directories — extraction will fail if any are missing.
# Fail loudly here with a clear message rather than later during extraction.
# Pre-#1483 mirrors that were sparse-checkout'd would silently miss these;
# fetch-rails.sh now auto-disables sparse-checkout, so a missing dir here
# usually means the upstream Rails layout changed.
REQUIRED_DIRS=(
  "activerecord/test/cases/arel"
  "activemodel/test/cases"
  "activerecord/test/cases"
  "activesupport/test"
  "actionpack/test/controller"
  "actionpack/test/dispatch"
  "actionview/test"
  "railties/test"
)

missing=0
for dir in "${REQUIRED_DIRS[@]}"; do
  if [ -d "$dir" ]; then
    count=$(find "$dir" -name "*_test.rb" -o -name "test_*.rb" | wc -l)
    echo "  $dir: $count test files"
  else
    echo "  ERROR: $dir not found in $RAILS_DIR"
    missing=$((missing + 1))
  fi
done

if [ "$missing" -gt 0 ]; then
  echo
  echo "FAIL: $missing required test directory/directories missing. Re-run api-compare/fetch-rails.sh." >&2
  exit 1
fi

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
