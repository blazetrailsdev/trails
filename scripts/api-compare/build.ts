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
 *     harvested to stdout, never destroyed unseen). A call is "now-satisfied"
 *     only where the artifact carries an expectation for the declaration; a tag
 *     on a declaration the artifact says nothing about is preserved verbatim;
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
 *   pnpm parity:api:build --package <pkg> [--file <tsFile>] [--call <ruby_call>] [--dry-run]
 *
 * `--dry-run` reports what would move WITHOUT touching a file, and names the
 * `kind: "args"` rows in scope it will never move — those belong to the
 * call-ARGUMENT dimension (`pnpm parity:api:calls:args`), and a bare `0` for a
 * shard full of them reads as "stale rows, delete the shard" (RFC 0106).
 *
 * `--call` (repeatable) migrates one cluster of Ruby calls and leaves every
 * other flagged call baselined, so a source file whose curated rows mix a
 * permanent cluster with unrelated tracked debt migrates the cluster alone.
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
  missingScope,
  rowsOfKind,
} from "./call-mismatch-baseline.js";
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
  /** The class declaring `tsName`, when compare.ts could resolve one for the
   *  matched pair (see `resolveTsOwner`). A tag is minted on THAT declaration
   *  alone; absent, every declaration of the name in the file is reconciled,
   *  as before this was keyed. */
  tsClass?: string;
  /** The file `tsName` is DECLARED in, when trails split it out of the file
   *  the Ruby path mirrors (compare.ts `declFileFor`): `cache.rb`'s `Store`
   *  members live in `cache/store.ts` while the row stays keyed `cache.ts`.
   *  The tag is written THERE; the baseline row keeps its `tsFile` key. */
  tsDeclFile?: string;
  missing: string[];
}

export interface SuppressedCall {
  package: string;
  tsFile: string;
  rubyName: string;
  tsName: string;
  /** See `ArtifactMismatch.tsClass`. */
  tsClass?: string;
  /** See `ArtifactMismatch.tsDeclFile`. */
  tsDeclFile?: string;
  call: string;
}

/** One `@missingRailsCall` tag compare.ts reports STALE: it suppressed nothing
 *  on the (tsFile, tsName) it is written on, so the call it names is no longer
 *  flagged there. Confirmation enough to retire the tag even where the
 *  declaration carries no expectation of its own. */
export interface StaleTag {
  package: string;
  tsFile: string;
  /** The declaring class (`""` for a top-level function) — see
   *  compare.ts `StaleCallTag.tsClass`. Absent on an artifact written before
   *  RFC 0106 keyed staleness by owner. */
  tsClass?: string;
  /** See `ArtifactMismatch.tsDeclFile`. */
  tsDeclFile?: string;
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
  /** Tags whose call compare.ts no longer flags on the declaration they sit on
   *  (`staleCallTags`). A preserved tag named here is a confirmed convergence,
   *  so this run retires it instead of preserving it. */
  staleTags?: StaleTag[];
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
 *  reconciles to zero edits.
 *
 *  `onlyCall` narrows what a run MINTS to one cluster of Ruby calls (the
 *  `--call` flag): a call outside it is left baselined exactly as an
 *  unjustified one is, so a source file whose curated rows are a permanent
 *  cluster plus unrelated tracked debt migrates the cluster alone. It never
 *  narrows what a run KEEPS or DROPS — an existing tag outside the filter is
 *  reconciled as usual, so a filtered run stays idempotent. */
export function reconcile(
  existing: TagEntry[],
  expected: ReadonlySet<string>,
  reasonFor: (call: string) => string,
  onlyCall?: ReadonlySet<string>,
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
    if (onlyCall && !onlyCall.has(call)) skipped.push(call);
    else if (!justifies(reason)) skipped.push(call);
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
  // Its opener replaces the comment IN PLACE, after the declaration line's own
  // indent, so — unlike the synthesized block above — it carries none itself.
  if (ordered.length > 0 && body.length === 1) {
    const inner = oneLineProse(body[0]);
    body = ["/**", ...(inner ? [`${indent} * ${inner}`] : []), `${indent} */`];
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

/** Key for one expectation: the declaration a tag belongs on. `tsClass` is the
 *  declaring class, `""` for a top-level function, and `ANY_CLASS` when
 *  compare.ts could not resolve one — the last matching any declaration of the
 *  name in the file. */
export function expectationKey(tsClass: string, tsName: string): string {
  return `${tsClass}\u0000${tsName}`;
}

/** Stands in for a class in {@link expectationKey} when the artifact carries
 *  none. */
export const ANY_CLASS = "*";

export interface MethodExpectation {
  /** Every Ruby method name matched onto this TS name, in artifact order. Two
   *  Ruby names can land on one TS method, and each keys its own baseline rows
   *  — reasons are looked up under all of them, and a justified tag drops the
   *  row of each, so a second Ruby name's deviation is not attributed to the
   *  first. */
  rubyNames: string[];
  /** The declaration's TS name, since the map key is class-qualified. */
  tsName: string;
  /** The file to open to reach the declaration, when it is not the row's
   *  `tsFile` — see `ArtifactMismatch.tsDeclFile`. */
  declFile?: string;
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

/**
 * The owner name `extract-ts-api.ts` synthesizes for a file's top-level
 * functions — the PascalCased file basename, so `aggregations.ts` records
 * `composedOf` under `Aggregations` and `secure-password.ts` records
 * `authenticateBy` under `SecurePassword`. compare.ts keys its expectation
 * under that owner, so the migrator has to look there for a declaration the
 * AST reports at the top level. The fallback yields to any owner a declaration
 * in the file names for itself — `relation.ts` declares `class Relation`, whose
 * members keep their own key.
 */
export function fileModuleName(fileName: string): string {
  const base = (fileName.split("/").at(-1) ?? fileName).replace(/\.ts$/, "");
  return base
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/** One declaration a `@missingRailsCall` tag can be minted onto: its TS name,
 *  the owner it is written under (`""` at the top level), and the node whose
 *  leading JSDoc the tag joins. */
interface TaggableDecl {
  name: string;
  owner: string;
  node: ts.Node;
}

/** The owner a declaration is written under: the class it sits in, else the
 *  `const` an enclosing object literal is assigned to — the settled trails
 *  mixin idiom (CLAUDE.md "Module mixins"), which extract-ts-api.ts harvests as
 *  a module of that name — else `""` at the top level. */
function ownerName(node: ts.Node): string {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isClassDeclaration(p) || ts.isClassExpression(p)) return p.name?.text ?? "";
    if (
      ts.isObjectLiteralExpression(p) &&
      ts.isVariableDeclaration(p.parent) &&
      ts.isIdentifier(p.parent.name)
    ) {
      return p.parent.name.text;
    }
  }
  return "";
}

/**
 * Every declaration in one file a tag can be minted onto.
 *
 * Beyond the method/function forms, this covers the two shapes the repo's own
 * conventions produce and the migrator used to report as "no body-bearing
 * declaration": a method inside a mixin object literal, and a property (class
 * field or object-literal key) initialized with an arrow function. An overload
 * SIGNATURE is still skipped — it has no body, and tagging each one duplicates
 * the block per signature.
 */
export function collectDeclarations(sf: ts.SourceFile): TaggableDecl[] {
  const decls: TaggableDecl[] = [];
  const visit = (node: ts.Node): void => {
    let name: string | null = null;
    let host: ts.Node = node;
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
    } else if (
      (ts.isPropertyDeclaration(node) || ts.isPropertyAssignment(node)) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      name = node.name.text;
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) &&
      ts.isVariableStatement(node.parent.parent)
    ) {
      name = node.name.text;
      // The JSDoc of `export const foo = () => {}` leads the STATEMENT, not the
      // declaration inside its declaration list.
      host = node.parent.parent;
    }
    if (name !== null) decls.push({ name, owner: ownerName(node), node: host });
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return decls;
}

/** Reconcile every named function/method in one source file's text. Returns
 *  the new text (or null if unchanged) plus harvested non-placeholder drops. */
/** Key for one stale-tag row within a declaring file: the class-qualified
 *  (tsClass, tsName, call) site compare.ts reported it for. The class is what
 *  keeps two declarations of one name reachable from a single row-file — a
 *  top-level `foo` beside a `Store#foo` split into a subdirectory module, or
 *  two classes in one file — from sharing a retirement key and deleting each
 *  other's reviewed receipts (RFC 0106). */
export function staleTagKey(tsClass: string, tsName: string, call: string): string {
  return `${tsClass}\u0000${tsName}\u0000${call}`;
}

export function reconcileFileText(
  fileName: string,
  text: string,
  expectations: Map<string, MethodExpectation>,
  reasonFor: (rubyName: string, call: string) => string,
  onlyCall?: ReadonlySet<string>,
  staleTags?: ReadonlySet<string>,
): {
  text: string | null;
  /** Tags DROPPED because the call they name is no longer flagged for a
   *  declaration the artifact does know — a genuine convergence, reported so
   *  the receipt does not vanish unseen. */
  harvested: { tsName: string; entry: TagEntry }[];
  /** Tags left exactly as written on a declaration the artifact carries no
   *  expectation for. Nothing here was migrated, and nothing here was dropped. */
  preserved: { tsName: string; entry: TagEntry }[];
  /** Every (rubyName, call) the file now tags with a real justification — kept
   *  and newly-added alike. These are the baseline rows the tag supersedes, so
   *  `main` drops them from the split baseline in the same operation (RFC
   *  0083). A tag still carrying the seeded placeholder justifies nothing and
   *  keeps its row: it does not suppress either (see `justifies`). */
  tagged: { rubyName: string; call: string }[];
  /** Expectation names never seen on a declaration this file can tag
   *  (prototype-patched methods, a name declared only in another file, …) —
   *  reported, never silently dropped. */
  unmatched: string[];
  /** Every missing call left untagged for want of a curated reason (see
   *  `reconcile`), so a zero-edit run still says how much is waiting on human
   *  prose. */
  skipped: string[];
} {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const edits: Edit[] = [];
  const harvested: { tsName: string; entry: TagEntry }[] = [];
  const preserved: { tsName: string; entry: TagEntry }[] = [];
  const tagged: { rubyName: string; call: string }[] = [];
  const seen = new Set<string>();
  const skipped: string[] = [];

  const decls = collectDeclarations(sf);
  const declaredKeys = new Set(decls.map((d) => expectationKey(d.owner, d.name)));
  const moduleName = fileModuleName(fileName);

  for (const { name, owner, node } of decls) {
    const key = expectationKey(owner, name);
    const fileModuleKey = expectationKey(moduleName, name);
    const anyKey = expectationKey(ANY_CLASS, name);
    const useFileModuleKey =
      owner === "" && fileModuleKey !== key && !declaredKeys.has(fileModuleKey);
    seen.add(key);
    if (useFileModuleKey && expectations.has(fileModuleKey)) seen.add(fileModuleKey);
    if (expectations.has(anyKey)) seen.add(anyKey);
    const exp =
      expectations.get(key) ??
      (useFileModuleKey ? expectations.get(fileModuleKey) : undefined) ??
      expectations.get(anyKey);
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
      // With no expectation, the artifact knows nothing about this
      // declaration — compare.ts matched no Ruby method onto it, so it reports
      // neither a flag nor a suppression for any call. An empty `expected`
      // would then read every pre-existing tag as satisfied and delete it, which
      // is how PR #6873 silently dropped two reviewed receipts that had no
      // baseline row to put them back. Expect exactly what the file already
      // tags instead: the run is tag-preserving where it has nothing to say.
      // A tag that HAS genuinely gone stale is reported by compare.ts's
      // `staleCallTags` (the sanctioned channel), so preserving one here costs a
      // report line rather than a lost receipt.
      // ...unless compare.ts positively reports the tag STALE on this
      // declaration: that is the same knowledge the gate's "STALE
      // @missingRailsCall tag(s)" arm reds on, so the writer retires the tag
      // rather than making a human do it by hand (RFC 0106).
      const expected =
        exp?.calls ??
        new Set<string>(
          entries
            .filter((e) => !staleTags?.has(staleTagKey(owner, name, e.call)))
            .map((e) => e.call),
        );
      const r = reconcile(
        entries,
        expected,
        (c) => (exp ? firstCuratedReason(exp.rubyNames, c, reasonFor) : DEFAULT_TAG_REASON),
        onlyCall,
      );
      if (!exp) {
        preserved.push(
          ...entries
            .filter((entry) => !staleTags?.has(staleTagKey(owner, name, entry.call)))
            .map((entry) => ({ tsName: name, entry })),
        );
      }
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

  const unmatched = [...expectations.entries()]
    .filter(([k]) => !seen.has(k))
    .map(([, e]) => e.tsName)
    .sort();
  if (edits.length === 0) return { text: null, harvested, preserved, tagged, unmatched, skipped };
  let out = text;
  for (const e of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }
  return { text: out, harvested, preserved, tagged, unmatched, skipped };
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
  const expectationFor = (
    tsFile: string,
    tsName: string,
    tsClass: string | undefined,
    rubyName: string,
    declFile: string | undefined,
  ) => {
    const fileMap = byFile.get(tsFile) ?? byFile.set(tsFile, new Map()).get(tsFile)!;
    const key = expectationKey(tsClass ?? ANY_CLASS, tsName);
    const exp =
      fileMap.get(key) ??
      fileMap.set(key, { rubyNames: [], tsName, declFile, calls: new Set() }).get(key)!;
    if (!exp.rubyNames.includes(rubyName)) exp.rubyNames.push(rubyName);
    return exp;
  };
  for (const m of artifact.mismatches) {
    if (m.package !== pkg) continue;
    if (onlyFile && m.tsFile !== onlyFile) continue;
    const exp = expectationFor(m.tsFile, m.tsName, m.tsClass, m.rubyName, m.tsDeclFile);
    for (const missing of m.missing) exp.calls.add(callOf(missing));
  }
  for (const c of artifact.suppressed ?? []) {
    if (c.package !== pkg) continue;
    if (onlyFile && c.tsFile !== onlyFile) continue;
    expectationFor(c.tsFile, c.tsName, c.tsClass, c.rubyName, c.tsDeclFile).calls.add(c.call);
  }
  return byFile;
}

/**
 * Split one baseline file's expectations into the files that actually declare
 * them.
 *
 * A row is keyed by the `tsFile` the Ruby path mirrors, which is where the
 * baseline reason lives; the declaration can sit elsewhere when trails split a
 * Rails class into a subdirectory module (see `ArtifactMismatch.tsDeclFile`).
 * The row's own file is always a group, so a run whose only business there is a
 * stale tag still opens it. `extraDeclFiles` groups the declaring files a
 * stale-tag row names but no expectation reaches — a stale-only tag on a split
 * declaration would otherwise never have its file opened.
 */
export function groupByDeclFile(
  tsFile: string,
  expectations: ReadonlyMap<string, MethodExpectation>,
  extraDeclFiles: Iterable<string> = [],
): Map<string, Map<string, MethodExpectation>> {
  const byDecl = new Map<string, Map<string, MethodExpectation>>([[tsFile, new Map()]]);
  for (const file of extraDeclFiles) {
    if (!byDecl.has(file)) byDecl.set(file, new Map());
  }
  for (const [key, exp] of expectations) {
    const file = exp.declFile ?? tsFile;
    const group = byDecl.get(file) ?? byDecl.set(file, new Map()).get(file)!;
    group.set(key, exp);
  }
  return byDecl;
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

/**
 * The baseline rows in this run's scope, both dimensions, so the run can say
 * how many of them it did not migrate.
 *
 * `call-mismatches-exclude/` shards hold both dimensions (RFC 0095): a
 * `kind: "args"` row is the call-ARGUMENT gate's, and this migrator only ever
 * mints `@missingRailsCall` receipts. Reporting a bare `0 rows would migrate`
 * for a shard whose remaining rows are all args-kind reads as "these rows are
 * stale and exclude nothing" — a misreading that cost a full story cycle
 * (RFC 0106; the rows deleted on that evidence were live, and their deletion
 * red `parity:api:calls:args` with two NEW rows).
 */
export function scopedRows(
  baseline: readonly ExcludeEntry[],
  pkg: string,
  onlyFile?: string,
): ExcludeEntry[] {
  return baseline.filter(
    (e) => e.package === pkg && (onlyFile === undefined || e.tsFile === onlyFile),
  );
}

/**
 * What this run did to the baseline rows in its scope.
 *
 * The second line is the RFC 0106 fix: this migrator mints `@missingRailsCall`
 * receipts, so it never migrates a `kind: "args"` row, and a shard whose
 * remaining rows are all args-kind used to report a bare `0 rows would migrate`
 * — indistinguishable from "these rows are stale and exclude nothing". Deleting
 * such a shard on that reading reds `parity:api:calls:args` with the rows it
 * was excluding.
 */
export function migrationSummary(
  inScope: readonly ExcludeEntry[],
  dropped: number,
  dryRun: boolean,
): string[] {
  const lines = [
    `parity:api:build: ${dropped} of ${inScope.length} baseline entr(ies) in scope ` +
      `${dryRun ? "would migrate" : "migrated"} to @missingRailsCall tags and ` +
      `${dryRun ? "would be" : "were"} dropped from ` +
      `${path.relative(ROOT_DIR, BASELINE_DIR)}/.`,
  ];
  const argsRows = rowsOfKind([...inScope], "args");
  if (argsRows.length > 0) {
    lines.push(
      `parity:api:build: ${argsRows.length} of those row(s) are kind: "args" and ` +
        `${dryRun ? "would" : "did"} NOT migrate — this is the call-SET migrator. They are ` +
        "LIVE rows, not stale ones: the call-ARGUMENT dimension converges with " +
        "`@missingRailsArgs` receipts (see `pnpm parity:api:calls:args`).",
    );
  }
  return lines;
}

async function main(argv: string[]): Promise<number> {
  const pkgIdx = argv.indexOf("--package");
  const pkg = pkgIdx !== -1 ? argv[pkgIdx + 1] : undefined;
  const fileIdx = argv.indexOf("--file");
  const onlyFile = fileIdx !== -1 ? argv[fileIdx + 1] : undefined;
  const onlyCall = new Set(argv.flatMap((a, i) => (a === "--call" ? [argv[i + 1]] : [])));
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
  // Call-SET rows only: `keyOf` does not carry `kind`, so an args-kind row
  // sharing a key would otherwise donate its reason to a `@missingRailsCall`
  // receipt and then be dropped from the shard by the migration below.
  const callRows = rowsOfKind(baseline, "calls");
  const reasons = new Map<string, string>();
  for (const e of callRows) {
    reasons.set(keyOf(e), e.reason);
  }

  const byFile = buildExpectations(artifact, pkg, onlyFile);
  // Grouped by DECLARING file, not by the row's `tsFile`: one row-file can
  // group several declaring files, and handing each of them the row-file's
  // whole stale set would retire a tag in a file compare.ts never reported it
  // for.
  const staleByDeclFile = new Map<string, Set<string>>();
  const staleDeclFilesByFile = new Map<string, Set<string>>();
  for (const t of artifact.staleTags ?? []) {
    if (t.package !== pkg) continue;
    if (onlyFile && t.tsFile !== onlyFile) continue;
    const declFile = t.tsDeclFile ?? t.tsFile;
    const set =
      staleByDeclFile.get(declFile) ?? staleByDeclFile.set(declFile, new Set()).get(declFile)!;
    set.add(staleTagKey(t.tsClass ?? "", t.tsName, t.call));
    // A file whose only business this run is a stale tag has no expectation to
    // put it in `byFile` (nor its declaring file in `groupByDeclFile`), and
    // would otherwise never be opened.
    if (!byFile.has(t.tsFile)) byFile.set(t.tsFile, new Map());
    const files =
      staleDeclFilesByFile.get(t.tsFile) ??
      staleDeclFilesByFile.set(t.tsFile, new Set()).get(t.tsFile)!;
    files.add(declFile);
  }

  let skipped = 0;
  const migrated = new Set<string>();
  const srcDir = packageSrcDir(pkg);
  // Two baseline files can reconcile into ONE declaration file, so the text is
  // threaded through in memory and written once at the end: re-reading it for
  // the second pass would drop the first pass's edits.
  const texts = new Map<string, string>();
  const rewritten = new Set<string>();
  for (const [tsFile, expectations] of [...byFile.entries()].sort()) {
    for (const [declFile, group] of [
      ...groupByDeclFile(tsFile, expectations, staleDeclFilesByFile.get(tsFile) ?? []).entries(),
    ].sort()) {
      const abs = path.join(srcDir, declFile);
      let text = texts.get(abs);
      if (text === undefined) {
        try {
          text = await fs.readFile(abs, "utf-8");
        } catch {
          continue; // expected TS file not ported yet — stub phase, not this slice
        }
        texts.set(abs, text);
      }
      let reconciled;
      try {
        reconciled = reconcileFileText(
          // Repo-relative so an unjustified-tag error names a path the operator
          // can open; the artifact key stays `tsFile`.
          path.relative(ROOT_DIR, abs),
          text,
          group,
          (rubyName, call) =>
            reasons.get(keyOf({ package: pkg, tsFile, rubyName, call })) ?? DEFAULT_TAG_REASON,
          onlyCall.size > 0 ? onlyCall : undefined,
          staleByDeclFile.get(declFile),
        );
      } catch (err) {
        console.error(`parity:api:build: ${err instanceof Error ? err.message : String(err)}`);
        return 1;
      }
      const {
        text: next,
        harvested,
        preserved,
        tagged,
        unmatched,
        skipped: fileSkipped,
      } = reconciled;
      skipped += fileSkipped.length;
      for (const t of tagged) migrated.add(keyOf({ package: pkg, tsFile, ...t }));
      for (const h of harvested) {
        console.log(
          `DROPPED ${TAG} on ${declFile} ${h.tsName} for \`${h.entry.call}\` — the call is no ` +
            `longer flagged there, so its receipt is retired. Reason it carried: ${h.entry.reason}`,
        );
      }
      for (const kept of preserved) {
        console.log(
          `preserved ${TAG} on ${declFile} ${kept.tsName} for \`${kept.entry.call}\` — no ` +
            "expectation for that declaration in the artifact; the tag is left exactly as written.",
        );
      }
      if (unmatched.length > 0) {
        console.log(
          `unmatched (${declFile}): ${unmatched.join(", ")} — no body-bearing declaration`,
        );
      }
      if (next !== null) {
        texts.set(abs, next);
        rewritten.add(abs);
      }
    }
  }
  const changed = rewritten.size;
  for (const abs of [...rewritten].sort()) {
    if (dryRun) console.log(`would update ${path.relative(ROOT_DIR, abs)}`);
    else await fs.writeFile(abs, texts.get(abs)!);
  }
  const remaining = baseline.filter(
    (e) => (e.kind ?? "calls") !== "calls" || !migrated.has(keyOf(e)),
  );
  const droppedEntries = callRows.filter((e) => migrated.has(keyOf(e)));
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
  for (const line of migrationSummary(
    scopedRows(baseline, pkg, onlyFile),
    dropped,
    dryRun,
  )) {
    console.log(line);
  }
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
