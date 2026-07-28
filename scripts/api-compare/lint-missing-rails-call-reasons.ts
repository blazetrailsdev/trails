#!/usr/bin/env npx tsx
/**
 * api:reasons — enforce the `@missingRailsCall` empty-reason contract in CI.
 *
 * `parseJsdoc` (build.ts) already rejects a bare or whitespace-only tag, but
 * its only caller is `api:build`, an opt-in developer command with no CI job:
 * a hand-authored bare tag can sit in the tree undetected until someone
 * happens to reconcile that file. This lint runs the SAME check over every
 * JSDoc block under `packages/<pkg>/src`, read-only and with no dependency on the
 * wide call-mismatch artifact, so the tag is gated like its sibling
 * `@noRailsEquivalent` (validated by `noRailsEquivalentReason` on every
 * `api:extra` / `api:compare` run).
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

const PACKAGES_DIR = path.join(ROOT_DIR, "packages");
const SKIP_DIRS = new Set(["node_modules", "dist"]);
const JSDOC_BLOCK = /\/\*\*[\s\S]*?\*\//g;

/** Every `.ts` file under `<packages>/<pkg>/src`, sorted for stable output. */
export async function listSourceFiles(packagesDir: string): Promise<string[]> {
  const walk = async (dir: string): Promise<string[]> => {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    const found = await Promise.all(
      entries.map(async (entry) => {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : walk(abs);
        return entry.name.endsWith(".ts") ? [abs] : [];
      }),
    );
    return found.flat();
  };
  let pkgs;
  try {
    pkgs = await fs.readdir(packagesDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const perPackage = await Promise.all(
    pkgs.filter((p) => p.isDirectory()).map((p) => walk(path.join(packagesDir, p.name, "src"))),
  );
  return perPackage.flat().sort();
}

/** Run `parseJsdoc`'s empty-reason check over one file's JSDoc blocks.
 *  Returns the (possibly empty) list of error messages — never throws, so one
 *  bad tag doesn't hide the rest. */
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
  const errors: string[] = [];
  for (const abs of files) {
    const text = await fs.readFile(abs, "utf-8");
    errors.push(...lintFileText(path.relative(ROOT_DIR, abs), text));
  }
  if (errors.length > 0) {
    for (const e of errors) console.error(`api:reasons: ${e}`);
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
