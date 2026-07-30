#!/usr/bin/env npx tsx
/**
 * api:reasons — enforce the `@missingRailsCall` empty-reason contract in CI.
 *
 * `parseJsdoc` (build.ts) already rejects a bare or whitespace-only tag, but
 * its only caller is `api:build`: an opt-in developer command with no CI job,
 * which also needs the wide call-mismatch artifact and rewrites source files.
 * This lint runs that same check over every JSDoc block under
 * `packages/<pkg>/src` — read-only and artifact-free — so the tag is gated
 * like its sibling `@noRailsEquivalent` (validated by `noRailsEquivalentReason`
 * on every `api:extra` / `api:compare` run).
 *
 * Usage:
 *   pnpm api:reasons
 *
 * Hard rules: no node:* imports, no process.* outside the CLI entry guard.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { ROOT_DIR } from "./config.js";
import { TAG, parseJsdoc } from "./build.js";
import { COMMITTED_TS_FILES, walkPackageTsFiles } from "./ts-file-walk.js";

const PACKAGES_DIR = path.join(ROOT_DIR, "packages");
const JSDOC_BLOCK = /\/\*\*[\s\S]*?\*\//g;

/** Every `.ts` file under `<packagesDir>/<pkg>/src`, sorted for stable output.
 *  The committed population — `*.test.ts` counts, unlike the extractor's
 *  compared population: the contract is about what is committed, not about
 *  what api-compare measures. */
export async function listSourceFiles(packagesDir: string): Promise<string[]> {
  return walkPackageTsFiles(packagesDir, COMMITTED_TS_FILES);
}

/** Run `parseJsdoc`'s empty-reason check over one file's JSDoc blocks, and
 *  return the resulting error messages. Each block is parsed independently so
 *  one bare tag doesn't hide the rest of the file. */
export function lintFileText(fileName: string, text: string): string[] {
  if (!text.includes(TAG)) return [];
  const errors: string[] = [];
  for (const match of text.matchAll(JSDOC_BLOCK)) {
    const comment = match[0];
    if (!comment.includes(TAG)) continue;
    const startLine = text.slice(0, match.index).split("\n").length;
    try {
      parseJsdoc(comment, { fileName, startLine });
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return errors;
}

export async function main(): Promise<number> {
  const files = await listSourceFiles(PACKAGES_DIR);
  // Sequential: the tree is ~3k files, and fanning every read out at once
  // risks EMFILE for no measurable win (the whole pass is ~1s).
  const errors: string[] = [];
  for (const abs of files) {
    errors.push(...lintFileText(path.relative(ROOT_DIR, abs), await fs.readFile(abs, "utf-8")));
  }
  if (errors.length > 0) {
    for (const error of errors) console.error(`api:reasons: ${error}`);
    console.error(
      `api:reasons: ${errors.length} tag(s) without a reason — see the empty-reason ` +
        "contract in docs/infrastructure/api-build-stub-generation-plan.md.",
    );
    return 1;
  }
  console.log(`api:reasons: ${files.length} file(s) checked, every ${TAG} carries a reason.`);
  return 0;
}

async function runAsScript(): Promise<void> {
  const self = fileURLToPath(import.meta.url);
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
  if (path.resolve(self) !== invoked) return;
  process.exit(await main());
}

void runAsScript();
