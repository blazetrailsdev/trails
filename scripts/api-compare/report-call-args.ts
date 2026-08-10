#!/usr/bin/env npx tsx
/**
 * Read-only grouping of the advisory call-argument artifact (RFC 0095),
 * mirroring `lint-call-mismatches.ts --report`.
 *
 *   pnpm tsx scripts/api-compare/report-call-args.ts --report [--top=N]
 *
 * Reports output/call-arg-mismatches.json, which compare.ts writes only under
 * `--calls` (see its callsGate block). There is no gate and no baseline yet:
 * RFC 0095 lands the artifact advisory-first, and the ratchet
 * (call-mismatches-args-exclude/) arrives with the seeding story. So this is a
 * `report-*` script, not a `lint-*` one — it never fails a build, and the
 * `--report` flag is required so the invocation reads the same as the
 * call-mismatches one it mirrors, and so a future gating mode can take the
 * default.
 */
import * as path from "path";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { OUTPUT_DIR, ROOT_DIR } from "./config.js";
import { parseTop, section, tally } from "./lint-call-mismatches.js";

const ARTIFACT_PATH = path.join(OUTPUT_DIR, "call-arg-mismatches.json");

interface CallArgRow {
  package: string;
  rubyFile: string;
  tsFile: string;
  rubyName: string;
  tsName: string;
  call: string;
  class: string;
  rubyArgs: string[];
  tsArgs: string[];
}

interface Artifact {
  compared: number;
  mismatched: number;
  mismatches: CallArgRow[];
}

export function renderReport(artifact: Artifact, top: number): string {
  const rows = artifact.mismatches;
  const files = new Set(rows.map((r) => `${r.package} ${r.tsFile}`)).size;
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
    section(
      "By class",
      tally(rows, (r) => r.class),
    ),
    section(
      "By Ruby call name",
      tally(rows, (r) => r.call),
      top,
    ),
  ].join("\n");
}

async function reportMain(top: number): Promise<number> {
  let artifact: Artifact;
  try {
    artifact = JSON.parse(await readFile(ARTIFACT_PATH, "utf8")) as Artifact;
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
