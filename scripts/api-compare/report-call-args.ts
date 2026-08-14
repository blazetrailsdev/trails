#!/usr/bin/env npx tsx
/**
 * Read-only grouping of the call-argument artifact (RFC 0095), mirroring
 * `lint-call-mismatches.ts --report`.
 *
 *   pnpm tsx scripts/api-compare/report-call-args.ts --report [--top=N]
 *
 * Reports output/call-arg-mismatches.json, which compare.ts writes only under
 * `--calls` (see its callsGate block). It stays a `report-*` script — one that
 * never fails a build — even though the dimension now has a ratchet
 * (lint-call-args.ts): the gate covers `shape` rows only, so this is where the
 * `naming` half of the population is visible. {@link renderReport} is what
 * `lint-call-args.ts --report` renders, so the two spellings cannot drift.
 */
import * as path from "path";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { OUTPUT_DIR, ROOT_DIR } from "./config.js";
import type { CallArgArtifact } from "./call-args-baseline.js";
import { parseTop, section, tally } from "./lint-call-mismatches.js";
import { classifyRow, NAMING_CLASSES } from "./naming-taxonomy.js";

export { parseTop };

const ARTIFACT_PATH = path.join(OUTPUT_DIR, "call-arg-mismatches.json");

/**
 * The grouped report. The `naming` half is what the gate flip plans to
 * baseline, so it is reported by CLASS and by whether a rename can close it at
 * all (RFC 0096; naming-taxonomy.ts has why one shared reason per permanent
 * class beats one bespoke sentence per row, and why the rest is never
 * baselined).
 */
export function renderReport(artifact: CallArgArtifact, top: number): string {
  const rows = artifact.mismatches;
  const files = new Set(rows.map((r) => `${r.package} ${r.tsFile}`)).size;
  const naming = rows.filter((r) => r.class === "naming");
  const permanent = new Set(NAMING_CLASSES.filter((c) => c.permanent).map((c) => c.name));
  const namingLabel = (r: (typeof rows)[number]): string => {
    const cls = classifyRow(r.rubyArgs, r.tsArgs);
    return `${cls} (${permanent.has(cls) ? "permanent" : "burndown"})`;
  };
  return [
    `call-arg-mismatches report: ${rows.length} row(s) across ${files} file(s), ` +
      `${artifact.compared} call site(s) compared`,
    section(
      "By package",
      tally(rows, (r) => r.package),
    ),
    section(
      "By file",
      tally(rows, (r) => `${r.package}/${r.tsFile}`),
      top,
    ),
    section("Skipped (uncomparable) sites by reason", Object.entries(artifact.skipped ?? {})),
    section(
      "By class",
      tally(rows, (r) => r.class),
    ),
    section(
      "By Ruby call name",
      tally(rows, (r) => r.call),
      top,
    ),
    section(
      "Naming residue by class",
      tally(naming, (r) => namingLabel(r)),
    ),
    section(
      "Naming residue by package",
      tally(naming, (r) => `${r.package}  ${namingLabel(r).replace(/^.*\(|\)$/g, "")}`),
      top,
    ),
  ].join("\n");
}

async function reportMain(top: number): Promise<number> {
  let artifact: CallArgArtifact;
  try {
    artifact = JSON.parse(await readFile(ARTIFACT_PATH, "utf8")) as CallArgArtifact;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    console.error(
      `call-arg-mismatches report: ${path.relative(ROOT_DIR, ARTIFACT_PATH)} is missing — ` +
        "run `pnpm parity:api --calls` first.",
    );
    return 2;
  }
  console.log(renderReport(artifact, top));
  return 0;
}

async function runAsScript(): Promise<void> {
  const self = fileURLToPath(import.meta.url);
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
  if (path.resolve(self) !== invoked) return;
  const argv = process.argv.slice(2);
  if (!argv.includes("--report")) {
    console.error("call-arg-mismatches: the only mode is `--report` (RFC 0095 is advisory).");
    process.exit(2);
  }
  let top: number;
  try {
    top = parseTop(argv, 20);
  } catch (e) {
    console.error(`call-arg-mismatches report: ${(e as Error).message}`);
    process.exit(2);
  }
  process.exit(await reportMain(top));
}

void runAsScript();
