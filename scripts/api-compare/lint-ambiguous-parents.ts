#!/usr/bin/env npx tsx
/**
 * CI gate for the ambiguous-parent ratchet (RFC 0126). Fails when a package's
 * unresolved inheritance-edge count rises above its committed mark. The fix is
 * to make `extract-ts-api.ts` record a declaring file for the edge, never to
 * raise the mark; a mark left ABOVE the measurement is reported, not failed —
 * narrow it in the same PR with `--tighten`, which writes DOWN and never up.
 *
 * Usage:
 *   pnpm tsx scripts/api-compare/lint-ambiguous-parents.ts            # gate
 *   pnpm tsx scripts/api-compare/lint-ambiguous-parents.ts --tighten  # narrow
 *
 * Run `pnpm parity:api` first so output/ambiguous-parents.json is fresh.
 *
 * Hard rules: no node:* imports, async fs only, no third-party runtime deps.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { serializeBaseline } from "./baseline-json.js";
import { OUTPUT_DIR, ROOT_DIR, SCRIPT_DIR } from "./config.js";

export const MARK_PATH = path.join(SCRIPT_DIR, "ambiguous-parent-mark.json");

/** Ambiguous parent names per package, as the artifact carries them. */
export type AmbiguousParentCounts = Record<string, number>;

export interface MarkViolation {
  package: string;
  mark: number;
  current: number;
}

/** Every package that grew past its mark. Empty means the gate passes. A
 *  package with no committed mark is held to zero: a new one appearing is
 *  exactly the silent growth this gate exists to catch. */
export function exceedances(
  marks: AmbiguousParentCounts,
  current: AmbiguousParentCounts,
): MarkViolation[] {
  const out: MarkViolation[] = [];
  for (const [pkg, count] of Object.entries(current)) {
    const mark = marks[pkg] ?? 0;
    if (count > mark) out.push({ package: pkg, mark, current: count });
  }
  return out;
}

/** Marks sitting ABOVE the measurement. Not a failure — the gate only forbids
 *  growth — but reported so a converged PR narrows its mark. */
export function staleMarks(
  marks: AmbiguousParentCounts,
  current: AmbiguousParentCounts,
): MarkViolation[] {
  const out: MarkViolation[] = [];
  for (const [pkg, mark] of Object.entries(marks)) {
    const count = current[pkg] ?? 0;
    if (count < mark) out.push({ package: pkg, mark, current: count });
  }
  return out;
}

/** Write each mark DOWN to `current`. Only-shrink by construction: a package
 *  that grew keeps its committed value, so `--tighten` can never launder a
 *  regression into the mark the way a reseed would. */
export function tightened(
  marks: AmbiguousParentCounts,
  current: AmbiguousParentCounts,
): AmbiguousParentCounts {
  const next: AmbiguousParentCounts = {};
  for (const pkg of Object.keys(marks).sort()) {
    const narrowed = Math.min(marks[pkg], current[pkg] ?? 0);
    if (narrowed > 0) next[pkg] = narrowed;
  }
  return next;
}

export async function loadMarks(): Promise<AmbiguousParentCounts> {
  return JSON.parse(await fs.readFile(MARK_PATH, "utf-8")) as AmbiguousParentCounts;
}

export async function writeMarks(marks: AmbiguousParentCounts): Promise<void> {
  await fs.writeFile(MARK_PATH, serializeBaseline(marks));
}

async function main(tighten: boolean): Promise<number> {
  const artifact = path.join(OUTPUT_DIR, "ambiguous-parents.json");
  const current = JSON.parse(await fs.readFile(artifact, "utf-8")) as AmbiguousParentCounts;
  const marks = await loadMarks();
  const grew = exceedances(marks, current);
  const stale = staleMarks(marks, current);

  if (tighten) {
    if (grew.length > 0) {
      console.error(
        "\nambiguous-parent gate: refusing to tighten while the mark is EXCEEDED — " +
          "`--tighten` only narrows.\n",
      );
      return 1;
    }
    await writeMarks(tightened(marks, current));
    console.log(
      `Wrote ${path.relative(ROOT_DIR, MARK_PATH)}: narrowed ${stale.length} package(s).`,
    );
    return 0;
  }

  if (grew.length > 0) {
    console.error(
      `\nambiguous-parent gate: ${grew.length} package(s) GREW past the committed mark.\n` +
        "An unresolved parent drops the inheritance edge entirely, so the methods trails\n" +
        "answers through it read as missing. Record the edge's declaring file in\n" +
        "extract-ts-api.ts rather than raising the mark.\n",
    );
    for (const v of grew) console.error(`  + ${v.package}: mark ${v.mark} → current ${v.current}`);
    return 1;
  }

  for (const v of stale) {
    console.log(
      `ambiguous-parent gate: ${v.package} mark ${v.mark} is above the current ` +
        `${v.current} — narrow it with \`pnpm parity:api:parents:tighten\`.`,
    );
  }
  console.log("ambiguous-parent gate: OK");
  return 0;
}

async function runAsScript(): Promise<void> {
  const self = fileURLToPath(import.meta.url);
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
  if (path.resolve(self) !== invoked) return;
  process.exit(await main(process.argv.slice(2).includes("--tighten")));
}

void runAsScript();
