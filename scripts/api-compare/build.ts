#!/usr/bin/env npx tsx
/**
 * api:build — reconcile per-method `@missingRailsCall` JSDoc blocks (minimal,
 * reconcile-only slice of docs/infrastructure/api-build-stub-generation-plan.md;
 * stub generation is a later phase).
 *
 * Reads the wide call-mismatch artifact (output/call-mismatches-wide.json,
 * written by `pnpm api:compare --wide-calls`) and, for each matched TS
 * method, rewrites its JSDoc so that:
 *
 *   - every currently-missing Rails call carries one
 *     `@missingRailsCall <ruby_call> — <reason>` tag;
 *   - tags for now-satisfied calls are dropped (human-authored reasons are
 *     harvested to stdout, never destroyed unseen);
 *   - existing tags that still apply are kept byte-for-byte (idempotent:
 *     a second run produces zero edits);
 *   - reasons for newly-added tags migrate from the committed baselines
 *     (call-mismatches-wide-exclude/, call-mismatches-exclude.json).
 *
 * Method bodies are NEVER edited — only JSDoc blocks.
 *
 * Usage:
 *   pnpm api:build --package <pkg> [--file <tsFile>] [--dry-run]
 *
 * Hard rules: no node:* imports, no process.* in the library surface (the CLI
 * entry guard is the sole exception, matching lint-call-mismatches.ts).
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as ts from "typescript";
import { fileURLToPath } from "url";
import { OUTPUT_DIR, ROOT_DIR, packageSrcDir } from "./config.js";
import {
  type ExcludeEntry,
  callOf,
  keyOf,
  loadBaseline as loadNarrowBaseline,
  missingScope,
} from "./lint-call-mismatches.js";
import { loadSplitBaseline } from "./lint-call-mismatches-wide.js";

const ARTIFACT_PATH = path.join(OUTPUT_DIR, "call-mismatches-wide.json");
const WIDE_BASELINE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "call-mismatches-wide-exclude",
);

export const TAG = "@missingRailsCall";
export const DEFAULT_TAG_REASON =
  "Baseline (RFC 0047): wide call-set flag seeded when the wide ratchet landed; " +
  "bucket (b) equivalent or (c) noise pending per-cluster burndown review.";
// Reasons treated as placeholders: dropping them on convergence needs no
// harvest report.
const PLACEHOLDER_REASONS = new Set([DEFAULT_TAG_REASON, "unported (api:build stub)"]);

interface ArtifactMismatch {
  package: string;
  tsFile: string;
  rubyName: string;
  tsName: string;
  missing: string[];
}

interface WideArtifact {
  packages?: string[];
  mismatches: ArtifactMismatch[];
}

/** One parsed `@missingRailsCall` tag: the Ruby call name plus its raw lines
 *  (kept verbatim for idempotency) and the flattened reason text. */
export interface TagEntry {
  call: string;
  reason: string;
  rawLines: string[];
}

const TAG_LINE = /^\s*\*?\s*@missingRailsCall\s+(\S+)(?:\s+—\s?(.*))?$/;
const ANY_TAG_LINE = /^\s*\*?\s*@\S/;

/** Parse a JSDoc comment's text (including delimiters) into its non-tag lines
 *  and its `@missingRailsCall` entries. Continuation lines (not starting a new
 *  `@` tag) attach to the preceding entry. */
export function parseJsdoc(comment: string): { rest: string[]; entries: TagEntry[] } {
  const lines = comment.split("\n");
  const rest: string[] = [];
  const entries: TagEntry[] = [];
  let open: TagEntry | null = null;
  for (const line of lines) {
    const m = line.match(TAG_LINE);
    if (m) {
      open = { call: m[1]!, reason: m[2] ?? "", rawLines: [line] };
      entries.push(open);
      continue;
    }
    const closes = line.trim() === "*/" || line.trim().endsWith("*/");
    if (open && !ANY_TAG_LINE.test(line) && !closes && line.trim() !== "*") {
      open.rawLines.push(line);
      open.reason = (open.reason + " " + line.replace(/^\s*\*\s?/, "").trim()).trim();
      continue;
    }
    open = null;
    rest.push(line);
  }
  return { rest, entries };
}

export interface ReconcileResult {
  kept: TagEntry[];
  added: TagEntry[];
  dropped: TagEntry[];
}

/** Diff existing entries against the expected missing-call set. */
export function reconcile(
  existing: TagEntry[],
  expected: ReadonlySet<string>,
  reasonFor: (call: string) => string,
): ReconcileResult {
  const byCall = new Map(existing.map((e) => [e.call, e]));
  const kept: TagEntry[] = [];
  const added: TagEntry[] = [];
  for (const call of [...expected].sort()) {
    const have = byCall.get(call);
    if (have) kept.push(have);
    else added.push({ call, reason: reasonFor(call), rawLines: [] });
  }
  const dropped = existing.filter((e) => !expected.has(e.call));
  return { kept, added, dropped };
}

// Wrap a new tag entry to lines at ~80 cols with a two-space hang indent.
function renderEntry(e: TagEntry, indent: string): string[] {
  if (e.rawLines.length > 0) return e.rawLines;
  const words = `${TAG} ${e.call} — ${e.reason}`.split(" ");
  const lines: string[] = [];
  let cur = `${indent} * `;
  for (const w of words) {
    if (cur.trim() !== "*" && (cur + w).length > 80) {
      lines.push(cur.trimEnd());
      cur = `${indent} *   `;
    }
    cur += (cur.endsWith(" ") ? "" : " ") + w;
  }
  lines.push(cur.trimEnd());
  return lines;
}

/** Rebuild a JSDoc comment from its non-tag lines plus reconciled entries.
 *  Returns null when nothing remains (comment should be removed entirely). */
export function renderJsdoc(rest: string[], entries: TagEntry[], indent: string): string | null {
  // Order entries by call name (code-unit order, matching the ratchet).
  const ordered = [...entries].sort((a, b) => (a.call < b.call ? -1 : a.call > b.call ? 1 : 0));
  let body = rest.slice();
  if (body.length === 0 || !body[0]!.trimStart().startsWith("/**")) {
    body = [`${indent}/**`, `${indent} */`];
  }
  // Normalize a one-line `/** ... */` comment to block form when tags exist.
  if (ordered.length > 0 && body.length === 1) {
    const one = body[0]!;
    const inner = one.replace(/^\s*\/\*\*\s?/, "").replace(/\s*\*\/\s*$/, "");
    body = [`${indent}/**`, ...(inner ? [`${indent} * ${inner}`] : []), `${indent} */`];
  }
  const closeIdx = body.findIndex((l) => l.trim().endsWith("*/"));
  const head = body.slice(0, closeIdx);
  // Normalize: drop trailing blank `*` lines so the separator below is not
  // duplicated on a re-run (idempotency).
  while (head.length > 1 && head.at(-1)!.trim() === "*") head.pop();
  const tail = body.slice(closeIdx);
  const hasProse = head.some((l) => l.replace(/^\s*(\/\*\*|\*)\s?/, "").trim() !== "");
  if (ordered.length === 0) {
    if (!hasProse) return null;
    return [...head, ...tail].join("\n");
  }
  const tagLines = ordered.flatMap((e) => renderEntry(e, indent));
  const sep = hasProse ? [`${indent} *`] : [];
  return [...head, ...sep, ...tagLines, ...tail].join("\n");
}

interface Edit {
  start: number;
  end: number;
  text: string;
}

interface MethodExpectation {
  rubyName: string;
  calls: Set<string>;
}

/** Reconcile every named function/method in one source file's text. Returns
 *  the new text (or null if unchanged) plus harvested non-placeholder drops. */
export function reconcileFileText(
  fileName: string,
  text: string,
  expectations: Map<string, MethodExpectation>,
  reasonFor: (rubyName: string, call: string) => string,
): { text: string | null; harvested: { tsName: string; entry: TagEntry }[] } {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const edits: Edit[] = [];
  const harvested: { tsName: string; entry: TagEntry }[] = [];

  const visit = (node: ts.Node): void => {
    let name: string | null = null;
    if (
      (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isGetAccessor(node)) &&
      node.name &&
      ts.isIdentifier(node.name)
    ) {
      name = node.name.text;
    }
    if (name !== null) {
      const exp = expectations.get(name);
      const ranges = ts.getLeadingCommentRanges(text, node.getFullStart()) ?? [];
      const jsdocRange = ranges.filter((r) => text.slice(r.pos, r.pos + 3) === "/**").at(-1);
      const comment = jsdocRange ? text.slice(jsdocRange.pos, jsdocRange.end) : null;
      if (exp || (comment && comment.includes(TAG))) {
        const lineStart = text.lastIndexOf("\n", node.getStart(sf)) + 1;
        const indent = text.slice(lineStart, node.getStart(sf)).match(/^\s*/)?.[0] ?? "";
        const { rest, entries } = parseJsdoc(comment ?? "");
        const expected = exp?.calls ?? new Set<string>();
        const r = reconcile(entries, expected, (c) =>
          exp ? reasonFor(exp.rubyName, c) : DEFAULT_TAG_REASON,
        );
        for (const d of r.dropped) {
          if (!PLACEHOLDER_REASONS.has(d.reason)) harvested.push({ tsName: name, entry: d });
        }
        const next = renderJsdoc(comment ? rest : [], [...r.kept, ...r.added], indent);
        if (comment && jsdocRange) {
          if (next === null) {
            // Remove the comment plus its trailing newline + indent.
            let end = jsdocRange.end;
            if (text[end] === "\n") end += 1 + indent.length;
            edits.push({ start: jsdocRange.pos, end, text: "" });
          } else if (next !== comment) {
            edits.push({ start: jsdocRange.pos, end: jsdocRange.end, text: next });
          }
        } else if (next !== null) {
          // Rendered lines already carry the indent; the original declaration
          // line (starting at lineStart) keeps its own.
          edits.push({ start: lineStart, end: lineStart, text: next + "\n" });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  if (edits.length === 0) return { text: null, harvested };
  let out = text;
  for (const e of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }
  return { text: out, harvested };
}

async function main(argv: string[]): Promise<number> {
  const pkgIdx = argv.indexOf("--package");
  const pkg = pkgIdx !== -1 ? argv[pkgIdx + 1] : undefined;
  const fileIdx = argv.indexOf("--file");
  const onlyFile = fileIdx !== -1 ? argv[fileIdx + 1] : undefined;
  const dryRun = argv.includes("--dry-run");
  if (!pkg) {
    console.error("api:build: --package <pkg> is required (minimal reconcile-only slice).");
    return 1;
  }

  const artifact = JSON.parse(await fs.readFile(ARTIFACT_PATH, "utf-8")) as WideArtifact;
  const absent = missingScope(artifact);
  if (absent.length > 0) {
    console.error(
      `api:build: artifact compared a PARTIAL scope (missing: ${absent.join(", ")}). ` +
        "Regenerate with `API_COMPARE_FORCE=1 pnpm api:compare --wide-calls` first.",
    );
    return 1;
  }

  const wideBaseline = await loadSplitBaseline(WIDE_BASELINE_DIR);
  const narrowBaseline = await loadNarrowBaseline();
  const reasons = new Map<string, string>();
  // Narrow reasons are the more curated (RFC 0044 hand-triage); they win.
  for (const e of [...wideBaseline, ...narrowBaseline] as ExcludeEntry[]) {
    reasons.set(keyOf(e), e.reason);
  }

  // (package, tsFile) → tsName → expectation.
  const byFile = new Map<string, Map<string, MethodExpectation>>();
  for (const m of artifact.mismatches) {
    if (m.package !== pkg) continue;
    if (onlyFile && m.tsFile !== onlyFile) continue;
    const fileMap = byFile.get(m.tsFile) ?? byFile.set(m.tsFile, new Map()).get(m.tsFile)!;
    const exp =
      fileMap.get(m.tsName) ??
      fileMap.set(m.tsName, { rubyName: m.rubyName, calls: new Set() }).get(m.tsName)!;
    for (const missing of m.missing) exp.calls.add(callOf(missing));
  }

  let changed = 0;
  const srcDir = packageSrcDir(pkg);
  for (const [tsFile, expectations] of [...byFile.entries()].sort()) {
    const abs = path.join(srcDir, tsFile);
    let text: string;
    try {
      text = await fs.readFile(abs, "utf-8");
    } catch {
      continue; // expected TS file not ported yet — stub phase, not this slice
    }
    const { text: next, harvested } = reconcileFileText(
      tsFile,
      text,
      expectations,
      (rubyName, call) =>
        reasons.get(keyOf({ package: pkg, tsFile, rubyName, call })) ?? DEFAULT_TAG_REASON,
    );
    for (const h of harvested) {
      console.log(`harvested (${tsFile} ${h.tsName} ${h.entry.call}): ${h.entry.reason}`);
    }
    if (next !== null) {
      changed++;
      if (dryRun) console.log(`would update ${path.relative(ROOT_DIR, abs)}`);
      else await fs.writeFile(abs, next);
    }
  }
  console.log(`api:build: ${changed} file(s) ${dryRun ? "would change" : "updated"} (${pkg}).`);
  return 0;
}

async function runAsScript(): Promise<void> {
  const self = fileURLToPath(import.meta.url);
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
  if (path.resolve(self) !== invoked) return;
  const code = await main(process.argv.slice(2));
  process.exit(code);
}

void runAsScript();
