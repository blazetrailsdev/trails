#!/usr/bin/env bash
# Usage: scripts/generated-app-smoke.sh [work-dir]   (after `pnpm build`)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${1:-$(mktemp -d)}"
VENDOR="$WORK/vendor"
APP="$WORK/smoke"
rm -rf "$VENDOR" "$APP"
mkdir -p "$VENDOR"

mapfile -t PKGS < <(cd "$ROOT" && node -e '
const fs=require("fs"),path=require("path");
for(const d of fs.readdirSync("packages").sort()){
  const pj=path.join("packages",d,"package.json");
  if(!fs.existsSync(pj))continue;
  const p=JSON.parse(fs.readFileSync(pj,"utf8"));
  if(p.name?.startsWith("@blazetrails/")&&!p.private) console.log(d+" "+p.name);
}')

OVERRIDES=""
for row in "${PKGS[@]}"; do
  read -r dir name <<<"$row"
  tgz="$(cd "$ROOT/packages/$dir" && pnpm pack --pack-destination "$VENDOR" | tail -1)"
  OVERRIDES+="  \"$name\": \"file:$VENDOR/$(basename "$tgz")\""$'\n'
done
echo "packed ${#PKGS[@]} packages into $VENDOR"

node "$ROOT/packages/trailties/bin/trails.js" new "$APP" \
  --skip-install --skip-git --skip-docker --skip-system-test --skip-ci >/dev/null

cd "$APP"
printf 'packages: []\npublicHoistPattern:\n  - "@blazetrails/*"\noverrides:\n%sallowBuilds:\n  better-sqlite3: true\n  esbuild: true\n' "$OVERRIDES" \
  > pnpm-workspace.yaml
pnpm install --no-frozen-lockfile

pnpm trails generate model Author name:string
pnpm trails generate model Book title:string author:references
node -e '
const fs=require("fs"),f="app/models/author.ts";
const s=fs.readFileSync(f,"utf8").replace(/(class Author extends \w+ \{\n)/, "$1  static {\n    this.hasMany(\"books\");\n  }\n");
if(!s.includes("hasMany"))throw new Error("could not add hasMany to "+f);
fs.writeFileSync(f,s);'
pnpm trails db:migrate

cat > test/models/module-graph.test.ts <<'EOF'
import { describe, expect, it } from "vitest";
import "../test-helper.ts";
import { TopLevel } from "@blazetrails/ruby-compat";
import { Author } from "../../app/models/author.ts";
import { Book } from "../../app/models/book.ts";

describe("generated app", () => {
  it("seats the class the test imported", () => {
    expect((TopLevel as Record<string, unknown>).Author).toBe(Author);
    expect((TopLevel as Record<string, unknown>).Book).toBe(Book);
  });

  it("queries an association", async () => {
    const author = await Author.create({ name: "Ursula" });
    await Book.create({ title: "The Dispossessed", author });
    const books = await Book.joins(":author").where({ authors: { name: "Ursula" } }).pluck("title");
    expect(books).toEqual(["The Dispossessed"]);
  });
});
EOF
pnpm test

# RFC 0258: build, drop dev dependencies, boot from dist/ with type stripping off.
pnpm trails solid_queue:install
pnpm trails generate scaffold Post title:string
pnpm trails generate job Ping
node -e '
const fs=require("fs"),f="app/jobs/ping-job.ts";
const s=fs.readFileSync(f,"utf8").replace(/perform\(\.\.\.args: unknown\[\]\): void \{\n.*\n  \}/,
  "async perform(): Promise<void> {\n    await (await import(\"node:fs/promises\")).writeFile(\"tmp/ping-performed\", \"ok\");\n  }");
if(!s.includes("ping-performed"))throw new Error("could not edit "+f);
fs.writeFileSync(f,s);'
pnpm trails db:migrate
pnpm build
# As Dockerfile.tt does: copy what tsc does not emit into dist/, build its entry there, prune.
tar --exclude=./dist --exclude=./node_modules --exclude="*.ts" -cf - . | tar -xf - -C dist
(cd dist && ../node_modules/.bin/trails build)
pnpm prune --prod
for dep in tsx typescript; do
  if (cd dist && node --input-type=module -e "import.meta.resolve('$dep')") 2>/dev/null; then
    echo "$dep resolves under production dependencies" >&2; exit 1
  fi
done

cd dist
export TRAILS_ENV=production SECRET_KEY_BASE_DUMMY=1
TRAILS="node --no-experimental-strip-types bin/trails"
$TRAILS db:prepare
PORT=3917
$TRAILS server -p "$PORT" &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
for _ in $(seq 60); do curl -fs "http://127.0.0.1:$PORT/up" >/dev/null && break; sleep 0.5; done
curl -fsS "http://127.0.0.1:$PORT/up" >/dev/null
curl -fsS "http://127.0.0.1:$PORT/posts" | grep -q "<h1>Posts</h1>"
$TRAILS runner 'await PingJob.performLater()'
rm -f tmp/ping-performed
node --no-experimental-strip-types bin/jobs &
JOBS=$!
for _ in $(seq 60); do [ -f tmp/ping-performed ] && break; sleep 0.5; done
kill -TERM "$JOBS"; wait "$JOBS" || true
[ -f tmp/ping-performed ] || { echo "PingJob was not performed" >&2; exit 1; }
kill -INT "$SERVER"; wait "$SERVER"
trap - EXIT
echo "compiled app booted without tsx"
