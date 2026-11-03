#!/usr/bin/env bash
# Run a generated application's own vitest suite against packed packages.
#
# trails' vitest config aliases every @blazetrails/* package to its source, so
# in trails' suite every package runs inside vite's module graph. An
# application installs the packed packages, which vitest externalizes, so
# their own `import()` is Node's. A defect on that path (a second module
# instance of each class the loader seats, trails#9683) cannot fail a trails
# test. This packs the packages as trailmap's vendor-trails.sh does, generates
# an app with `trails new` against the tarballs, adds two associated models,
# and runs the app's suite.
#
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
printf 'packages: []\noverrides:\n%sonlyBuiltDependencies:\n  - better-sqlite3\n' "$OVERRIDES" \
  > pnpm-workspace.yaml
pnpm install --no-frozen-lockfile >/dev/null

pnpm trails generate model Author name:string >/dev/null
pnpm trails generate model Book title:string author:references >/dev/null
node -e '
const fs=require("fs"),f="app/models/author.ts";
const s=fs.readFileSync(f,"utf8").replace(/(class Author extends \w+ \{\n)/, "$1  static {\n    this.hasMany(\"books\");\n  }\n");
if(!s.includes("hasMany"))throw new Error("could not add hasMany to "+f);
fs.writeFileSync(f,s);'
pnpm trails db migrate >/dev/null

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
