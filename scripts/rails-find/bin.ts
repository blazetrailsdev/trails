// Thin CLI entry for `pnpm rails:find [--all] <query>`. Owns argv/exit;
// delegates all matching to ./core.ts (pure, so it stays unit-testable and
// worktree-agnostic). run.sh guarantees the manifests exist first. <query> is a
// Rails/trails test name, a method/constant, or any token; output is
// `file:line label` grouped by the mode that produced each match. `--all` keeps
// substring hits even when exact ones exist and lifts the per-mode cap.
import * as path from "path";
import { fileURLToPath } from "url";

import { railsFind, type FindMode, type FindResult } from "./core.js";

const MODE_HEADINGS: Record<FindMode, string> = {
  test: "test-index (rails-tests.json)",
  method: "api-index (rails-api.json)",
  constant: "api-index (rails-api.json)",
  grep: "grep fallback (vendor/rails/activerecord)",
};

function render(results: FindResult[]): string {
  const byMode = new Map<FindMode, FindResult[]>();
  for (const r of results) {
    const list = byMode.get(r.mode) ?? [];
    list.push(r);
    byMode.set(r.mode, list);
  }
  const out: string[] = [];
  for (const [mode, list] of byMode) {
    out.push(`\n# ${MODE_HEADINGS[mode]} — ${list.length} match(es)`);
    for (const r of list) {
      const loc = r.line > 0 ? `${r.file}:${r.line}` : r.file;
      out.push(`  ${loc}\t${r.label}`);
    }
  }
  return out.join("\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  // `--refresh` is consumed by run.sh (it rebuilds the manifests before this
  // runs); strip it here too so a direct invocation doesn't treat it as a token.
  const query = args
    .filter((a) => a !== "--all" && a !== "--refresh")
    .join(" ")
    .trim();
  if (!query) {
    console.error(
      "usage: pnpm rails:find [--all] [--refresh] <test-name | method | constant | token>",
    );
    process.exit(2);
  }
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(dir, "../..");
  const { results, exactOnly, suppressed, stale } = await railsFind(root, query, { all });
  if (results.length === 0) {
    console.error(`no matches for "${query}" (index or grep)`);
    process.exit(1);
  }
  console.log(render(results));
  if (suppressed > 0) {
    const why = exactOnly ? "substring/capped" : "capped";
    console.log(`\n… ${suppressed} more (${why}) — re-run with --all to see them`);
  }
  if (stale.length > 0) {
    console.error(
      `\n! stale index (older than vendor lockfile): ${stale.join(", ")}\n` +
        `  file:line may be outdated — rebuild with 'pnpm rails:find --refresh <query>'`,
    );
  }
}

void main();
