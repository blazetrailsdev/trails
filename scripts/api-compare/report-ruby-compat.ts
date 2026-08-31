#!/usr/bin/env npx tsx
/**
 * The Ruby-core → ruby-compat call resolution report (RFC 0129), read-only:
 *
 *   pnpm parity:api:calls:ruby-compat:report [--top=N]
 *
 * It reads both directions of `RUBY_COMPAT_EXPORTS`
 * (scripts/parity/ruby-compat.ts) off the artifacts `compare.ts --calls`
 * already writes:
 *
 *   reverse — every call-mismatch row whose Ruby call resolves to a ruby-compat
 *             export: Rails made the core call and the port did not, so the
 *             body hand-rolled the primitive under a name the table does not
 *             recognise. This is the population an enrollment story burns down.
 *   forward  — every TS declaration that DOES call a ruby-compat export: the
 *             sites the table credits, hence absent from the reverse half.
 *
 * Report-only, and separate from enrollment on purpose: seeding a gate red
 * across nine packages blocks every unrelated PR, so the flip is its own story
 * (`enroll-call-mapping-in-parity-gate`). Nothing here writes a baseline or
 * moves a mark.
 *
 * Hard rules: no node:* imports, no process.*, async fs only.
 */
import * as path from "path";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { OUTPUT_DIR } from "./config.js";
import { type Artifact, type CallMismatchKey, callOf } from "./call-mismatch-baseline.js";
import { parseTop, section, tally } from "./lint-call-mismatches.js";
import { RUBY_COMPAT_EXPORTS, rubyCompatExport } from "../parity/ruby-compat.js";

const ARTIFACT_PATH = path.join(OUTPUT_DIR, "call-mismatches.json");
const TS_API_PATH = path.join(OUTPUT_DIR, "ts-api.json");

/** The reverse-direction row, at the grain the shards record. `kind:
 *  "rubyCompat"` so that the day it IS baselined it sits in the existing
 *  `call-mismatches-exclude/` shards rather than a second artifact tree — and so
 *  that the two gates, which each filter to their own kind, never see it. */
export interface RubyCompatKey extends CallMismatchKey {
  kind: "rubyCompat";
  /** The export the body should have called. */
  tsExport: string;
}

/** One declaration as output/ts-api.json records it — the union of the fields
 *  both readers of {@link declarations} need. */
export interface Decl {
  name: string;
  line?: number;
  calls?: string[];
  skeleton?: string[];
  callArgs?: { name: string; args?: string[] }[];
}

/** The slice of output/ts-api.json the reports read. */
export interface TsApi {
  packages: Record<
    string,
    {
      fileFunctions?: Record<string, Decl[]>;
      classes?: Record<string, { file?: string; methods?: Decl[] }>;
    }
  >;
}

/** Every declaration in the tree, with the package and file it came from. */
export function declarations(api: TsApi): { package: string; tsFile: string; decl: Decl }[] {
  const out: { package: string; tsFile: string; decl: Decl }[] = [];
  for (const [pkg, entry] of Object.entries(api.packages)) {
    for (const [tsFile, fns] of Object.entries(entry.fileFunctions ?? {})) {
      for (const decl of fns) out.push({ package: pkg, tsFile, decl });
    }
    for (const klass of Object.values(entry.classes ?? {})) {
      for (const decl of klass.methods ?? [])
        out.push({ package: pkg, tsFile: klass.file ?? "", decl });
    }
  }
  return out;
}

/** Reverse: the mismatch rows the table claims. */
export function reverseRows(artifact: Artifact): RubyCompatKey[] {
  const rows: RubyCompatKey[] = [];
  for (const m of artifact.mismatches) {
    for (const missing of m.missing) {
      const call = callOf(missing);
      const tsExport = rubyCompatExport(call);
      if (tsExport === undefined) continue;
      rows.push({
        package: m.package,
        tsFile: m.tsFile,
        rubyName: m.rubyName,
        call,
        kind: "rubyCompat",
        tsExport,
      });
    }
  }
  return rows;
}

export interface Credit {
  package: string;
  tsFile: string;
  name: string;
  tsExport: string;
}

/** Forward: the call sites the table credits — a declaration outside
 *  `ruby-compat` itself that calls one of its exports. */
export function forwardCredits(api: TsApi): Credit[] {
  const exports = new Set(RUBY_COMPAT_EXPORTS.values());
  const out: Credit[] = [];
  for (const { package: pkg, tsFile, decl } of declarations(api)) {
    if (pkg === "ruby-compat") continue;
    for (const call of decl.calls ?? []) {
      if (exports.has(call)) out.push({ package: pkg, tsFile, name: decl.name, tsExport: call });
    }
  }
  return out;
}

export function renderReport(artifact: Artifact, api: TsApi, top: number): string {
  const rows = reverseRows(artifact);
  const credits = forwardCredits(api);
  const files = new Set(rows.map((r) => `${r.package} ${r.tsFile}`)).size;
  return [
    `ruby-compat call mapping report: ${rows.length} unconverged row(s) across ` +
      `${files} file(s); ${credits.length} call site(s) already credited`,
    section(
      "Reverse (hand-rolled) by package",
      tally(rows, (r) => r.package),
    ),
    section(
      "Reverse by ruby-compat export",
      tally(rows, (r) => `${r.call} → ${r.tsExport}`),
    ),
    section(
      "Reverse by file",
      tally(rows, (r) => `${r.package}/${r.tsFile}  ${r.rubyName}  ${r.call}`),
      top,
    ),
    section(
      "Forward (credited) by ruby-compat export",
      tally(credits, (c) => c.tsExport),
    ),
  ].join("\n");
}

/** The `report-*` CLI shape both RFC 0129 reports share: render, or explain the
 *  missing artifact and exit 2. Neither can fail a build, so there is no gate
 *  arm to keep in sync — one copy, imported, rather than two. `moduleUrl` is the
 *  caller's own `import.meta.url`, which is what makes the imported copy run
 *  only when ITS module is the one node was invoked on. */
export async function runReport(
  moduleUrl: string,
  label: string,
  render: (top: number) => Promise<string>,
): Promise<void> {
  if (path.resolve(fileURLToPath(moduleUrl)) !== path.resolve(process.argv[1] ?? "")) return;
  let top: number;
  try {
    top = parseTop(process.argv.slice(2), 20);
  } catch (e) {
    console.error(`${label}: ${(e as Error).message}`);
    return process.exit(2);
  }
  try {
    console.log(await render(top));
  } catch (e) {
    if ((e as { code?: string }).code !== "ENOENT") throw e;
    console.error(
      `${label}: an api-compare artifact is missing — run \`pnpm parity:api --calls\` first.`,
    );
    process.exit(2);
  }
}

void runReport(import.meta.url, "ruby-compat call mapping report", async (top) =>
  renderReport(
    JSON.parse(await readFile(ARTIFACT_PATH, "utf8")) as Artifact,
    JSON.parse(await readFile(TS_API_PATH, "utf8")) as TsApi,
    top,
  ),
);
