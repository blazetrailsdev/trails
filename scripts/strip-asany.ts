#!/usr/bin/env tsx
/**
 * Strip-and-recompile codemod: removes gratuitous `as any` casts.
 *
 * Many AR test casts have the shape `(expr as any).member` where `member`
 * is already typed (`.id`, `.name`, a declared column, a `Base` method), so
 * the cast suppresses nothing. `eslint --fix` cannot remove `as any`, so we
 * strip the candidates and recompile: removals are kept iff `tsc --build`
 * still reports zero errors, otherwise the offending ones are reverted. To
 * avoid an O(casts) rebuild per file, all candidates are stripped and built
 * once; on failure the candidate set is bisected so only the load-bearing
 * casts are isolated and reverted (O(log n) builds for the residual set).
 *
 * Scope (conservative — everything else is left for hand-fix stories):
 *   - Only `as any` whose `any` is the whole cast type (NOT `as any[]` and
 *     NOT other array/terminal casts).
 *   - Only when the cast is immediately consumed as `(expr as any).member`
 *     where `member` does NOT start with `_` (so `(x as any)._private`
 *     reaches are left alone).
 *
 * Each removal is independently verified by recompiling, so even a candidate
 * that slips through the textual scope filter is reverted if it changes the
 * error count. The tree is never left with new type errors.
 *
 * Usage:
 *   pnpm tsx scripts/strip-asany.ts <file>...           # apply, batch-then-bisect recompile
 *   pnpm tsx scripts/strip-asany.ts --dry-run <file>... # list candidates, no writes
 */
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const execFileAsync = promisify(execFile);

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "..");
const TSC_BIN = resolve(ROOT, "node_modules", ".bin", "tsc");
const ROOT_TSCONFIG = resolve(ROOT, "tsconfig.json");

/** A removable `as any` cast, expressed as a single text-span replacement. */
export interface CastSpan {
  /** Offset of the first char to replace. */
  start: number;
  /** Offset just past the last char to replace. */
  end: number;
  /** Text to substitute for `[start, end)`. */
  replacement: string;
  /** The property accessed off the cast, e.g. `id` in `(x as any).id`. */
  member: string;
}

/**
 * Find every `as any` cast in `text` that matches the conservative scope:
 * `(expr as any).member` with a non-underscore `member` and a non-array
 * `any` type. Returns the spans to delete (the ` as any` text), ascending by
 * position. Does not mutate anything.
 */
export function findCandidateCasts(text: string): CastSpan[] {
  const source = ts.createSourceFile(
    "strip-asany-input.ts",
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );
  const spans: CastSpan[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isAsExpression(node) && node.type.kind === ts.SyntaxKind.AnyKeyword) {
      const paren = node.parent;
      if (
        ts.isParenthesizedExpression(paren) &&
        ts.isPropertyAccessExpression(paren.parent) &&
        paren.parent.expression === paren
      ) {
        const member = paren.parent.name.text;
        if (!member.startsWith("_")) {
          const inner = node.expression;
          if (ts.isLeftHandSideExpression(inner) && !ts.isNumericLiteral(inner)) {
            // The inner expression binds at least as tightly as member
            // access, so the wrapping parens are redundant too: rewrite
            // `(foo.bar as any).baz` straight to `foo.bar.baz`. Numeric
            // literals are the one LHS exception — `(5 as any).toFixed`
            // unwrapped to `5.toFixed` lexes `5.` as a float, so keep their
            // parens.
            spans.push({
              start: paren.getStart(source),
              end: paren.getEnd(),
              replacement: inner.getText(source),
              member,
            });
          } else {
            // Parens are load-bearing (e.g. `(await x as any).y`); drop only
            // the ` as any` text and leave the parens in place.
            spans.push({ start: inner.getEnd(), end: node.end, replacement: "", member });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  // Nested casts (e.g. `((foo as any).bar as any).baz`) yield spans where the
  // outer span encloses the inner one. The caller applies edits end-to-start,
  // which only keeps offsets stable for *disjoint* spans — an enclosed edit
  // would mutate text inside a not-yet-applied span and corrupt it. Keep only
  // the outermost of any enclosing pair; idempotency sweeps the inner cast on
  // a subsequent run (its parent cast is gone, so it's no longer nested).
  return spans.filter(
    (span) =>
      !spans.some(
        (other) =>
          other !== span &&
          other.start <= span.start &&
          span.end <= other.end &&
          (other.start < span.start || span.end < other.end),
      ),
  );
}

/** Apply a single cast-span removal to `text`, returning the new text. */
export function removeCast(text: string, span: CastSpan): string {
  return text.slice(0, span.start) + span.replacement + text.slice(span.end);
}

/**
 * Apply a set of disjoint cast removals to `text`. Edits are applied
 * end-to-start so each `removeCast` sees the offsets it was computed against —
 * a kept edit never shifts a pending one. `spans` may be in any order.
 */
export function applyCasts(text: string, spans: readonly CastSpan[]): string {
  let out = text;
  for (const span of [...spans].sort((a, b) => b.start - a.start)) {
    out = removeCast(out, span);
  }
  return out;
}

/** Whole-project typecheck. Returns true iff `tsc --build` exits cleanly. */
async function typecheckPasses(): Promise<boolean> {
  try {
    await execFileAsync(TSC_BIN, ["--build"], { cwd: ROOT });
    return true;
  } catch {
    return false;
  }
}

export interface StripResult {
  file: string;
  candidates: number;
  removed: number;
  kept: number;
}

/**
 * Verifier for a tentative working text: writes the candidate text to `file`
 * and returns whether the whole project still typechecks. Injectable so unit
 * tests can drive the batch/bisect logic without invoking `tsc`.
 */
export type VerifyText = (text: string) => Promise<boolean>;

const tscVerifier =
  (file: string): VerifyText =>
  async (text) => {
    await writeFile(file, text);
    return typecheckPasses();
  };

/**
 * Find the maximal subset of `candidates` (relative to `base`) whose removal
 * keeps the project green, collecting the offending (load-bearing) spans into
 * `kept`. Strategy: try the whole group at once — the common case is "all
 * gratuitous", so that single build keeps everything. On failure, bisect the
 * group: each half is retried as a batch on top of already-accepted removals,
 * recursing down to singletons. A singleton that still fails is load-bearing
 * and stays in `kept`. This is O(1) builds when nothing is load-bearing and
 * O(k·log n) when k casts are, versus O(n) for the per-cast loop.
 *
 * `group` must be ordered descending by offset, matching the old per-cast
 * loop's iteration order. When two casts are individually removable but fail
 * together, greedy keeps whichever it processes *later*; preserving the
 * descending order means batch-bisect reverts the same cast the per-cast loop
 * did (the earlier/lower-offset one), so the kept/removed set is identical.
 */
async function bisectAccept(
  base: string,
  group: readonly CastSpan[],
  accepted: CastSpan[],
  kept: CastSpan[],
  verify: VerifyText,
): Promise<void> {
  if (group.length === 0) return;
  if (await verify(applyCasts(base, [...accepted, ...group]))) {
    accepted.push(...group);
    return;
  }
  if (group.length === 1) {
    kept.push(group[0]);
    return;
  }
  const mid = group.length >> 1;
  await bisectAccept(base, group.slice(0, mid), accepted, kept, verify);
  await bisectAccept(base, group.slice(mid), accepted, kept, verify);
}

/**
 * Strip casts from one file using a batch-then-bisect recompile strategy:
 * remove every candidate and build once; keep all on green, else bisect to
 * isolate and revert only the load-bearing casts, typically ~1 build.
 *
 * Invariants that hold unconditionally: the final accepted set is the exact
 * argument of the last successful `verify`, so the tree is always left green,
 * and `removed + kept === candidates` (the recursion partitions the inputs),
 * so the counts are always accurate.
 *
 * Same-casts-kept/removed equivalence to the old descending per-cast loop
 * holds whenever `verify` is monotone in the removal set — i.e. removing more
 * casts never turns a red build green. That is exactly the property this
 * codemod's scope guarantees: every candidate's accessed member is already
 * typed independent of the cast (see the file header), so removing an `as any`
 * only ever exposes type errors, never suppresses one. Re-adding `as any`
 * widens to `any`, which can only hide errors. The pathological inverse
 * ("batch green but an isolated removal is red") would require a removal to
 * *fix* a type error, which a member-already-typed cast cannot do; under that
 * (out-of-scope) non-monotonicity the green-tree and count invariants above
 * still hold, only the specific span chosen may differ.
 */
export async function stripFile(file: string, verify?: VerifyText): Promise<StripResult> {
  const original = await readFile(file, "utf8");
  // Descending by offset to match the old per-cast loop's iteration order, so
  // a mutually-exclusive pair reverts the same span the per-cast loop did.
  const candidates = findCandidateCasts(original).sort((a, b) => b.start - a.start);
  const check = verify ?? tscVerifier(file);

  const accepted: CastSpan[] = [];
  const kept: CastSpan[] = [];
  await bisectAccept(original, candidates, accepted, kept, check);

  await writeFile(file, applyCasts(original, accepted));
  return { file, candidates: candidates.length, removed: accepted.length, kept: kept.length };
}

async function main(argv: string[]): Promise<void> {
  const dryRun = argv.includes("--dry-run");
  const files = argv.filter((arg) => !arg.startsWith("--"));

  if (files.length === 0) {
    console.error("usage: strip-asany [--dry-run] <file>...");
    process.exitCode = 1;
    return;
  }

  // Establish a clean baseline up front so a pre-existing breakage isn't
  // silently attributed to a cast removal.
  if (!dryRun && !(await typecheckPasses())) {
    console.error("✗ baseline `tsc --build` is not green; aborting.");
    process.exitCode = 1;
    return;
  }

  for (const file of files) {
    if (dryRun) {
      const text = await readFile(file, "utf8");
      const candidates = findCandidateCasts(text);
      console.log(`${file}: ${candidates.length} candidate cast(s)`);
      for (const c of candidates) {
        console.log(`  .${c.member}`);
      }
      continue;
    }
    const result = await stripFile(file);
    console.log(
      `${result.file}: removed ${result.removed}/${result.candidates}` +
        (result.kept > 0 ? ` (kept ${result.kept} — needed for typing)` : ""),
    );
  }
}

// Only run when executed directly, not when imported by the unit test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main(process.argv.slice(2));
}
