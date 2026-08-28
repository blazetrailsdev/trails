#!/usr/bin/env npx tsx
/**
 * parity:api:cites — gate the Rails CITATIONS written into deviation receipts.
 *
 * Every `gem/path.rb:LINE` in a `@noRailsEquivalent` / `@missingRailsCall` /
 * `@missingRailsArgs` reason is checked for the three properties `cites.ts`
 * documents: resolvable to exactly one vendored `.rb`, in range, and — when
 * the reason names `Klass#meth` — inside that method's body.
 *
 * Only-shrink over a committed mark, like its sibling ratchets: the population
 * that predates the check burns down rather than blocking the next enrollment.
 * A run BELOW the mark reports a stale mark; narrow it with `--tighten`, which
 * writes the count DOWN and never up. There is no reseed.
 *
 * Usage:
 *   pnpm parity:api:cites            # gate (CI, rails-comparison job)
 *   pnpm parity:api:cites --tighten  # narrow the mark after converging cites
 *
 * Needs vendor/ populated; no api-compare artifact.
 *
 * Hard rules: no node:* imports, no process.* outside the CLI entry guard,
 * async fs only.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { ROOT_DIR } from "./config.js";
import { COMMITTED_TS_FILES, walkPackageTsFiles } from "./ts-file-walk.js";
import type { CiteFinding } from "./cites.js";
import { checkReceipt, collectReceipts, loadCorpus } from "./cites.js";

export const MARK_PATH = path.join(ROOT_DIR, "scripts/api-compare/cite-mark.json");

export interface CiteMark {
  unverifiedCites: number;
}

/** Every unverifiable citation under `packages/<pkg>/src`, in file order. */
export async function findUnverifiedCites(rootDir: string): Promise<CiteFinding[]> {
  const corpus = await loadCorpus(rootDir);
  const cache = new Map<string, Promise<string>>();
  const readFile = (relPath: string): Promise<string> => {
    let hit = cache.get(relPath);
    if (hit === undefined) {
      hit = fs.readFile(path.join(rootDir, relPath), "utf-8");
      cache.set(relPath, hit);
    }
    return hit;
  };
  const files = await walkPackageTsFiles(path.join(rootDir, "packages"), COMMITTED_TS_FILES);
  const out: CiteFinding[] = [];
  for (const abs of files) {
    const receipts = collectReceipts(path.relative(rootDir, abs), await fs.readFile(abs, "utf-8"));
    for (const receipt of receipts) out.push(...(await checkReceipt(corpus, receipt, readFile)));
  }
  return out;
}

export async function loadMark(): Promise<CiteMark> {
  return JSON.parse(await fs.readFile(MARK_PATH, "utf-8")) as CiteMark;
}

export async function writeMark(mark: CiteMark): Promise<void> {
  await fs.writeFile(MARK_PATH, `${JSON.stringify(mark, null, 2)}\n`, "utf-8");
}

export async function main(tighten: boolean): Promise<number> {
  const findings = await findUnverifiedCites(ROOT_DIR);
  const mark = await loadMark();
  for (const f of findings) {
    console.log(`  ${f.tsFile}:${f.line} ${f.tag} ${f.cite} — ${f.problem}: ${f.detail}`);
  }
  if (tighten) {
    if (findings.length >= mark.unverifiedCites) {
      console.log(`parity:api:cites: mark already at ${mark.unverifiedCites}, nothing to narrow.`);
      return 0;
    }
    await writeMark({ unverifiedCites: findings.length });
    console.log(`parity:api:cites: mark narrowed ${mark.unverifiedCites} → ${findings.length}.`);
    return 0;
  }
  if (findings.length > mark.unverifiedCites) {
    console.error(
      `parity:api:cites: ${findings.length} unverifiable citation(s), above the committed ` +
        `mark of ${mark.unverifiedCites}. Fix the citation — point it at the method the ` +
        "receipt names, qualify an ambiguous basename with its directory, or mark a use " +
        "site with `use-site:` — never raise the mark.",
    );
    return 1;
  }
  if (findings.length < mark.unverifiedCites) {
    console.log(
      `parity:api:cites: ${findings.length} unverifiable citation(s), below the mark of ` +
        `${mark.unverifiedCites} — narrow it with \`pnpm parity:api:cites:tighten\`.`,
    );
    return 0;
  }
  console.log(`parity:api:cites: OK (${findings.length}/${mark.unverifiedCites}).`);
  return 0;
}

async function runAsScript(): Promise<void> {
  const self = fileURLToPath(import.meta.url);
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
  if (path.resolve(self) !== invoked) return;
  process.exit(await main(process.argv.includes("--tighten")));
}

void runAsScript();
