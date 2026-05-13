#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAILS_DIR="$SCRIPT_DIR/.rails-source"
RAILS_TAG="v8.0.2"

if [ -d "$RAILS_DIR/.git" ]; then
  # If the existing mirror was created with sparse-checkout (pre-PR-1483),
  # disable it so the full working tree is present. One-time migration;
  # subsequent runs see sparseCheckout=false and skip cleanly.
  if [ "$(git -C "$RAILS_DIR" config --bool core.sparseCheckout 2>/dev/null || echo false)" = "true" ]; then
    echo "Existing mirror at $RAILS_DIR is sparse — disabling to populate full tree..."
    git -C "$RAILS_DIR" sparse-checkout disable
    echo "Rails source ready at $RAILS_DIR (sparse-checkout disabled)"
  else
    echo "Rails source already cloned at $RAILS_DIR — skipping."
  fi
  exit 0
fi

echo "Cloning Rails $RAILS_TAG (full, depth=1)..."
rm -rf "$RAILS_DIR"

# Full shallow clone (~53 MiB unpacked) — we previously sparse-checkout'd
# a subset of paths to save ~30 MiB. The savings weren't worth the
# maintenance burden: every new fidelity-checking use case (test/fixtures,
# test/models, activestorage, etc.) required extending the sparse list,
# and a mistake silently dropped paths from existing mirrors. A full clone
# is fixed-size, future-proof, and lets any agent read any Rails file
# without "is this path in sparse?" being a question.
git clone \
  --depth=1 \
  --branch "$RAILS_TAG" \
  https://github.com/rails/rails.git \
  "$RAILS_DIR"

echo "Rails source ready at $RAILS_DIR"
