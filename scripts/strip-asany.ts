#!/usr/bin/env tsx
/**
 * Strip-and-recompile codemod: removes gratuitous `as any` casts.
 *
 * Many AR test casts have the shape `(expr as any).member` where `member`
 * is already typed (`.id`, `.name`, a declared column, a `Base` method), so
 * the cast suppresses nothing. `eslint --fix` cannot remove `as any`, so we
 * strip each candidate and recompile: the removal is kept iff `tsc --build`
 * still reports zero errors, otherwise that single removal is reverted.
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
 *   pnpm tsx scripts/strip-asany.ts <file>...           # apply, recompiling per cast
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

  return spans;
}

/** Apply a single cast-span removal to `text`, returning the new text. */
export function removeCast(text: string, span: CastSpan): string {
  return text.slice(0, span.start) + span.replacement + text.slice(span.end);
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
 * Strip casts from one file, recompiling after each tentative removal and
 * reverting any removal that introduces a type error. Candidates are applied
 * from the end of the file backwards so kept edits never shift the offsets of
 * candidates not yet processed.
 */
export async function stripFile(file: string): Promise<StripResult> {
  const original = await readFile(file, "utf8");
  // Descending by start so applied edits sit after the pending ones.
  const candidates = findCandidateCasts(original).sort((a, b) => b.start - a.start);

  let working = original;
  let removed = 0;
  let kept = 0;

  for (const span of candidates) {
    const trial = removeCast(working, span);
    await writeFile(file, trial);
    if (await typecheckPasses()) {
      working = trial;
      removed += 1;
    } else {
      kept += 1;
    }
  }

  await writeFile(file, working);
  return { file, candidates: candidates.length, removed, kept };
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
