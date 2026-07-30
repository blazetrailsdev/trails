#!/usr/bin/env npx tsx
/**
 * api:detached — flag JSDoc blocks whose api-compare-significant tags
 * (`@internal`, `@noRailsEquivalent`) are detached from the declaration they
 * were written for.
 *
 * `hasInternalJsDocTag` / `noRailsEquivalentReason` (extract-ts-api.ts) read
 * whatever TypeScript *bound* to a declaration. When a node lands between a
 * tag block and its declaration, the tag silently stops applying to that
 * declaration — the member reads as unjustified public surface, or the tag
 * lands on a neighbour and excuses surface it was never written for. Both
 * outcomes look exactly like "no tag was written", so nothing else reports
 * them. This lint checks the *textual* shape instead of trusting the binding.
 *
 * Two shapes are reported:
 *
 *   - `separated` — something other than whitespace (a `//` comment, a
 *     non-JSDoc block comment, a directive) sits between the tag block and the
 *     start of the declaration TypeScript bound it to. Consecutive JSDoc
 *     blocks on one declaration are NOT this shape: TypeScript merges their
 *     tags, so both still apply.
 *   - `unbound` — the block carries a significant tag but TypeScript bound it
 *     to no node at all (e.g. it trails the last statement of a file). The tag
 *     is inert.
 *
 * Two narrower variants are deliberately NOT reported:
 *
 *   - The *insertion* case that motivated this lint (RFC 0080): a new
 *     declaration inserted between a block and the declaration it documented,
 *     so the block now binds to the inserted one. It is textually
 *     indistinguishable from an ordinary doc comment on the inserted
 *     declaration — the only evidence is the diff, not the tree — so it is a
 *     review-time concern, not a lint-time one. What this lint does cover is
 *     the same defect whenever the inserted node is not itself a declaration.
 *   - A block bound to a non-declaration node (an `if`, a `return`). The tag
 *     is inert there too, but JSDoc on statements is legitimate prose in this
 *     tree and flagging it would be noise.
 *
 * Usage:
 *   pnpm api:detached
 *
 * Hard rules: no node:* imports, no process.* outside the CLI entry guard.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import * as ts from "typescript";
import { ROOT_DIR } from "./config.js";
import { listSourceFiles } from "./lint-missing-rails-call-reasons.js";

const PACKAGES_DIR = path.join(ROOT_DIR, "packages");
const SIGNIFICANT_TAGS = new Set(["internal", "noRailsEquivalent"]);
const JSDOC_BLOCK = /\/\*\*[\s\S]*?\*\//g;

export interface Detachment {
  file: string;
  line: number;
  tags: string[];
  kind: "separated" | "unbound";
  detail: string;
}

function significantTags(block: ts.JSDoc): string[] {
  return (block.tags ?? [])
    .map((tag) => tag.tagName.text)
    .filter((name) => SIGNIFICANT_TAGS.has(name));
}

interface BoundBlock {
  node: ts.Node;
  block: ts.JSDoc;
  siblings: ts.JSDoc[];
}

/** Every JSDoc block TypeScript bound to a node, keyed by the offset of its
 *  `/**` (a JSDoc node's `pos` starts at the preceding node's end, not at the
 *  comment). Recorded outermost-first so a `VariableStatement` wins over the
 *  `VariableDeclaration` that repeats its blocks. A block bound to the
 *  end-of-file token is deliberately left out: it documents nothing, and the
 *  unbound pass reports it. */
function boundBlocks(sourceFile: ts.SourceFile, text: string): Map<number, BoundBlock> {
  const bound = new Map<number, BoundBlock>();
  const visit = (node: ts.Node) => {
    const siblings = (node as { jsDoc?: ts.JSDoc[] }).jsDoc;
    if (siblings && node.kind !== ts.SyntaxKind.EndOfFileToken) {
      for (const block of siblings) {
        const start = text.indexOf("/**", block.pos);
        if (start !== -1 && !bound.has(start)) bound.set(start, { node, block, siblings });
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  return bound;
}

/** The bound declaration's name, for the report. A `VariableStatement` holds
 *  the JSDoc but its declaration holds the name, hence the descent. */
function describe(node: ts.Node): string {
  const named = ts.isVariableStatement(node) ? node.declarationList.declarations[0] : node;
  const name = (named as { name?: ts.Node }).name;
  return name && ts.isIdentifier(name as ts.Node) ? (name as ts.Identifier).text : "the code below";
}

export function lintFileText(fileName: string, text: string): Detachment[] {
  if (![...SIGNIFICANT_TAGS].some((tag) => text.includes(`@${tag}`))) return [];
  const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.ESNext, true);
  const bound = boundBlocks(sourceFile, text);
  const lineOf = (pos: number) => sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
  const found: Detachment[] = [];

  for (const [start, { node, block, siblings }] of bound) {
    const tags = significantTags(block);
    if (tags.length === 0) continue;
    // The next sibling JSDoc block bounds the gap: TypeScript merges the tags
    // of consecutive blocks, so an intervening one is not a detachment.
    const next = siblings.find((candidate) => candidate.pos >= block.end);
    const gapEnd = next ? text.indexOf("/**", next.pos) : node.getStart(sourceFile);
    const gap = text.slice(block.end, gapEnd);
    if (gap.trim() === "") continue;
    found.push({
      file: fileName,
      line: lineOf(start),
      tags,
      kind: "separated",
      detail: `${gap.trim().split("\n")[0]!.slice(0, 60)} … separates it from \`${describe(node)}\``,
    });
  }

  for (const match of text.matchAll(JSDOC_BLOCK)) {
    if (bound.has(match.index)) continue;
    const tags = [...SIGNIFICANT_TAGS].filter((tag) =>
      new RegExp(`(^|[\\s*])@${tag}\\b`).test(match[0]),
    );
    if (tags.length === 0) continue;
    found.push({
      file: fileName,
      line: lineOf(match.index),
      tags,
      kind: "unbound",
      detail: "bound to no declaration",
    });
  }

  return found.sort((a, b) => a.line - b.line);
}

export async function main(): Promise<number> {
  const files = await listSourceFiles(PACKAGES_DIR);
  const found: Detachment[] = [];
  for (const abs of files) {
    found.push(...lintFileText(path.relative(ROOT_DIR, abs), await fs.readFile(abs, "utf-8")));
  }
  if (found.length > 0) {
    for (const d of found) {
      console.error(
        `api:detached: ${d.file}:${d.line} — @${d.tags.join(", @")} ${d.kind}: ${d.detail}`,
      );
    }
    console.error(
      `api:detached: ${found.length} detached tag block(s) — move the block flush against ` +
        "the declaration it documents, or the tag does not apply to it.",
    );
    return 1;
  }
  console.log(`api:detached: ${files.length} file(s) checked, no detached tag blocks.`);
  return 0;
}

async function runAsScript(): Promise<void> {
  const self = fileURLToPath(import.meta.url);
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
  if (path.resolve(self) !== invoked) return;
  process.exit(await main());
}

void runAsScript();
