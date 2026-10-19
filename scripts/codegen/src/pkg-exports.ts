/**
 * Writes `data/pkg-exports.json`: each dependency package's root exports (value
 * and type names), read from its built `dist/index.d.ts` through the checker,
 * which the lowering consults to import a helper from its package.
 *
 *   pnpm tsx scripts/codegen/src/pkg-exports.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript-5";
import { ROOT } from "./gem.js";

const out = path.join(ROOT, "scripts/codegen/data/pkg-exports.json");
const prev = JSON.parse(readFileSync(out, "utf8")) as Record<string, string[]>;
const next: Record<string, string[]> = {};
for (const spec of Object.keys(prev)) {
  const dts = path.join(ROOT, "packages", spec.replace("@blazetrails/", ""), "dist/index.d.ts");
  if (!existsSync(dts)) {
    next[spec] = prev[spec];
    continue;
  }
  const program = ts.createProgram([dts], { noEmit: true, skipLibCheck: true });
  const checker = program.getTypeChecker();
  const sym = checker.getSymbolAtLocation(program.getSourceFile(dts)!);
  next[spec] = sym
    ? checker
        .getExportsOfModule(sym)
        .map((s) => s.name)
        .sort()
    : prev[spec];
}
writeFileSync(out, JSON.stringify(next));
console.log(
  Object.entries(next)
    .map(([k, v]) => `${k}: ${v.length}`)
    .join("\n"),
);
