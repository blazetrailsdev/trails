/**
 * Count statements inside function bodies of a generated tree, and the
 * `declined(...)` markers among them, by reason.
 *
 *   pnpm tsx scripts/codegen/src/count-statements.ts <generated-src-dir>
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import * as ts from "typescript-5";

const dir = path.resolve(process.argv[2]);
const files: string[] = [];
const walkDir = (d: string) => {
  for (const e of readdirSync(d)) {
    const p = path.join(d, e);
    if (statSync(p).isDirectory()) walkDir(p);
    else if (p.endsWith(".ts") && !path.basename(p).startsWith("codegen-")) files.push(p);
  }
};
walkDir(dir);
let statements = 0;
const declined: Record<string, number> = {};
for (const f of files) {
  const sf = ts.createSourceFile(f, readFileSync(f, "utf8"), ts.ScriptTarget.Latest, true);
  const visit = (n: ts.Node, inFn: boolean) => {
    const fn = ts.isFunctionLike(n);
    let hasInner = false;
    const probe = (c: ts.Node): void => {
      if (hasInner || ts.isFunctionLike(c)) return;
      if (ts.isStatement(c) && !ts.isBlock(c)) hasInner = true;
      else ts.forEachChild(c, probe);
    };
    ts.forEachChild(n, probe);
    if (inFn && ts.isStatement(n) && !ts.isBlock(n) && !hasInner) {
      statements++;
      const m = n.getText(sf).match(/declined\("[^"]*", "([a-z-]+)"/);
      if (m) declined[m[1]] = (declined[m[1]] ?? 0) + 1;
    }
    ts.forEachChild(n, (c) => visit(c, inFn || fn));
  };
  visit(sf, false);
}
const d = Object.values(declined).reduce((a, b) => a + b, 0);
console.log(
  JSON.stringify({
    files: files.length,
    statements,
    declinedStatements: d,
    declinedPct: ((100 * d) / statements).toFixed(1),
    byReason: declined,
  }),
);
