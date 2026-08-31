#!/usr/bin/env npx tsx
/**
 * Structural detection of a ruby-compat primitive re-implemented under an
 * unrecognised name (RFC 0129), read-only:
 *
 *   pnpm parity:structural-duplicates:report [--top=N]
 *
 * `no-ruby-compat-reimplementation` matches on NAMES, so it misses a copy under
 * a name nobody has thought of. This asks whether a SHAPE match closes that gap
 * and answers with a measurement; the RFC's Gate 3 section records the
 * precision and the recommendation that follows. The shape is {@link shapeOf}.
 * A package barrel re-exports a declaration under `index.ts` keeping the
 * ORIGINAL line, so a re-exported hit reports at both files — left visible
 * rather than guessed away, and the classification says which.
 *
 * Hard rules: no node:* imports, no process.*, async fs only.
 */
import * as path from "path";
import { readFile } from "fs/promises";
import { OUTPUT_DIR } from "./config.js";
import { section, tally } from "./lint-call-mismatches.js";
import { type Decl, type TsApi, declarations, runReport } from "./report-ruby-compat.js";

const TS_API_PATH = path.join(OUTPUT_DIR, "ts-api.json");

export interface Site {
  package: string;
  tsFile: string;
  name: string;
  line: number;
  shape: string;
}

/**
 * The comparable shape of a body — the `skeleton` `extract-ts-api.ts` computes
 * (control flow and call sequence, identifiers erased), then the literal
 * arguments it passes, the half the skeleton erases and which for some
 * primitives is the whole signal. `id:` args are identifiers and `?` is a
 * literal the extractor could not represent, so neither is kept. `undefined`
 * for a body with no skeleton (an overload signature), which cannot compare.
 */
export function shapeOf(decl: Decl): string | undefined {
  if (decl.skeleton === undefined || decl.skeleton.length === 0) return undefined;
  const literals: string[] = [];
  for (const call of decl.callArgs ?? []) {
    for (const arg of call.args ?? [])
      if (!arg.startsWith("id:") && arg !== "?") literals.push(arg);
  }
  return `${decl.skeleton.join(",")}|${literals.join(",")}`;
}

/** Every declaration flattened to a comparable site. `declarations` already
 *  yields each one once, so no dedupe is repeated here. */
export function sites(api: TsApi): Site[] {
  const out: Site[] = [];
  for (const { package: pkg, tsFile, decl } of declarations(api)) {
    const shape = shapeOf(decl);
    if (shape === undefined) continue;
    out.push({ package: pkg, tsFile, name: decl.name, line: decl.line ?? 0, shape });
  }
  return out;
}

function siteKey(s: Site): string {
  return `${s.package}/${s.tsFile}:${s.line} ${s.name}`;
}

/** Candidates sharing a ruby-compat export's shape, grouped by export NAME —
 *  `index.ts` re-exports every primitive, so a file-keyed origin would report
 *  each match twice. */
export function matches(api: TsApi): Map<string, Site[]> {
  const all = sites(api);
  const byShape = new Map<string, Site[]>();
  for (const s of all) {
    if (s.package === "ruby-compat") continue;
    const bucket = byShape.get(s.shape) ?? [];
    bucket.push(s);
    byShape.set(s.shape, bucket);
  }
  const found = new Map<string, Site[]>();
  for (const origin of all) {
    if (origin.package !== "ruby-compat") continue;
    const hits = byShape.get(origin.shape);
    if (hits === undefined) continue;
    const seen = new Set((found.get(origin.name) ?? []).map(siteKey));
    found.set(origin.name, [
      ...(found.get(origin.name) ?? []),
      ...hits.filter((h) => !seen.has(siteKey(h))),
    ]);
  }
  return found;
}

export function renderReport(api: TsApi, top: number): string {
  const found = matches(api);
  const flat = [...found].flatMap(([origin, hits]) => hits.map((h) => ({ origin, ...h })));
  const lines = [
    `structural duplicate report: ${flat.length} candidate(s) across ` +
      `${found.size} ruby-compat export(s) with a shape match`,
    section(
      "By ruby-compat export",
      tally(flat, (h) => h.origin),
    ),
  ];
  for (const [origin, hits] of [...found].sort((a, b) => b[1].length - a[1].length)) {
    lines.push(
      section(
        origin,
        hits.slice(0, top).map((h) => [`${h.package}/${h.tsFile}:${h.line}  ${h.name}`, 1]),
      ),
    );
  }
  return lines.join("\n");
}

void runReport(import.meta.url, "structural duplicate report", async (top) =>
  renderReport(JSON.parse(await readFile(TS_API_PATH, "utf8")) as TsApi, top),
);
