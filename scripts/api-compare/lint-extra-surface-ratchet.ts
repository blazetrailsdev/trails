#!/usr/bin/env npx tsx
/**
 * CI gate for the extra-surface ratchet (RFC 0117). Fails on:
 *
 *   - GROWTH — a gated package's `novel` or `total` extra-surface count rose
 *     above its committed mark in extra-surface-mark.json. The fix is to
 *     remove the invented surface (delete it, fold it into the ported method,
 *     or — for a genuine TypeScript shortcoming — tag it `@noRailsEquivalent
 *     <reason>`), never to raise the mark;
 *   - UNMEASURED — a gated package the run never reported, which would
 *     otherwise disarm the gate silently.
 *
 * A mark left ABOVE the current measurement is reported, not failed: the mark
 * only shrinks, so narrow it in the same PR that converged the surface with
 *
 *   pnpm parity:api:extra:tighten
 *
 * which writes each dimension DOWN to the measurement and never up. There is
 * no reseed — the same no-reseed rule the call gates carry, for the same
 * reason: a whole-file rewrite buries the one number you meant to retire.
 *
 * Usage:
 *   pnpm tsx scripts/api-compare/lint-extra-surface-ratchet.ts            # gate (CI)
 *   pnpm tsx scripts/api-compare/lint-extra-surface-ratchet.ts --tighten  # narrow marks
 *
 * Run `pnpm parity:api` first so output/{rails,ts}-api.json are fresh.
 *
 * Hard rules: no node:* imports, no process.* in the library surface (the CLI
 * entry guard is the sole exception), async fs only, no third-party runtime deps.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { OUTPUT_DIR, ROOT_DIR } from "./config.js";
import type { ApiManifest } from "@blazetrails/parity/types";
import { buildReport } from "./extra-surface.js";
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
} from "./extra-surface-mark.js";

async function readManifest(name: string): Promise<ApiManifest> {
  return JSON.parse(await fs.readFile(path.join(OUTPUT_DIR, name), "utf-8")) as ApiManifest;
}

async function main(tighten: boolean): Promise<number> {
  const ruby = await readManifest("rails-api.json");
  const ts = await readManifest("ts-api.json");
  const report = buildReport(ruby, ts, {
    filterPkg: null,
    excludeGlobs: [],
    novelOnly: false,
    topN: 0,
  });
  const current = measure(report.packages);

  const absent = unmeasuredPackages(current);
  if (absent.length > 0) {
    console.error(
      `\nextra-surface gate: ${absent.length} gated package(s) not measured: ${absent.join(", ")}.\n` +
        "The manifests cover fewer packages than CI does, so the gate would pass on\n" +
        "surface it never looked at. Regenerate the full surface:\n" +
        "  API_COMPARE_FORCE=1 pnpm parity:api\n",
    );
    return 1;
  }

  const marks = await loadMarks();

  const unmarked = unmarkedPackages(marks);
  if (unmarked.length > 0) {
    console.error(
      `\nextra-surface gate: ${unmarked.length} gated package(s) carry no committed mark: ${unmarked.join(", ")}.\n` +
        "A gated package with no mark is skipped by every comparison, so the gate\n" +
        "would pass on it silently rather than half-enabling. Seed it from a clean\n" +
        "measurement before gating:\n" +
        "  pnpm parity:api:extra --package <pkg>\n",
    );
    return 1;
  }

  const grew = exceedances(marks, current);
  const stale = staleMarks(marks, current);

  if (tighten) {
    if (grew.length > 0) {
      console.error(
        "\nextra-surface gate: refusing to tighten while the mark is EXCEEDED — " +
          "`--tighten` only narrows.\nRemove the added surface first, then re-run.\n",
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
    console.error(
      `\nextra-surface gate: ${grew.length} dimension(s) GREW past the committed mark.`,
    );
    console.error(
      "Extra surface is public TS with no Ruby counterpart. Delete it, fold it into\n" +
        "the ported method, or — only for a genuine TypeScript shortcoming — tag it\n" +
        "`@noRailsEquivalent <PERMANENT|CONVERGEABLE> <reason>`. Do NOT raise the mark.\n" +
        "See the offending names with:\n" +
        "  pnpm parity:api:extra --package <pkg> --novel-only\n",
    );
    for (const v of grew) {
      console.error(`  + ${v.package}  ${v.dimension}: mark ${v.mark} → current ${v.current}`);
    }
    return 1;
  }

  for (const v of stale) {
    console.log(
      `extra-surface gate: ${v.package} ${v.dimension} mark ${v.mark} is above the ` +
        `current ${v.current} — narrow it with \`pnpm parity:api:extra:tighten\`.`,
    );
  }
  const summary = Object.entries(current)
    .map(
      ([name, m]) =>
        `${name} novel ${m.novel}/${marks[name].novel}, total ${m.total}/${marks[name].total}`,
    )
    .join("; ");
  console.log(`extra-surface gate: OK (${summary})`);
  return 0;
}

async function runAsScript(): Promise<void> {
  const self = fileURLToPath(import.meta.url);
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
  if (path.resolve(self) !== invoked) return;
  const code = await main(process.argv.slice(2).includes("--tighten"));
  process.exit(code);
}

void runAsScript();
