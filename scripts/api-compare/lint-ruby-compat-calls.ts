#!/usr/bin/env npx tsx
/**
 * Ratcheting gate for the Ruby-core → ruby-compat call dimension (RFC 0129).
 *
 * `report-ruby-compat.ts` measures the whole population read-only; this gates
 * the enrolled slice of it. A row is a call-mismatch the comparator already
 * flags whose Ruby call resolves to a `@blazetrails/ruby-compat` export
 * (`scripts/parity/ruby-compat.ts`): the ported body hand-rolled a Ruby
 * primitive instead of importing its port. It converges by importing the
 * export — never by baselining, which is the fallback and costs a reviewed
 * one-line `reason` on the row.
 *
 * Same only-shrink contract as the call-set (RFC 0047) and call-argument
 * (RFC 0095) gates, over the SAME `call-mismatches-exclude/` shards: rows carry
 * `kind: "rubyCompat"` and each gate reads only its own kind, so a row of one
 * dimension going stale never reds another's. CI fails on a NEW row absent from
 * the baseline (the ratchet) and on a STALE baselined row that no longer flags
 * (only-shrink — delete the converged row by hand).
 *
 * There is no `--write`. The other two gates carry a reseed for the population
 * they were seeded from; this one was never seeded — {@link ENROLLED_PACKAGES}
 * joins a package at zero — so a reseed could only ever widen it.
 *
 * Usage: no flag gates (CI); `--no-regen` gates the artifact already on disk.
 *
 * Hard rules: no node:* imports, no process.* in the library surface (the CLI
 * entry guard is the sole exception, matching lint-call-args.ts), async fs.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { OUTPUT_DIR, ROOT_DIR } from "./config.js";
import {
  type Artifact,
  type ExcludeEntry,
  missingScope,
  rowsOfKind,
} from "./call-mismatch-baseline.js";
import { listJsonFiles } from "./baseline-json.js";
import { BASELINE_DIR } from "./lint-call-mismatches.js";
import { type RubyCompatKey, reverseRows } from "./report-ruby-compat.js";
import {
  NO_REGEN_FLAG,
  artifactIsStale,
  regenerateArtifact,
  shouldRegenerate,
  staleArtifactMessage,
} from "./gate-regen.js";

const ARTIFACT_PATH = path.join(OUTPUT_DIR, "call-mismatches.json");

/**
 * The packages this gate covers, and the ONLY dimension of it that moves.
 *
 * ONLY-GROW, on the same contract as `GATED_PACKAGES`
 * (`extra-surface-mark.ts`) and the RFC 0121 `unbacked-internal-needs-receipt`
 * enrollment set: a package joins once its rows are converged, and **no package
 * is ever removed to turn a red run green.** Gating the unconverged rest would
 * seed a red across nine packages and block every unrelated PR, which is why
 * enrollment is per-package work rather than one flip.
 *
 * `i18n` and `activesupport` go first because they are the smallest and their
 * populations were already converged by `ruby-compat-symbol-conventions` and
 * `move-regexp-escape-to-ruby-compat` — i18n at zero rows, activesupport at the
 * one `inflector/inflections.ts` `to_regex` row this story converges. The rest
 * follow under `enroll-call-mapping-remaining-packages`.
 */
export const ENROLLED_PACKAGES: readonly string[] = ["activesupport", "i18n"];

/** Keyed like the shared shards, plus the export the body should have called —
 *  which is not part of the identity, since one call resolves to one export. */
export function keyOf(k: {
  package: string;
  tsFile: string;
  rubyName: string;
  call: string;
}): string {
  return `${k.package} ${k.tsFile} ${k.rubyName} ${k.call}`;
}

export function renderKey(k: RubyCompatKey): string {
  return `${k.package}  ${k.tsFile}  ${k.rubyName}  ${k.call} → ${k.tsExport}`;
}

const enrolled = <T extends { package: string }>(rows: T[]): T[] =>
  rows.filter((r) => ENROLLED_PACKAGES.includes(r.package));

/** This gate's rows — the `kind: "rubyCompat"` half of the shared shards,
 *  narrowed to the enrolled packages. @internal */
export async function loadBaseline(dir: string = BASELINE_DIR): Promise<ExcludeEntry[]> {
  const merged: ExcludeEntry[] = [];
  for (const f of (await listJsonFiles(dir)).sort()) {
    merged.push(...(JSON.parse(await fs.readFile(f, "utf-8")) as ExcludeEntry[]));
  }
  return enrolled(rowsOfKind(merged, "rubyCompat"));
}

export interface DiffResult {
  added: RubyCompatKey[];
  stale: ExcludeEntry[];
}

export function diff(current: RubyCompatKey[], baseline: ExcludeEntry[]): DiffResult {
  const currentKeys = new Set(current.map(keyOf));
  const baselineKeys = new Set(baseline.map(keyOf));
  return {
    added: current.filter((k) => !baselineKeys.has(keyOf(k))),
    stale: baseline.filter((e) => !currentKeys.has(keyOf(e))),
  };
}

export async function main(): Promise<number> {
  const artifact = JSON.parse(await fs.readFile(ARTIFACT_PATH, "utf-8")) as Artifact;

  // Determinism guard (RFC 0044), shared with the other two gates: an artifact
  // covering fewer packages than CI must not pass a gate.
  const absent = missingScope({ packages: artifact.packages, mismatches: [] });
  if (absent.length > 0) {
    console.error(
      `\nruby-compat call ratchet: artifact compared a PARTIAL scope — missing ` +
        `${absent.length} package(s): ${absent.join(", ")}.\n` +
        "Regenerate the full surface:\n  API_COMPARE_FORCE=1 pnpm parity:api --calls\n",
    );
    return 1;
  }

  const current = enrolled(reverseRows(artifact));
  const baseline = await loadBaseline();
  const { added, stale } = diff(current, baseline);

  if (added.length === 0 && stale.length === 0) {
    console.log(
      `ruby-compat call ratchet: OK (${ENROLLED_PACKAGES.length} enrolled package(s), ` +
        `${baseline.length} baselined row(s))`,
    );
    return 0;
  }

  if (added.length > 0) {
    console.error(`\nruby-compat call ratchet: ${added.length} NEW unconverged row(s).`);
    console.error(
      "A ported TS body hand-rolls a Ruby primitive `@blazetrails/ruby-compat` already " +
        "exports. Import the export — or, if the deviation is justified, add the row " +
        '(with a one-line reason, `kind: "rubyCompat"`) to its per-source baseline file ' +
        `under\n  ${path.relative(ROOT_DIR, BASELINE_DIR)}/  (<package>/<tsFile .ts→.json>).\n`,
    );
    for (const k of added) console.error(`  + ${renderKey(k)}`);
  }

  if (stale.length > 0) {
    console.error(
      `\nruby-compat call ratchet: ${stale.length} STALE baseline entr(ies) that no longer flag.`,
    );
    console.error("The baseline only shrinks. Delete the converged row(s) by hand.\n");
    for (const e of stale) console.error(`  - ${keyOf(e)}`);
  }

  return 1;
}

async function runAsScript(): Promise<void> {
  const self = fileURLToPath(import.meta.url);
  if (path.resolve(self) !== (process.argv[1] ? path.resolve(process.argv[1]) : "")) return;
  const argv = process.argv.slice(2);
  if (shouldRegenerate(argv, process.env)) {
    console.log("Regenerating output/call-mismatches.json (compare.ts --calls)…");
    try {
      await regenerateArtifact(process.env, ["--calls"]);
    } catch (e) {
      console.error(
        `\nruby-compat call ratchet: could not regenerate the artifact: ${(e as Error).message}\n` +
          `Re-run with ${NO_REGEN_FLAG} to gate against the artifact already on disk.\n`,
      );
      process.exit(2);
    }
  } else if (await artifactIsStale(ARTIFACT_PATH)) {
    console.error(staleArtifactMessage("ruby-compat call ratchet", ARTIFACT_PATH));
    process.exit(2);
  }
  process.exit(await main());
}

void runAsScript();
