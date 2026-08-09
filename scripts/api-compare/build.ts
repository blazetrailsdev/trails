#!/usr/bin/env npx tsx
/**
 * parity:api:build — reconcile per-method `@missingRailsCall` JSDoc blocks (minimal,
 * reconcile-only slice of docs/infrastructure/api-build-stub-generation-plan.md;
 * stub generation is a later phase).
 *
 * Reads the call-mismatch artifact (output/call-mismatches.json,
 * written by `pnpm parity:api --calls`) and, for each matched TS
 * method, rewrites its JSDoc so that:
 *
 *   - every currently-missing Rails call WITH a curated baseline reason carries
 *     one `@missingRailsCall <ruby_call> — <reason>` tag. A call whose reason is
 *     still the seeded placeholder gets no tag: the placeholder suppresses
 *     nothing, so minting it would only add inert prose to a source file while
 *     the reason kept living in the baseline JSON (RFC 0083);
 *   - tags for now-satisfied calls are dropped (human-authored reasons are
 *     harvested to stdout, never destroyed unseen);
 *   - existing tags that still apply are kept byte-for-byte (idempotent:
 *     a second run produces zero edits);
 *   - a tag with no reason fails the run (see the empty-reason contract in
 *     docs/infrastructure/api-build-stub-generation-plan.md);
 *   - reasons for newly-added tags migrate from the committed baselines
 *     (call-mismatches-exclude/);
 *   - the unreviewed high-water marks of the sources whose baseline rows were
 *     dropped are lowered in step, so a migration never leaves the gate's
 *     slack arm red pending a whole-repo reseed (RFC 0083).
 *
 * Method bodies are NEVER edited — only JSDoc blocks.
 *
 * Usage:
 *   pnpm parity:api:build --package <pkg> [--file <tsFile>] [--dry-run]
 *
 * Hard rules: no node:* imports, no process.* in the library surface (the CLI
 * entry guard is the sole exception, matching lint-call-mismatches.ts).
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as ts from "typescript";
import { fileURLToPath } from "url";
import { OUTPUT_DIR, ROOT_DIR, packageSrcDir } from "./config.js";
import { type ExcludeEntry, callOf, keyOf, missingScope } from "./call-mismatch-baseline.js";
import {
  MARK_DIR,
  loadSplitBaseline,
  relPathFor,
  writeSplitBaseline,
} from "./lint-call-mismatches.js";
import {
  type MarkSet,
  loadMarks,
  nextMarks,
  totalMark,
  unreviewedCounts,
  writeMarks,
} from "./unreviewed-ratchet.js";
import {
  DEFAULT_REASON,
  NARROW_DEFAULT_REASON,
  TAG,
  type TagEntry,
  justifies,
  parseJsdoc,
} from "./missing-rails-call-tags.js";

const ARTIFACT_PATH = path.join(OUTPUT_DIR, "call-mismatches.json");
const BASELINE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "call-mismatches-exclude",
);

export { TAG, parseJsdoc } from "./missing-rails-call-tags.js";
export type { JsdocOrigin, TagEntry } from "./missing-rails-call-tags.js";

export const DEFAULT_TAG_REASON = DEFAULT_REASON;
// Reasons treated as placeholders: dropping them on convergence needs no
// harvest report.
const PLACEHOLDER_REASONS = new Set([
  DEFAULT_TAG_REASON,
  NARROW_DEFAULT_REASON,
  "unported (parity:api:build stub)",
]);

export interface ArtifactMismatch {
  package: string;
  tsFile: string;
  rubyName: string;
  tsName: string;
  missing: string[];
}

export interface SuppressedCall {
  package: string;
  tsFile: string;
  rubyName: string;
  tsName: string;
  call: string;
}

export interface Artifact {
  packages?: string[];
  mismatches: ArtifactMismatch[];
  /** Flags a `@missingRailsCall` tag already suppressed (compare.ts). They are
   *  absent from `mismatches`, so reconciling against that list alone would
   *  drop the very tags that suppressed them. */
  suppressed?: SuppressedCall[];
}

export interface ReconcileResult {
  kept: TagEntry[];
  added: TagEntry[];
  dropped: TagEntry[];
  /** Missing calls with no curated reason to migrate: no tag is minted for
   *  them, so they stay in the baseline until a human writes the prose. */
  skipped: string[];
}

/** Diff existing entries against the expected missing-call set.
 *
 *  A call whose baseline reason is still {@link DEFAULT_TAG_REASON} (or blank)
 *  mints NO tag: a placeholder tag suppresses nothing (`justifies` rejects it),
 *  so it would only add inert prose to a source file while the reason kept
 *  living in the baseline JSON. The generator therefore only ever writes
 *  load-bearing tags, and a tree whose deviations are all still baselined
 *  reconciles to zero edits. */
export function reconcile(
  existing: TagEntry[],
  expected: ReadonlySet<string>,
  reasonFor: (call: string) => string,
): ReconcileResult {
  const byCall = new Map(existing.map((e) => [e.call, e]));
  const kept: TagEntry[] = [];
  const added: TagEntry[] = [];
  const skipped: string[] = [];
  for (const call of [...expected].sort()) {
    const have = byCall.get(call);
    if (have) {
      kept.push(have);
      continue;
    }
    const reason = reasonFor(call).trim();
    if (!justifies(reason)) skipped.push(call);
    else added.push({ call, reason, rawLines: [] });
  }
  const dropped = existing.filter((e) => !expected.has(e.call));
  return { kept, added, dropped, skipped };
}

// Wrap a new tag entry to lines at ~80 cols with a two-space hang indent.
function renderEntry(e: TagEntry, indent: string): string[] {
  if (e.rawLines.length > 0) return e.rawLines;
  const words = `${TAG} ${e.call} — ${e.reason}`.split(" ");
  const lines: string[] = [];
  let cur = `${indent} * `;
  for (const w of words) {
    // Never break so a continuation line would START with an `@`-word (a Ruby
    // ivar in the reason prose) — it would re-parse as a tag boundary.
    if (cur.trim() !== "*" && (cur + w).length > 80 && !w.startsWith("@")) {
      lines.push(cur.trimEnd());
      cur = `${indent} *   `;
    }
    cur += (cur.endsWith(" ") ? "" : " ") + w;
  }
  lines.push(cur.trimEnd());
  return lines;
}

const oneLineProse = (line: string): string =>
  line
    .replace(/^\s*\/\*\*\s?/, "")
    .replace(/\s*\*\/\s*$/, "")
    .trim();

/** Rebuild a JSDoc comment from its non-tag lines plus reconciled entries.
 *  Returns null when nothing remains (comment should be removed entirely).
 *
 *  A one-line `/** ... *\/` comment keeps its prose on the `/**` line, which
 *  the `head`/`hasProse` split cannot see; with no entries it is returned
 *  verbatim, so an ordinary doc comment on an untagged method is not deleted
 *  as "tags-only". */
export function renderJsdoc(rest: string[], entries: TagEntry[], indent: string): string | null {
  // Order entries by call name (code-unit order, matching the ratchet).
  const ordered = [...entries].sort((a, b) => (a.call < b.call ? -1 : a.call > b.call ? 1 : 0));
  let body = rest.slice();
  if (body.length === 0 || !body[0].trimStart().startsWith("/**")) {
    body = [`${indent}/**`, `${indent} */`];
  }
  if (ordered.length === 0 && body.length === 1) {
    return oneLineProse(body[0]) === "" ? null : body[0];
  }
  // Normalize a one-line `/** ... */` comment to block form when tags exist.
  if (ordered.length > 0 && body.length === 1) {
    const inner = oneLineProse(body[0]);
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

export interface MethodExpectation {
  /** Every Ruby method name matched onto this TS name, in artifact order. Two
   *  Ruby names can land on one TS method, and each keys its own baseline rows
   *  — reasons are looked up under all of them, and a justified tag drops the
   *  row of each, so a second Ruby name's deviation is not attributed to the
   *  first. */
  rubyNames: string[];
  calls: Set<string>;
}

// The first curated reason any of `rubyNames` has for `call`, else the
// placeholder. Only used to seed a NEW tag's prose.
function firstCuratedReason(
  rubyNames: string[],
  call: string,
  reasonFor: (rubyName: string, call: string) => string,
): string {
  for (const rubyName of rubyNames) {
    const reason = reasonFor(rubyName, call);
    if (justifies(reason.trim())) return reason;
  }
  return DEFAULT_TAG_REASON;
}

/** Reconcile every named function/method in one source file's text. Returns
 *  the new text (or null if unchanged) plus harvested non-placeholder drops. */
export function reconcileFileText(
  fileName: string,
  text: string,
  expectations: Map<string, MethodExpectation>,
  reasonFor: (rubyName: string, call: string) => string,
): {
  text: string | null;
  harvested: { tsName: string; entry: TagEntry }[];
  /** Every (rubyName, call) the file now tags with a real justification — kept
   *  and newly-added alike. These are the baseline rows the tag supersedes, so
   *  `main` drops them from the split baseline in the same operation (RFC
   *  0083). A tag still carrying the seeded placeholder justifies nothing and
   *  keeps its row: it does not suppress either (see `justifies`). */
  tagged: { rubyName: string; call: string }[];
  /** Expectation names never seen on a body-bearing declaration (mixin
   *  host-class duplicates, prototype-patched methods, …) — reported, never
   *  silently dropped. */
  unmatched: string[];
  /** Every missing call left untagged for want of a curated reason (see
   *  `reconcile`), so a zero-edit run still says how much is waiting on human
   *  prose. */
  skipped: string[];
} {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const edits: Edit[] = [];
  const harvested: { tsName: string; entry: TagEntry }[] = [];
  const tagged: { rubyName: string; call: string }[] = [];
  const seen = new Set<string>();
  const skipped: string[] = [];

  const visit = (node: ts.Node): void => {
    let name: string | null = null;
    // KNOWN LIMITATION: expectations are keyed by bare identifier name per
    // file (mirroring compare.ts's tsCallsByFileName), so two same-named
    // methods in one file (STI siblings, mixin + host, get/set accessor
    // pairs) are reconciled against the SAME expected-call set. Unlike the
    // lints this tool writes to source, so a shared name can stamp tags onto
    // a sibling they don't belong to — qualify by class if this ever bites.
    // Only body-bearing declarations: overload SIGNATURES (and interface /
    // ambient members) must not be stamped — tagging each overload duplicates
    // the block once per signature (found by the activerecord-wide run).
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isGetAccessor(node) ||
        ts.isSetAccessor(node)) &&
      node.body &&
      node.name &&
      ts.isIdentifier(node.name)
    ) {
      name = node.name.text;
    } else if (ts.isConstructorDeclaration(node) && node.body) {
      // Ruby `initialize` matches the TS constructor (artifact tsName
      // "constructor"), which carries no identifier.
      name = "constructor";
    }
    if (name !== null) {
      seen.add(name);
      const exp = expectations.get(name);
      const ranges = ts.getLeadingCommentRanges(text, node.getFullStart()) ?? [];
      const jsdocRange = ranges.filter((r) => text.slice(r.pos, r.pos + 3) === "/**").at(-1);
      const comment = jsdocRange ? text.slice(jsdocRange.pos, jsdocRange.end) : null;
      if (exp || (comment && comment.includes(TAG))) {
        const lineStart = text.lastIndexOf("\n", node.getStart(sf)) + 1;
        const indent = text.slice(lineStart, node.getStart(sf)).match(/^\s*/)?.[0] ?? "";
        const { rest, entries } = parseJsdoc(
          comment ?? "",
          jsdocRange
            ? {
                fileName,
                startLine: sf.getLineAndCharacterOfPosition(jsdocRange.pos).line + 1,
              }
            : undefined,
        );
        const expected = exp?.calls ?? new Set<string>();
        const r = reconcile(entries, expected, (c) =>
          exp ? firstCuratedReason(exp.rubyNames, c, reasonFor) : DEFAULT_TAG_REASON,
        );
        skipped.push(...r.skipped);
        if (exp) {
          for (const e of [...r.kept, ...r.added]) {
            if (!justifies(e.reason)) continue;
            for (const rubyName of exp.rubyNames) tagged.push({ rubyName, call: e.call });
          }
        }
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

  const unmatched = [...expectations.keys()].filter((n) => !seen.has(n)).sort();
  if (edits.length === 0) return { text: null, harvested, tagged, unmatched, skipped };
  let out = text;
  for (const e of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }
  return { text: out, harvested, tagged, unmatched, skipped };
}

/** (tsFile → tsName → expectation) for one package: every call the artifact
 *  still flags, PLUS every call a tag already suppressed. The second half is
 *  what keeps this reconcile idempotent — a suppressed call is absent from
 *  `mismatches`, so without it the tag that earned the suppression would be
 *  dropped as satisfied and the flag would return to the ratchet. */
export function buildExpectations(
  artifact: Artifact,
  pkg: string,
  onlyFile?: string,
): Map<string, Map<string, MethodExpectation>> {
  const byFile = new Map<string, Map<string, MethodExpectation>>();
  const expectationFor = (tsFile: string, tsName: string, rubyName: string) => {
    const fileMap = byFile.get(tsFile) ?? byFile.set(tsFile, new Map()).get(tsFile)!;
    const exp =
      fileMap.get(tsName) ?? fileMap.set(tsName, { rubyNames: [], calls: new Set() }).get(tsName)!;
    if (!exp.rubyNames.includes(rubyName)) exp.rubyNames.push(rubyName);
    return exp;
  };
  for (const m of artifact.mismatches) {
    if (m.package !== pkg) continue;
    if (onlyFile && m.tsFile !== onlyFile) continue;
    const exp = expectationFor(m.tsFile, m.tsName, m.rubyName);
    for (const missing of m.missing) exp.calls.add(callOf(missing));
  }
  for (const c of artifact.suppressed ?? []) {
    if (c.package !== pkg) continue;
    if (onlyFile && c.tsFile !== onlyFile) continue;
    expectationFor(c.tsFile, c.tsName, c.rubyName).calls.add(c.call);
  }
  return byFile;
}

/**
 * Lower the unreviewed high-water marks of the sources whose baseline rows this
 * run just migrated into `@missingRailsCall` tags (RFC 0083).
 *
 * A dropped row that carried the seeded {@link DEFAULT_TAG_REASON} in the
 * baseline (its tag reason came from the curated narrow one, which wins) leaves
 * its shard stale-HIGH, and the gate's slack arm reds on the next run — with a
 * whole-repo `parity:api:calls:reseed`, a compare regeneration this run never
 * needed, as the only remedy. The shard makes the fix precise: only the sources
 * actually rewritten are recomputed, so every other shard keeps its committed
 * value. Only-shrink comes free from `nextMarks` (it takes the min), and a
 * shard that reaches 0 is deleted rather than left as `{"max": 0}`.
 *
 * Returns the marks now on disk alongside the shards this run actually moved,
 * so the caller reports its own footprint rather than the whole tree's size. Dropping nothing writes nothing: a run with no
 * migrations must not rewrite the tree it has no measurement for.
 */
export async function lowerMarksForDropped(
  markDir: string,
  droppedEntries: ExcludeEntry[],
  remaining: ExcludeEntry[],
): Promise<{ marks: MarkSet; moved: string[] }> {
  const marks = await loadMarks(markDir);
  const touched = new Set(droppedEntries.map(relPathFor));
  if (touched.size === 0) return { marks, moved: [] };
  const counts = unreviewedCounts(remaining, DEFAULT_TAG_REASON, relPathFor);
  const scoped: MarkSet = new Map();
  for (const rel of touched) if (marks.has(rel)) scoped.set(rel, counts.get(rel) ?? 0);
  const lowered = nextMarks(scoped, marks);
  const next = new Map(marks);
  const moved: string[] = [];
  for (const rel of scoped.keys()) {
    const max = lowered.get(rel);
    if (max === undefined) next.delete(rel);
    else next.set(rel, max);
    if (next.get(rel) !== marks.get(rel)) moved.push(rel);
  }
  await writeMarks(markDir, next);
  return { marks: next, moved: moved.sort() };
}

async function main(argv: string[]): Promise<number> {
  const pkgIdx = argv.indexOf("--package");
  const pkg = pkgIdx !== -1 ? argv[pkgIdx + 1] : undefined;
  const fileIdx = argv.indexOf("--file");
  const onlyFile = fileIdx !== -1 ? argv[fileIdx + 1] : undefined;
  const dryRun = argv.includes("--dry-run");
  if (!pkg) {
    console.error("parity:api:build: --package <pkg> is required (minimal reconcile-only slice).");
    return 1;
  }

  const artifact = JSON.parse(await fs.readFile(ARTIFACT_PATH, "utf-8")) as Artifact;
  const absent = missingScope(artifact);
  if (absent.length > 0) {
    console.error(
      `parity:api:build: artifact compared a PARTIAL scope (missing: ${absent.join(", ")}). ` +
        "Regenerate with `API_COMPARE_FORCE=1 pnpm parity:api --calls` first.",
    );
    return 1;
  }

  const baseline = await loadSplitBaseline(BASELINE_DIR);
  const reasons = new Map<string, string>();
  for (const e of baseline) {
    reasons.set(keyOf(e), e.reason);
  }

  const byFile = buildExpectations(artifact, pkg, onlyFile);

  let changed = 0;
  let skipped = 0;
  const migrated = new Set<string>();
  const srcDir = packageSrcDir(pkg);
  for (const [tsFile, expectations] of [...byFile.entries()].sort()) {
    const abs = path.join(srcDir, tsFile);
    let text: string;
    try {
      text = await fs.readFile(abs, "utf-8");
    } catch {
      continue; // expected TS file not ported yet — stub phase, not this slice
    }
    let reconciled;
    try {
      reconciled = reconcileFileText(
        // Repo-relative so an unjustified-tag error names a path the operator
        // can open; the artifact key stays `tsFile`.
        path.relative(ROOT_DIR, abs),
        text,
        expectations,
        (rubyName, call) =>
          reasons.get(keyOf({ package: pkg, tsFile, rubyName, call })) ?? DEFAULT_TAG_REASON,
      );
    } catch (err) {
      console.error(`parity:api:build: ${err instanceof Error ? err.message : String(err)}`);
      return 1;
    }
    const { text: next, harvested, tagged, unmatched, skipped: fileSkipped } = reconciled;
    skipped += fileSkipped.length;
    for (const t of tagged) migrated.add(keyOf({ package: pkg, tsFile, ...t }));
    for (const h of harvested) {
      console.log(`harvested (${tsFile} ${h.tsName} ${h.entry.call}): ${h.entry.reason}`);
    }
    if (unmatched.length > 0) {
      console.log(`unmatched (${tsFile}): ${unmatched.join(", ")} — no body-bearing declaration`);
    }
    if (next !== null) {
      changed++;
      if (dryRun) console.log(`would update ${path.relative(ROOT_DIR, abs)}`);
      else await fs.writeFile(abs, next);
    }
  }
  const remaining = baseline.filter((e) => !migrated.has(keyOf(e)));
  const droppedEntries = baseline.filter((e) => migrated.has(keyOf(e)));
  const dropped = droppedEntries.length;
  if (dropped > 0 && !dryRun) {
    await writeSplitBaseline(remaining, BASELINE_DIR);
    const { marks, moved } = await lowerMarksForDropped(MARK_DIR, droppedEntries, remaining);
    console.log(
      `parity:api:build: lowered ${moved.length} unreviewed high-water mark(s) under ` +
        `${path.relative(ROOT_DIR, MARK_DIR)}/ for the source(s) rewritten above ` +
        `(${totalMark(marks)} unreviewed entr(ies) still marked repo-wide).`,
    );
    for (const rel of moved) console.log(`  - ${rel}`);
  }
  console.log(
    `parity:api:build: ${dropped} baseline entr(ies) ${dryRun ? "would migrate" : "migrated"} to ` +
      `@missingRailsCall tags and ${dryRun ? "would be" : "were"} dropped from ` +
      `${path.relative(ROOT_DIR, BASELINE_DIR)}/.`,
  );
  console.log(
    `parity:api:build: ${changed} file(s) ${dryRun ? "would change" : "updated"} (${pkg}).`,
  );
  if (skipped > 0) {
    console.log(
      `parity:api:build: ${skipped} missing call(s) left untagged — their baseline reason is still ` +
        "the seeded placeholder. Write per-entry prose in " +
        `${path.relative(ROOT_DIR, BASELINE_DIR)}/ (or at the call site) to migrate them.`,
    );
  }
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
