#!/usr/bin/env npx tsx
/**
 * Structural detection of a ruby-compat primitive re-implemented under an
 * unrecognised name (RFC 0129), read-only:
 *
 *   pnpm parity:structural-duplicates:report [--top=N]
 *
 * `no-ruby-compat-reimplementation` matches on NAMES, so it catches every
 * duplicate the RFC inventoried and nothing under a name nobody has thought of.
 * This asks whether a SHAPE match closes that gap — and answers with a
 * measurement, which is why it ships report-only: a gate seeded on an
 * unmeasured signal is a gate that gets disabled.
 *
 * The normalized form is the one `extract-ts-api.ts` already computes for every
 * declaration: `skeleton`, the body's control flow and call sequence with
 * identifiers erased. No second normalizer is written here, deliberately — the
 * question is whether shape matching WORKS, and a bespoke normalizer would
 * measure the normalizer instead. But `skeleton` erases literals, and for some
 * primitives the literal IS the whole signal: `regexpEscape`'s body is a bare
 * `["ref:replace"]`, which every string rewrite in the tree shares. So the
 * shape is skeleton PLUS the literal arguments the body passes, off the same
 * extractor's `callArgs` — `regexpEscape` passes `str:\$&`. Literals the
 * extractor does not represent (a regex literal arrives as `?`) contribute
 * nothing, itself part of what the precision figure measures.

 *
 * Hard rules: no node:* imports, no process.*, async fs only.
 */
import * as path from "path";
import { readFile } from "fs/promises";
import { OUTPUT_DIR } from "./config.js";
import { section, tally } from "./lint-call-mismatches.js";
import { type Decl, type TsApi, declarations, runReport } from "./report-ruby-compat.js";
export type { Decl, TsApi };

const TS_API_PATH = path.join(OUTPUT_DIR, "ts-api.json");

export interface Site {
  package: string;
  tsFile: string;
  name: string;
  line: number;
  shape: string;
}

/** The literal arguments a body passes, in call order — the half `skeleton`
 *  erases. `id:`-prefixed args are identifiers, so they carry no more than the
 *  skeleton already does and are dropped. */
export function literalArgs(decl: Decl): string[] {
  const out: string[] = [];
  for (const call of decl.callArgs ?? []) {
    for (const arg of call.args ?? []) if (!arg.startsWith("id:") && arg !== "?") out.push(arg);
  }
  return out;
}

/** The comparable shape of a body, or `undefined` for a body the extractor
 *  recorded no skeleton for (an overload signature, an abstract member). */
export function shapeOf(decl: Decl): string | undefined {
  if (decl.skeleton === undefined || decl.skeleton.length === 0) return undefined;
  return `${decl.skeleton.join(",")}|${literalArgs(decl).join(",")}`;
}

/** Every declaration in the tree, flattened to a comparable site. */
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

/** Candidates sharing a ruby-compat export's shape, grouped by that export. */
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
    // Keyed by EXPORT NAME, not file#name: `index.ts` re-exports every
    // primitive, so a file-keyed origin reports each match twice.
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

void runReport("report-structural-duplicates", async (top) =>
  renderReport(JSON.parse(await readFile(TS_API_PATH, "utf8")) as TsApi, top),
);
