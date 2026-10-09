#!/usr/bin/env npx tsx
/**
 * CI gate for the missing-`throw` arm ratchet (RFC 0113). Fails on:
 *
 *   - GROWTH — a gated package's missing-`throw` row count rose above its
 *     committed mark, in the package total or in any one TS file. The fix is to
 *     raise what Rails raises, where Rails raises it, never to raise the mark;
 *   - UNMEASURED — a gated package the run never reported, which would
 *     otherwise disarm the gate silently;
 *   - STALE — a mark left ABOVE the measurement. Narrow it in the same PR that
 *     restored the raise with `pnpm parity:api:arms:throws:tighten`, which
 *     writes each dimension DOWN and never up. There is no reseed — the same
 *     rule the call baselines carry, for the same reason: a whole-file rewrite
 *     buries the one row you meant to retire.
 *
 * The other four arm tokens — `if`, `loop`, `try`, `rescue` — are report-only
 * and stay that way: `if` alone is 1,891 of the 2,141 rows and measured 70%
 * non-real. See arm-throw-mark.ts for the stratified noise-floor read this gate
 * rests on, and docs/infrastructure/arm-mismatch-noise-floor.md for the record.
 *
 * Usage:
 *   pnpm tsx scripts/api-compare/lint-arm-throws.ts            # gate (CI)
 *   pnpm tsx scripts/api-compare/lint-arm-throws.ts --tighten  # narrow marks
 *
 * Run `pnpm parity:api --calls` first so output/call-skeletons.json is fresh.
 *
 * Hard rules: no node:* imports, async fs only, no third-party runtime deps.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { OUTPUT_DIR, ROOT_DIR } from "./config.js";
import { scopeMismatch, scopeOf, scopedMarks } from "./scope.js";
import { compareArms, staleArmReceipts, type SkeletonArtifact } from "./report-arms.js";
import { TAG as INVENTED_ARM_TAG } from "./invented-arm-tags.js";
import { staleMarkFailure } from "./param-name-mark.js";
import {
  MARK_PATH,
  exceedances,
  loadMarks,
  measure,
  staleMarks,
  tightened,
  unmarkedPackages,
  unmeasuredPackages,
  writeMarks,
} from "./arm-throw-mark.js";

async function readArtifact(): Promise<SkeletonArtifact> {
  const file = path.join(OUTPUT_DIR, "call-skeletons.json");
  return JSON.parse(await fs.readFile(file, "utf-8")) as SkeletonArtifact;
}

async function main(tighten: boolean, scope: string | null): Promise<number> {
  const artifact = await readArtifact();

  if (scope !== null) {
    const mismatch = scopeMismatch("arm-throw gate", artifact.packages, scope);
    if (mismatch !== null) {
      console.error(mismatch);
      return 1;
    }
  }
  const absent = scope === null ? unmeasuredPackages(artifact.packages) : [];
  if (absent.length > 0) {
    console.error(
      `\narm-throw gate: gated package(s) not measured: ${absent.join(", ")}.\n` +
        "The gate would pass on bodies it never looked at. Regenerate:\n" +
        "  API_COMPARE_FORCE=1 pnpm parity:api --calls\n",
    );
    return 1;
  }

  const staleReceipts = [
    ...artifact.skeletons.flatMap((s) =>
      staleArmReceipts(s).map((token) => `${s.package}/${s.tsFile} ${s.tsName}: ${token}`),
    ),
    ...(artifact.uncomparedArmTags ?? []).map(
      (t) => `${t.package}/${t.tsFile} ${t.tsName}: ${t.call} (declaration not compared)`,
    ),
  ];
  if (!tighten && staleReceipts.length > 0) {
    console.error(
      `\narm-throw gate: ${staleReceipts.length} STALE ${INVENTED_ARM_TAG} receipt(s).\n` +
        "Each names an arm or call the body no longer adds to Rails'. Delete the tag:\n",
    );
    for (const line of staleReceipts) console.error(`  - ${line}`);
    return 1;
  }

  const committed = await loadMarks();
  const unmarked = unmarkedPackages(committed);
  if (unmarked.length > 0) {
    console.error(
      `\narm-throw gate: gated package(s) carry no committed mark: ${unmarked.join(", ")}.\n` +
        "A gated package with no mark is skipped by every comparison, so gating it\n" +
        "unseeded disarms rather than half-enables.\n",
    );
    return 1;
  }

  const marks = scopedMarks(committed, scope);
  const current = measure(artifact.skeletons.flatMap((s) => compareArms(s) ?? []));
  const grew = exceedances(marks, current);
  const stale = staleMarks(marks, current);

  if (tighten) {
    if (grew.length > 0) {
      console.error(
        "\narm-throw gate: refusing to tighten while the mark is EXCEEDED — " +
          "`--tighten` only narrows.\nRestore the raise first, then re-run.\n",
      );
      return 1;
    }
    await writeMarks(tightened(marks, current));
    console.log(
      `Wrote ${path.relative(ROOT_DIR, MARK_PATH)}: narrowed ${stale.length} dimension(s).`,
    );
    return 0;
  }

  if (grew.length > 0) {
    console.error(`\narm-throw gate: ${grew.length} dimension(s) GREW past the committed mark.`);
    console.error(
      "A Rails body that raises and a port that does not is a real divergence 9 times\n" +
        "in 10 (RFC 0113's stratified noise floor). Raise the same error class, with the\n" +
        "same message, at the same site — never raise the mark:\n" +
        "  pnpm tsx scripts/api-compare/report-arms.ts --report --direction=missing --token=throw\n",
    );
    for (const v of grew) {
      console.error(`  + ${v.package}  ${v.dimension}: mark ${v.mark} → current ${v.current}`);
    }
    return 1;
  }

  const staleFailure = staleMarkFailure("arm-throw gate", "parity:api:arms:throws:tighten", stale);
  if (staleFailure !== null) {
    console.error(staleFailure);
    return 1;
  }
  const summary = Object.entries(current)
    .filter(([, m]) => m.total > 0)
    .map(([name, m]) => `${name} ${m.total}/${marks[name].total}`)
    .join("; ");
  console.log(`arm-throw gate: OK (${summary})`);
  return 0;
}

async function runAsScript(): Promise<void> {
  const self = fileURLToPath(import.meta.url);
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
  if (path.resolve(self) !== invoked) return;
  const argv = process.argv.slice(2);
  const code = await main(argv.includes("--tighten"), scopeOf(argv));
  process.exit(code);
}

void runAsScript();
