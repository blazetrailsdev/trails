#!/usr/bin/env -S npx tsx
/**
 * Build the no-standalone-associations ESLint exclude baseline.
 *
 * Scans every package source file for standalone
 * `Associations.<macro>.call(Model, …)` sites (the four covered macros:
 * hasMany, belongsTo, hasOne, hasAndBelongsToMany) and emits a site-granular
 * grandfather list so the rule can ship at `error` severity with zero new CI
 * failures — only NEW standalone usages fail. As sites are converted to the
 * in-class `this.<macro>(…)` form they drop out of this list.
 *
 * Each entry is `"<repo-rel-path>::<receiver>::<macro>::<assocName>"` (see
 * `siteKey` in eslint/no-standalone-associations.mjs) — line-independent, so a
 * single converted site can be removed from the baseline without disturbing
 * the other sites in the same file.
 *
 * The key computation is imported verbatim from the rule module so the baseline
 * and the rule can never drift.
 *
 * Output: eslint/no-standalone-associations-exclude.json (committed, generated
 * data — like a snapshot/fixture, exempt from the PR LOC ceiling).
 * Run via `pnpm tsx scripts/generate-standalone-associations-exclude.ts`.
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { writeJsonManifest } from "./api-compare/write-json-manifest.js";
// @ts-expect-error — .mjs rule module has no type declarations.
import { macroOfCall, siteKey, repoRel } from "../eslint/no-standalone-associations.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_PATH = path.join(ROOT, "eslint/no-standalone-associations-exclude.json");

/** Structural view of an ESTree node — enough to walk it generically. */
type AstNode = { type: string; [key: string]: unknown };

const asNode = (value: unknown): AstNode | null =>
  value && typeof (value as AstNode).type === "string" ? (value as AstNode) : null;

function collectTsFiles(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "dist" || entry.name === "node_modules") continue;
      collectTsFiles(full, out);
    } else if (entry.isFile() && full.endsWith(".ts") && !full.endsWith(".d.ts")) {
      out.push(full);
    }
  }
}

async function main(): Promise<void> {
  const { parser } = await import("typescript-eslint");
  const parse = (code: string) =>
    parser.parseForESLint(code, { ecmaVersion: 2022, sourceType: "module" }).ast;

  const files: string[] = [];
  for (const pkg of fs.readdirSync(path.join(ROOT, "packages"))) {
    const src = path.join(ROOT, "packages", pkg, "src");
    if (fs.existsSync(src)) collectTsFiles(src, files);
  }

  const keys = new Set<string>();
  for (const file of files) {
    const rel = repoRel(file);
    if (!rel) continue;
    const code = fs.readFileSync(file, "utf8");
    let ast;
    try {
      ast = parse(code);
    } catch {
      continue; // skip unparseable files
    }
    walk(ast as AstNode, (node) => {
      if (node.type !== "CallExpression") return;
      const macro = macroOfCall(node.callee);
      if (macro === null) return;
      keys.add(siteKey(rel, node, macro));
    });
  }

  const arr = [...keys].sort();
  writeJsonManifest(OUT_PATH, arr);
  console.log(`Wrote ${OUT_PATH}: ${arr.length} grandfathered sites`);
}

function walk(node: AstNode, visit: (n: AstNode) => void): void {
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === "parent") continue;
    const child = node[key];
    for (const candidate of Array.isArray(child) ? child : [child]) {
      const childNode = asNode(candidate);
      if (childNode) walk(childNode, visit);
    }
  }
}

main();
