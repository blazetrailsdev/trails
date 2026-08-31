#!/usr/bin/env npx tsx
/**
 * The Ruby-core → ruby-compat call resolution report (RFC 0129), read-only:
 *
 *   pnpm parity:api:calls:ruby-compat:report [--top=N]
 *
 * Both directions of `RUBY_COMPAT_EXPORTS` (scripts/parity/ruby-compat.ts, which
 * documents them) over the artifacts `compare.ts --calls` writes. REVERSE is
 * every call-mismatch row whose Ruby call resolves to a ruby-compat export — the
 * port hand-rolled the primitive under an unrecognised name, the population an
 * enrollment story burns down. FORWARD is every TS declaration that DOES call
 * one: the sites the table credits, hence absent from the reverse half.
 *
 * Report-only, and separate from enrollment on purpose: seeding a gate red
 * across nine packages blocks every unrelated PR, so the flip is its own story
 * (`enroll-call-mapping-in-parity-gate`).
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
 *  "rubyCompat"` so that when baselined it sits in the existing
 *  `call-mismatches-exclude/` shards, and so neither gate — each filtering to
 *  its own kind — ever sees it. */
export interface RubyCompatKey extends CallMismatchKey {
  kind: "rubyCompat";
  /** The export the body should have called. */
  tsExport: string;
}

/** One declaration as output/ts-api.json records it. */
export interface Decl {
  name: string;
  file?: string;
  line?: number;
  calls?: string[];
  skeleton?: string[];
  callArgs?: { name: string; args?: string[] }[];
}

/** A class or module: members live under `instanceMethods`/`classMethods`,
 *  never one `methods` (`scripts/parity/types.ts`). */
export interface Host {
  file?: string;
  instanceMethods?: Decl[];
  classMethods?: Decl[];
}

/** The slice of output/ts-api.json the reports read. */
export interface TsApi {
  packages: Record<
    string,
    {
      fileFunctions?: Record<string, Decl[]>;
      classes?: Record<string, Host>;
      modules?: Record<string, Host>;
    }
  >;
}

/**
 * Every declaration in the tree — top-level functions AND both member lists of
 * every class and module — each yielded ONCE, with its own `file` winning over
 * the map key or the host (a member mixed into a class is declared elsewhere).
 *
 * Two things present one declaration twice, and both collapse here rather than
 * in each caller: the extractor synthesizes a backward-compat module from a
 * file's own `fileFunctions` (`extract-ts-api.ts:1127`), and the `this`-typed
 * mixin idiom puts one function on several hosts.
 */
export function declarations(api: TsApi): { package: string; tsFile: string; decl: Decl }[] {
  const seen = new Map<string, { package: string; tsFile: string; decl: Decl }>();
  const add = (pkg: string, tsFile: string, decl: Decl): void => {
    seen.set(`${pkg}/${tsFile}:${decl.line ?? 0} ${decl.name}`, { package: pkg, tsFile, decl });
  };
  for (const [pkg, entry] of Object.entries(api.packages)) {
    for (const [tsFile, fns] of Object.entries(entry.fileFunctions ?? {})) {
      for (const decl of fns) add(pkg, decl.file ?? tsFile, decl);
    }
    for (const host of [
      ...Object.values(entry.classes ?? {}),
      ...Object.values(entry.modules ?? {}),
    ]) {
      for (const decl of [...(host.instanceMethods ?? []), ...(host.classMethods ?? [])]) {
        add(pkg, decl.file ?? host.file ?? "", decl);
      }
    }
  }
  return [...seen.values()];
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

export type Credit = { package: string; tsFile: string; name: string; tsExport: string };

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
 *  missing artifact and exit 2. `moduleUrl` is the caller's own
 *  `import.meta.url`, so the imported copy runs only for ITS module. */
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
