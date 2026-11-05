/**
 * The per-package summary trailmap's package pages read (RFC 0222, "Data"):
 * `pnpm parity:packages` writes `scripts/parity/output/package-summary.json`
 * with
 *
 *   - `packages[]` — one entry per `packages/<pkg>/package.json`: its Rails
 *     counterpart, description and `CLAUDE.md`, a count per JSDoc receipt tag
 *     and receipt token, the mark and baseline counts of the ratchet gates, the
 *     params / predicates gates as `matched` / `total`, and its `PERMANENT-SKIP`
 *     tests grouped by the `CLAUDE.md` section they cite;
 *   - `tagSites[]` — every counted tag at its `file:line`;
 *   - `claudeSections[]` — every `##` / `###` heading of the root and package
 *     `CLAUDE.md` files, with its GitHub anchor and first paragraph.
 *
 * A tag counts only on a line that OPENS it, by the parse the lint rules and
 * the extractor share (`eslint/jsdoc-tag-line.mjs`), inside a JSDoc comment
 * the TypeScript parser attaches to a node — so a tag named in prose or in a
 * string is not counted. A cited section that resolves to no heading fails the
 * run, so a renamed heading cannot strand its citations.
 *
 * The params and predicates figures read `scripts/api-compare/output/`, which
 * `pnpm parity:api` writes; without it they are `null`, never 0.
 *
 * Hard rules: no node:* imports, no process.*, async fs only.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import ts from "typescript-5";
import { lineLeadingTag } from "../../eslint/jsdoc-tag-line.mjs";
import { SOURCES } from "../../vendor/sources.js";
import { measure as measureSends } from "./send-count.js";
import { measure as measureModules, KINDS as MODULE_KINDS } from "./module-count.js";

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const OUTPUT_PATH = "scripts/parity/output/package-summary.json";

export const TAGS = [
  "noRailsEquivalent",
  "missingRailsCall",
  "missingRailsArgs",
  "missingRailsName",
  "inventedArm",
  "perf",
  "inlinedFrom",
  "internal",
] as const;
export type Tag = (typeof TAGS)[number];
export type Receipt = "PERMANENT" | "CONVERGEABLE" | null;

/**
 * `scripts/api-compare/config.ts`'s map of api-compare keys to the package
 * directory they live in. That module is CommonJS (`__dirname`), which a
 * `tsx -e` ESM entry cannot take named exports from, so the map is restated
 * here and `package-summary.test.ts` pins it equal to the original.
 */
export const PACKAGE_DIR_OVERRIDES: Record<string, string> = {
  actiondispatch: "actionpack",
  actioncontroller: "actionpack",
  abstractcontroller: "actionpack",
  actionpackversion: "actionpack",
  "activerecord-test-support": "activerecord",
  "rails-dom-testing": "actionview",
  mysql2: "activerecord",
  pg: "activerecord",
  sqlite3: "activerecord",
};

export function packageDirOf(key: string): string {
  return PACKAGE_DIR_OVERRIDES[key] ?? key;
}

export interface ClaudeSection {
  file: string;
  heading: string;
  anchor: string;
  lede: string;
}

export interface TagSite {
  package: string;
  tag: Tag;
  receipt: Receipt;
  file: string;
  line: number;
  declaration: string | null;
  citedSection: string | null;
}

export interface SkipTest {
  file: string;
  line: number;
  testName: string | null;
}

export interface Ratio {
  matched: number;
  total: number;
}

export interface PackageSummary {
  name: string;
  railsCounterpart: string | null;
  description: string | null;
  claudeMd: string | null;
  tags: Record<Tag, { PERMANENT: number; CONVERGEABLE: number; none: number }>;
  marks: {
    callMismatchesExclude: number;
    callArgsBaseline: number;
    extraSurfaceNovel: number | null;
    extraSurfaceTotal: number | null;
    modules: Record<(typeof MODULE_KINDS)[number], number>;
    sends: number;
  };
  params: Ratio | null;
  predicates: Ratio | null;
  permanentSkips: Record<string, SkipTest[]>;
}

export interface Summary {
  packages: PackageSummary[];
  tagSites: TagSite[];
  claudeSections: ClaudeSection[];
}

/** GitHub's heading anchor: lowercased, punctuation dropped, spaces to hyphens. */
export function githubAnchor(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

export function parseClaudeSections(file: string, text: string): ClaudeSection[] {
  const out: ClaudeSection[] = [];
  const seen = new Map<string, number>();
  const lines = text.split("\n");
  let fenced = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) fenced = !fenced;
    const m = fenced ? null : /^(##|###) (.+)$/.exec(lines[i]);
    if (m === null) continue;
    const heading = m[2].trim();
    const base = githubAnchor(heading);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    const lede: string[] = [];
    for (let j = i + 1; j < lines.length && !/^#{1,6} /.test(lines[j]); j++) {
      if (lines[j].trim() === "") {
        if (lede.length > 0) break;
        continue;
      }
      lede.push(lines[j].trim());
    }
    out.push({ file, heading, anchor: n === 0 ? base : `${base}-${n}`, lede: lede.join(" ") });
  }
  return out;
}

const CITATION = /((?:packages\/[\w-]+\/)?CLAUDE\.md)(?:,|\s*§)\s*"([^"]+)"/g;

/**
 * The `file#anchor` of every `CLAUDE.md` section `text` cites. A citation names
 * the heading whole or by its leading words (the parenthesised Rails names are
 * often left off); one resolving to no heading throws.
 */
export function citedSections(text: string, sections: ClaudeSection[], where: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(CITATION)) {
    const [, file, cited] = m;
    const want = cited.trim();
    const inFile = sections.filter((s) => s.file === file);
    const hit =
      inFile.find((s) => s.heading === want) ??
      inFile.find((s) => s.heading.startsWith(want)) ??
      sections.find((s) => s.heading === want) ??
      sections.find((s) => s.heading.startsWith(want));
    if (hit === undefined) {
      throw new Error(`package-summary: ${where} cites ${file}, "${want}", which no heading names`);
    }
    out.push(`${hit.file}#${hit.anchor}`);
  }
  return out;
}

function receiptOf(text: string): Receipt {
  const m = /\b(PERMANENT|CONVERGEABLE)\b/.exec(text);
  return m === null ? null : (m[1] as Receipt);
}

function declarationName(node: ts.Node): string | null {
  if (ts.isConstructorDeclaration(node)) return "constructor";
  if (ts.isVariableStatement(node)) {
    const d = node.declarationList.declarations[0];
    return d !== undefined && ts.isIdentifier(d.name) ? d.name.text : null;
  }
  const name = (node as { name?: ts.Node }).name;
  if (name === undefined) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isPrivateIdentifier(name)) {
    return name.text;
  }
  return null;
}

/** The counted tags of one source file, each at the declaration its JSDoc documents. */
export function tagSitesIn(
  pkg: string,
  file: string,
  text: string,
  sections: ClaudeSection[],
): TagSite[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false);
  const seen = new Set<number>();
  const out: TagSite[] = [];
  const visit = (node: ts.Node): void => {
    for (const r of ts.getLeadingCommentRanges(text, node.getFullStart()) ?? []) {
      if (seen.has(r.pos) || !text.startsWith("/**", r.pos)) continue;
      seen.add(r.pos);
      const startLine = sf.getLineAndCharacterOfPosition(r.pos).line + 1;
      const lines = text.slice(r.pos, r.end).split("\n");
      lines.forEach((raw, i) => {
        const opened = lineLeadingTag(raw);
        if (opened === null || !(TAGS as readonly string[]).includes(opened.name)) return;
        let body = opened.text;
        for (let j = i + 1; j < lines.length && lineLeadingTag(lines[j]) === null; j++) {
          body += " " + lines[j].replace(/^\s*\*?\/?\s?/, "");
        }
        const line = startLine + i;
        out.push({
          package: pkg,
          tag: opened.name as Tag,
          receipt: receiptOf(opened.text),
          file,
          line,
          declaration: declarationName(node),
          citedSection: citedSections(body, sections, `${file}:${line}`)[0] ?? null,
        });
      });
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return out;
}

/**
 * Every `PERMANENT-SKIP:` comment in a test file, keyed by the section it
 * cites (`""` when it cites none), with the name of the test it parks. A
 * comment runs over its `//` continuation lines, so a citation may wrap.
 */
export function permanentSkipsIn(
  file: string,
  text: string,
  sections: ClaudeSection[],
): Record<string, SkipTest[]> {
  const out: Record<string, SkipTest[]> = {};
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const at = lines[i].indexOf("PERMANENT-SKIP:");
    if (at < 0) continue;
    let comment = lines[i].slice(at);
    let j = i + 1;
    for (; j < lines.length && /^\s*(\/\/|\*)/.test(lines[j]); j++) {
      comment += " " + lines[j].replace(/^\s*(\/\/|\*)\s?/, "");
    }
    const name = /^\s*(?:it|test|describe)(?:\.skip)?\(\s*(["'`])(.*?)\1/.exec(lines[j] ?? "");
    const skip = { file, line: i + 1, testName: name === null ? null : name[2] };
    const anchor = citedSections(comment, sections, `${file}:${i + 1}`)[0] ?? "";
    (out[anchor] ??= []).push(skip);
  }
  return out;
}

async function exists(p: string): Promise<boolean> {
  return fs.stat(p).then(
    () => true,
    () => false,
  );
}

async function readJson<T>(p: string): Promise<T | null> {
  return (await exists(p)) ? (JSON.parse(await fs.readFile(p, "utf-8")) as T) : null;
}

async function listFiles(dir: string, keep: (name: string) => boolean): Promise<string[]> {
  if (!(await exists(dir))) return [];
  const out: string[] = [];
  for (const d of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) {
      if (d.name === "node_modules" || d.name === "dist") continue;
      out.push(...(await listFiles(full, keep)));
    } else if (d.isFile() && keep(d.name)) {
      out.push(full);
    }
  }
  return out.sort();
}

const isSource = (n: string) =>
  n.endsWith(".ts") && !n.endsWith(".test.ts") && !n.endsWith(".d.ts");
const isTest = (n: string) => n.endsWith(".test.ts");

/** The gem directory api-compare pairs `dir` with: its own key's entry first. */
export function railsCounterpartOf(dir: string): string | null {
  const entries = SOURCES.flatMap((s) => s.packages.map((p) => ({ source: s.name, p })));
  const own = entries.filter((e) => packageDirOf(e.p.name) === dir && e.p.compareApi !== false);
  const pick = own.find((e) => e.p.name === dir) ?? own[0];
  if (pick === undefined) return null;
  return pick.source === "rails" ? pick.p.libPath.split("/")[0] : pick.source;
}

interface ApiComparison {
  results: {
    package: string;
    paramNames?: { compared: number };
    predicatesCompared?: number;
    predicateKindMismatches?: unknown[];
  }[];
}

export async function summarize(root = ROOT_DIR): Promise<Summary> {
  const rel = (p: string) => path.relative(root, p).split(path.sep).join("/");
  const packagesDir = path.join(root, "packages");
  const names: string[] = [];
  for (const d of (await fs.readdir(packagesDir)).sort()) {
    if (await exists(path.join(packagesDir, d, "package.json"))) names.push(d);
  }

  const claudeSections: ClaudeSection[] = [];
  for (const file of ["CLAUDE.md", ...names.map((n) => `packages/${n}/CLAUDE.md`)]) {
    const p = path.join(root, file);
    if (await exists(p))
      claudeSections.push(...parseClaudeSections(file, await fs.readFile(p, "utf-8")));
  }

  const apiDir = path.join(root, "scripts/api-compare");
  const baseline: { package: string; kind?: string }[] = [];
  for (const f of await listFiles(path.join(apiDir, "call-mismatches-exclude"), (n) =>
    n.endsWith(".json"),
  )) {
    baseline.push(...(JSON.parse(await fs.readFile(f, "utf-8")) as typeof baseline));
  }
  const extraMark =
    (await readJson<Record<string, { novel: number; total: number }>>(
      path.join(apiDir, "extra-surface-mark.json"),
    )) ?? {};
  const comparison = await readJson<ApiComparison>(path.join(apiDir, "output/api-comparison.json"));
  const paramArtifact = await readJson<{
    mismatches: { package: string; rubyFile: string; rubyName: string }[];
  }>(path.join(apiDir, "output/param-name-mismatches.json"));

  const moduleCounts = await measureModules(root);
  const sendCounts = await measureSends(packagesDir);

  const packages: PackageSummary[] = [];
  const tagSites: TagSite[] = [];
  for (const name of names) {
    const dir = path.join(packagesDir, name);
    const pkgJson = JSON.parse(await fs.readFile(path.join(dir, "package.json"), "utf-8")) as {
      description?: string;
    };
    const claudeMd = (await exists(path.join(dir, "CLAUDE.md")))
      ? `packages/${name}/CLAUDE.md`
      : null;

    const tags = Object.fromEntries(
      TAGS.map((t) => [t, { PERMANENT: 0, CONVERGEABLE: 0, none: 0 }]),
    ) as PackageSummary["tags"];
    for (const f of await listFiles(path.join(dir, "src"), isSource)) {
      const text = await fs.readFile(f, "utf-8");
      for (const site of tagSitesIn(name, rel(f), text, claudeSections)) {
        tags[site.tag][site.receipt ?? "none"]++;
        tagSites.push(site);
      }
    }

    const permanentSkips: Record<string, SkipTest[]> = {};
    for (const f of await listFiles(dir, isTest)) {
      const text = await fs.readFile(f, "utf-8");
      if (!text.includes("PERMANENT-SKIP:")) continue;
      for (const [anchor, rows] of Object.entries(permanentSkipsIn(rel(f), text, claudeSections))) {
        (permanentSkips[anchor] ??= []).push(...rows);
      }
    }

    const keys = (k: string) => packageDirOf(k) === name;
    const ownRows = baseline.filter((r) => keys(r.package));
    const extra = Object.entries(extraMark).filter(([k]) => keys(k));
    const results = comparison?.results.filter((r) => keys(r.package)) ?? [];
    const measured = results.length > 0;
    const paramTotal = results.reduce((n, r) => n + (r.paramNames?.compared ?? 0), 0);
    const paramMismatched = new Set(
      (paramArtifact?.mismatches ?? [])
        .filter((m) => keys(m.package))
        .map((m) => `${m.package} ${m.rubyFile} ${m.rubyName}`),
    ).size;
    const predicateTotal = results.reduce((n, r) => n + (r.predicatesCompared ?? 0), 0);
    const predicateMismatched = results.reduce(
      (n, r) => n + (r.predicateKindMismatches?.length ?? 0),
      0,
    );

    packages.push({
      name,
      railsCounterpart: railsCounterpartOf(name),
      description: pkgJson.description ?? null,
      claudeMd,
      tags,
      marks: {
        callMismatchesExclude: ownRows.filter((r) => r.kind !== "args").length,
        callArgsBaseline: ownRows.filter((r) => r.kind === "args").length,
        extraSurfaceNovel: extra.length > 0 ? extra.reduce((n, [, m]) => n + m.novel, 0) : null,
        extraSurfaceTotal: extra.length > 0 ? extra.reduce((n, [, m]) => n + m.total, 0) : null,
        modules:
          moduleCounts[name] ??
          (Object.fromEntries(
            MODULE_KINDS.map((k) => [k, 0]),
          ) as PackageSummary["marks"]["modules"]),
        sends: Object.entries(sendCounts)
          .filter(([f]) => f.split("/")[0] === name)
          .reduce((n, [, c]) => n + c, 0),
      },
      params:
        measured && paramArtifact !== null
          ? { matched: paramTotal - paramMismatched, total: paramTotal }
          : null,
      predicates: measured
        ? { matched: predicateTotal - predicateMismatched, total: predicateTotal }
        : null,
      permanentSkips,
    });
  }
  return { packages, tagSites, claudeSections };
}

export async function main(root = ROOT_DIR): Promise<string> {
  const summary = await summarize(root);
  const out = path.join(root, OUTPUT_PATH);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, JSON.stringify(summary, null, 2) + "\n");
  return (
    `package-summary: wrote ${OUTPUT_PATH} — ${summary.packages.length} packages, ` +
    `${summary.tagSites.length} tag sites, ${summary.claudeSections.length} CLAUDE.md sections`
  );
}
