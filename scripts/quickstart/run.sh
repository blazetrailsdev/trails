#!/usr/bin/env bash
# Runs the root README's Quickstart end to end in a temp directory against this
# checkout's built packages, and compares what it prints and generates with the
# README's own blocks. Needs `pnpm build` to have run first.
set -euo pipefail

TRAILS=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
export TRAILS
README="$TRAILS/README.md"
PORT=${QUICKSTART_PORT:-3927}
WORK=$(mktemp -d)
SERVER_PID=""
unset TRAILS_ENV NODE_ENV

cleanup() {
  if [ -n "$SERVER_PID" ]; then kill "$SERVER_PID" 2>/dev/null || true; fi
  if [ -z "${QUICKSTART_KEEP:-}" ]; then rm -rf "$WORK"; else echo "kept $WORK"; fi
}
trap cleanup EXIT

fail() {
  echo "quickstart: $*" >&2
  exit 1
}

# The Nth (1-based) fenced block of the Quickstart section whose info string is $1.
block() {
  awk -v lang="$1" -v want="$2" '
    /^## Quickstart/ { on = 1; next }
    on && /^## / { exit }
    !on { next }
    inside && /^```$/ { inside = 0; if (n == want) exit; next }
    inside { if (n == want) print; next }
    $0 == "```" lang { n++; inside = 1 }
  ' "$README"
}

# Timestamps, durations and CSRF tokens differ run to run.
normalize() {
  sed -E \
    -e 's/[0-9]{14}/TIMESTAMP/g' \
    -e 's/[0-9]+\.[0-9]+s/N.NNNNs/g' \
    -e 's/=+$/==/' \
    -e 's/content="[A-Za-z0-9_+\/=-]{20,}"/content="…"/'
}

compare() {
  local name=$1 expected=$2 actual=$3
  printf '%s\n' "$actual" >"$WORK/${name//[^a-z.]/-}.out"
  if ! diff -u <(printf '%s\n' "$expected" | normalize) <(printf '%s\n' "$actual" | normalize); then
    fail "$name differs from README.md"
  fi
}

# What the README elides with `...` is not compared.
compare_prefix() {
  local name=$1 expected=$2 actual=$3
  local line
  while IFS= read -r line; do
    [ "$line" = "      ..." ] && continue
    grep -qxF -- "$line" <<<"$actual" || fail "$name: README line not printed: $line"
  done <<<"$expected"
}

cd "$WORK"
echo "== trails new"
generated=$(node "$TRAILS/packages/trailties/bin/trails.js" new blog --skip-install --skip-git)
compare_prefix "trails new" "$(block text 1)" "$generated"
cd blog

echo "== pnpm install"
bash -euo pipefail -c "$(block sh 3)"

echo "== generate scaffold"
scaffold=$(bin/trails generate scaffold Post title:string body:text)
compare "generate scaffold" "$(block text 2)" "$scaffold"

echo "== db:migrate"
migrated=$(pnpm --silent db:migrate)
compare "db:migrate" "$(block text 3)" "$migrated"
compare "migration" "$(block ts 1 | tail -n +2)" "$(cat db/migrate/*_create_posts.ts)"
compare "model" "$(block ts 2 | tail -n +2)" "$(cat app/models/post.ts)"
compare "controller" "$(block ts 4 | tail -n +2)" "$(cat app/controllers/posts-controller.ts)"

echo "== script/hello.ts"
mkdir -p script
block ts 3 | tail -n +2 >script/hello.ts
compare "script/hello.ts" "$(block text 4)" "$(node script/hello.ts)"

echo "== routes"
compare "routes" "$(block text 5)" "$(bin/trails routes)"

echo "== console"
consoled=$(printf '%s\n' 'const p = await Post.first()' 'p.title' \
  'await Post.where({ title: "Hello" }).count()' | bin/trails console 2>&1)
grep -qF "'Hello'" <<<"$consoled" || fail "console did not print 'Hello': $consoled"

BASE="http://localhost:$PORT"
JAR="$WORK/cookies"

start_server() {
  rm -f tmp/pids/server.pid
  bin/trails server -p "$PORT" >"$WORK/server.log" 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 60); do
    curl -s -o /dev/null "$BASE/up" && return 0
    sleep 1
  done
  cat "$WORK/server.log" >&2
  fail "server did not answer on $BASE"
}

stop_server() {
  kill "$SERVER_PID"
  wait "$SERVER_PID" 2>/dev/null || true
  SERVER_PID=""
}

status() {
  curl -s -o "$WORK/body" -w '%{http_code}' -b "$JAR" -c "$JAR" "$@"
}

expect_status() {
  local want=$1
  shift
  local got
  got=$(status "$@")
  [ "$got" = "$want" ] || {
    cat "$WORK/body" >&2
    fail "$* answered $got, expected $want"
  }
}

token() {
  curl -s -b "$JAR" -c "$JAR" "$BASE$1" |
    sed -nE 's/.*name="authenticity_token" value="([^"]+)".*/\1/p' | head -1
}

expect_notice() {
  local location
  location=$(grep -i '^location:' "$WORK/headers" | tr -d '\r' | awk '{print $2}')
  curl -s -b "$JAR" -c "$JAR" "$location" | grep -qF "$1" || fail "no notice \"$1\" at $location"
}

echo "== server"
start_server
for path in /posts /posts/1 /posts/new /posts/1/edit; do expect_status 200 "$BASE$path"; done

expect_status 302 -D "$WORK/headers" --data-urlencode "authenticity_token=$(token /posts/new)" \
  --data-urlencode "post[title]=Second" --data-urlencode "post[body]=Two" "$BASE/posts"
expect_notice "Post was successfully created."
expect_status 303 -D "$WORK/headers" --data-urlencode "authenticity_token=$(token /posts/2/edit)" \
  --data-urlencode "_method=patch" --data-urlencode "post[title]=Second!" "$BASE/posts/2"
expect_notice "Post was successfully updated."
expect_status 303 -D "$WORK/headers" --data-urlencode "authenticity_token=$(token /posts/2)" \
  --data-urlencode "_method=delete" "$BASE/posts/2"
expect_notice "Post was successfully destroyed."

expect_status 422 --data-urlencode "post[title]=x" "$BASE/posts"
grep -qF "InvalidAuthenticityToken" "$WORK/body" || fail "422 without a token is not InvalidAuthenticityToken"
expect_status 404 "$BASE/nope"
stop_server

sed -i 's/^export class Post extends ApplicationRecord {$/&\n  static {\n    this.validates("title", { presence: true });\n  }\n/' app/models/post.ts
start_server
expect_status 422 --data-urlencode "authenticity_token=$(token /posts/new)" \
  --data-urlencode "post[title]=" "$BASE/posts"
grep -qF "1 error prohibited this post from being saved" "$WORK/body" || fail "no error count"
grep -qF "field_with_errors" "$WORK/body" || fail "no field_with_errors"
stop_server

echo "== pnpm build"
built=$(pnpm --silent build 2>&1) || fail "pnpm build failed: $built"
if grep -F "trails-tsc: warning" <<<"$built"; then fail "pnpm build warned"; fi
block ts 5 | tail -n +2 >app/models/check.ts
if checked=$(pnpm --silent build 2>&1); then fail "check.ts type-checked"; fi
compare_prefix "check.ts" "$(block text 8)" "$checked"
rm app/models/check.ts

echo "== pnpm test"
tested=$(pnpm --silent test 2>&1) || fail "pnpm test failed: $tested"
sed -E 's/\x1b\[[0-9;]*m//g' <<<"$tested" | grep -qE "Tests +7 passed \| 1 todo \(8\)" || fail "unexpected test counts: $tested"

echo "quickstart: ok"
