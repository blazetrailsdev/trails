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
printf 'packages: []\noverrides:\n%sallowBuilds:\n  better-sqlite3: true\n  esbuild: true\n' "$OVERRIDES" \
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
    expect(TopLevel.Author).toBe(Author);
    expect(TopLevel.Book).toBe(Book);
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
