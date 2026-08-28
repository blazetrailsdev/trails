#!/usr/bin/env npx tsx
/**
 * CI gate for the parameter-name ratchet (RFC 0126). Fails on:
 *
 *   - GROWTH — a gated package's param-name row count rose above its committed
 *     mark, in the package total or in any one Ruby file. The fix is to spell
 *     the parameter the way Rails does (camelCased per
 *     docs/ruby-ts-conventions.md), never to raise the mark;
 *   - UNMEASURED — a gated package the run never reported, which would
 *     otherwise disarm the gate silently.
 *
 * A mark left ABOVE the measurement is reported, not failed: narrow it in the
 * same PR that converged the rename with `pnpm parity:api:params:tighten`,
 * which writes each dimension DOWN and never up. There is no reseed — the same
 * rule the call baselines carry, for the same reason: a whole-file rewrite
 * buries the one row you meant to retire.
 *
 * Usage:
 *   pnpm tsx scripts/api-compare/lint-param-names.ts            # gate (CI)
 *   pnpm tsx scripts/api-compare/lint-param-names.ts --tighten  # narrow marks
 *
 * Run `pnpm parity:api` first so output/param-name-mismatches.json is fresh.
 *
 * Hard rules: no node:* imports, async fs only, no third-party runtime deps.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { OUTPUT_DIR, ROOT_DIR } from "./config.js";
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
  type MeasuredRow,
} from "./param-name-mark.js";

interface ParamNameArtifact {
  packages: string[];
  mismatches: MeasuredRow[];
}

async function readArtifact(): Promise<ParamNameArtifact> {
  const file = path.join(OUTPUT_DIR, "param-name-mismatches.json");
  return JSON.parse(await fs.readFile(file, "utf-8")) as ParamNameArtifact;
}

async function main(tighten: boolean): Promise<number> {
  const artifact = await readArtifact();

  const absent = unmeasuredPackages(artifact.packages);
  if (absent.length > 0) {
    console.error(
      `\nparam-name gate: ${absent.length} gated package(s) not measured: ${absent.join(", ")}.\n` +
        "The artifact covers fewer packages than CI does, so the gate would pass on\n" +
        "signatures it never looked at. Regenerate the full surface:\n" +
        "  API_COMPARE_FORCE=1 pnpm parity:api\n",
    );
    return 1;
  }

  const marks = await loadMarks();
  const unmarked = unmarkedPackages(marks);
  if (unmarked.length > 0) {
    console.error(
      `\nparam-name gate: ${unmarked.length} gated package(s) carry no committed mark: ${unmarked.join(", ")}.\n` +
        "A gated package with no mark is skipped by every comparison, so the gate\n" +
        "would pass on it silently rather than half-enabling. Seed it from a clean\n" +
        "measurement before gating:\n" +
        "  pnpm parity:api --package <pkg> --params\n",
    );
    return 1;
  }

  const current = measure(artifact.mismatches);
  const grew = exceedances(marks, current);
  const stale = staleMarks(marks, current);

  if (tighten) {
    if (grew.length > 0) {
      console.error(
        "\nparam-name gate: refusing to tighten while the mark is EXCEEDED — " +
          "`--tighten` only narrows.\nRename the parameters back to Rails' spelling first, then re-run.\n",
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
    console.error(`\nparam-name gate: ${grew.length} dimension(s) GREW past the committed mark.`);
    console.error(
      "A parameter keeps the Rails identifier, camelCased (CLAUDE.md, " +
        "docs/ruby-ts-conventions.md).\nRename it rather than raising the mark. " +
        "See the offending positions with:\n" +
        "  pnpm parity:api --package <pkg> --params\n",
    );
    for (const v of grew) {
      console.error(`  + ${v.package}  ${v.dimension}: mark ${v.mark} → current ${v.current}`);
    }
    return 1;
  }

  for (const v of stale) {
    console.log(
      `param-name gate: ${v.package} ${v.dimension} mark ${v.mark} is above the ` +
        `current ${v.current} — narrow it with \`pnpm parity:api:params:tighten\`.`,
    );
  }
  const summary = Object.entries(current)
    .map(([name, m]) => `${name} ${m.total}/${marks[name].total}`)
    .join("; ");
  console.log(`param-name gate: OK (${summary})`);
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
