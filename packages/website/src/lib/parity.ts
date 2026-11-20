/**
 * The one reader of `scripts/parity/output/package-summary.json` for the site
 * (RFC 0247 § Design 3). The VitePress data loader, the `/packages/` dynamic
 * route and the SvelteKit landing load all call {@link loadParity}, so every
 * figure on the site comes from the same file and carries the commit it was
 * measured at.
 *
 * Paths are relative to `packages/website/`, the working directory of every
 * build and of vitest. The Pages workflow downloads the summary from CI's
 * `parity-outputs-<sha>` artifact and writes that sha beside it as
 * `package-summary.sha`, and the build's own commit as `build.sha`. A missing
 * or unreadable file renders "—" and never fails the build.
 */

import * as fs from "fs/promises";
import * as path from "path";
import type {
  ClaudeSection,
  FileRow,
  PackageSummary,
  Ratio,
  Summary,
} from "../../../../scripts/parity/package-summary.js";

export const REPO_ROOT = "../..";
export const SUMMARY_PATH = "scripts/parity/output/package-summary.json";
export const SUMMARY_SHA_PATH = "scripts/parity/output/package-summary.sha";
export const BUILD_SHA_PATH = "scripts/parity/output/build.sha";
export const GITHUB_REPO = "https://github.com/blazetrailsdev/trails";

/** The gems of the Rails repository, the top-level directories of `vendor/rails/v8.0.2/`. */
export const RAILS_FRAMEWORKS: ReadonlySet<string> = new Set([
  "actioncable",
  "actionmailbox",
  "actionmailer",
  "actionpack",
  "actiontext",
  "actionview",
  "activejob",
  "activemodel",
  "activerecord",
  "activestorage",
  "activesupport",
  "railties",
]);

export interface PackageFigures {
  name: string;
  description: string | null;
  railsCounterpart: string | null;
  railsVersion: string | null;
  api: Ratio | null;
  tests: Ratio | null;
}

export interface ParityData {
  measuredAt: string | null;
  buildRef: string;
  summary: Summary | null;
  packages: PackageFigures[];
}

async function readText(rel: string, root: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(root, rel), "utf8");
  } catch {
    return null;
  }
}

async function readJson<T>(rel: string, root: string): Promise<T | null> {
  const text = await readText(rel, root);
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Every `packages/<pkg>` whose `package.json` is not `private`, by name. */
export async function publishedPackages(
  root = REPO_ROOT,
): Promise<{ dir: string; description: string | null }[]> {
  const dirs = (await fs.readdir(path.join(root, "packages"))).sort();
  const out: { dir: string; description: string | null }[] = [];
  for (const dir of dirs) {
    const pkg = await readJson<{ private?: boolean; description?: string }>(
      `packages/${dir}/package.json`,
      root,
    );
    if (pkg === null || pkg.private === true) continue;
    out.push({ dir, description: pkg.description ?? null });
  }
  return out;
}

function sum(rows: FileRow[], matched: (r: FileRow) => number, total: (r: FileRow) => number) {
  if (rows.length === 0) return null;
  const r = { matched: 0, total: 0 };
  for (const row of rows) {
    r.matched += matched(row);
    r.total += total(row);
  }
  return r.total === 0 ? null : r;
}

export async function loadParity(root = REPO_ROOT): Promise<ParityData> {
  const summary = await readJson<Summary>(SUMMARY_PATH, root);
  const valid = summary !== null && Array.isArray(summary.packages) ? summary : null;
  const measuredAt = valid ? ((await readText(SUMMARY_SHA_PATH, root))?.trim() ?? null) : null;
  const buildRef = (await readText(BUILD_SHA_PATH, root))?.trim() || "main";
  const lock = await readJson<{ sources: Record<string, { ref: string }> }>(
    "vendor/sources.lock.json",
    root,
  );
  const packages: PackageFigures[] = [];
  for (const { dir, description } of await publishedPackages(root)) {
    const entry: PackageSummary | undefined = valid?.packages.find((p) => p.name === dir);
    const files = valid?.files.filter((f) => f.package === dir) ?? [];
    const counterpart = entry?.railsCounterpart ?? null;
    const source =
      counterpart === null
        ? null
        : (lock?.sources[counterpart] ??
          (RAILS_FRAMEWORKS.has(counterpart) ? lock?.sources.rails : null));
    packages.push({
      name: dir,
      description,
      railsCounterpart: counterpart,
      railsVersion: source?.ref ?? null,
      api: sum(
        files,
        (f) => f.methodsMatched,
        (f) => f.methodsMatched + f.methodsMissing,
      ),
      tests: sum(
        files,
        (f) => f.testsMatched,
        (f) => f.testsTotal,
      ),
    });
  }
  return { measuredAt: valid ? measuredAt || "local" : null, buildRef, summary: valid, packages };
}

export function percent(r: Ratio | null): string {
  return r === null ? "—" : `${Math.floor((r.matched / r.total) * 100)}%`;
}

export function shortSha(sha: string | null): string {
  return sha === null ? "—" : sha.slice(0, 10);
}

/**
 * The `CLAUDE.md` sections a package page lists: every section of the
 * package's own `CLAUDE.md`, then each other section its receipts or
 * `PERMANENT-SKIP` lines cite, in the order the summary lists them. A root
 * heading kept only as a "Moved to" pointer is replaced by the section it
 * points at, and each section is listed once.
 */
export function sectionsFor(summary: Summary, pkg: string): ClaudeSection[] {
  const own = `packages/${pkg}/CLAUDE.md`;
  const cited = new Set<string>();
  for (const t of summary.tagSites)
    if (t.package === pkg && t.citedSection) cited.add(t.citedSection);
  const entry = summary.packages.find((p) => p.name === pkg);
  for (const key of Object.keys(entry?.permanentSkips ?? {})) if (key !== "") cited.add(key);
  const byKey = new Map(summary.claudeSections.map((s) => [`${s.file}#${s.anchor}`, s]));
  const wanted = new Set<ClaudeSection>();
  for (const key of cited) {
    let s = byKey.get(key);
    const moved = s && /^Moved to \[[^\]]*\]\(([^)#]+)#([^)]+)\)/.exec(s.lede);
    if (moved) s = byKey.get(`${moved[1]}#${moved[2]}`);
    if (s) wanted.add(s);
  }
  return summary.claudeSections.filter((s) => s.file === own || wanted.has(s));
}

function renderLede(s: ClaudeSection, ref: string): string {
  const linked = s.lede.replace(/\]\((?!https?:)([^)]+)\)/g, (_m, link: string) => {
    const target = link.startsWith("#")
      ? `${s.file}${link}`
      : path.posix.join(path.posix.dirname(s.file), link);
    return `](${GITHUB_REPO}/blob/${ref}/${target})`;
  });
  return linked
    .split("`")
    .map((part, i) => (i % 2 === 0 ? part.replace(/</g, "&lt;") : part))
    .join("`");
}

const DASH = "—";

function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/</g, "&lt;");
}

function link(text: string, url: string | null | undefined): string {
  const code = `\`${text}\``;
  return url ? `[${code}](${url})` : code;
}

function details(summary: string, body: string[]): string[] {
  return ["<details>", `<summary>${summary}</summary>`, "", ...body, "", "</details>", ""];
}

function fileGap(f: FileRow): number {
  return f.methodsMissing + (f.testsTotal - f.testsMatched);
}

function tsUrl(f: FileRow, ref: string): string | null {
  return f.tsPath ? `${GITHUB_REPO}/blob/${ref}/${f.tsPath}` : null;
}

function statsLines(data: ParityData, fig: PackageFigures | undefined, files: FileRow[] | null) {
  const counterpart =
    fig?.railsCounterpart == null
      ? "none (TypeScript-only package)"
      : `\`${fig.railsCounterpart}\` ${fig.railsVersion ?? ""}`.trim();
  const ratio = (r: Ratio | null) =>
    r === null ? DASH : `${percent(r)} (${r.matched} of ${r.total})`;
  const ported = files === null ? DASH : String(files.filter((f) => f.tsFile !== null).length);
  const unported = files === null ? DASH : String(files.filter((f) => f.tsFile === null).length);
  return [
    "| | |",
    "| --- | --- |",
    `| Rails counterpart | ${counterpart} |`,
    `| API methods matched | ${ratio(fig?.api ?? null)} |`,
    `| Rails tests matched | ${ratio(fig?.tests ?? null)} |`,
    `| Ruby files ported | ${ported} |`,
    `| Ruby files unported | ${unported} |`,
    `| Measured at | ${shortSha(data.measuredAt)} |`,
    "",
  ];
}

function gapLines(files: FileRow[] | null, ref: string): string[] {
  const lines = ["## Gaps by file", ""];
  if (files === null) return [...lines, DASH, ""];
  const gaps = files.filter((f) => f.tsFile !== null && fileGap(f) > 0);
  if (gaps.length === 0) return [...lines, "No gaps recorded for this package.", ""];
  gaps.sort((a, b) => fileGap(b) - fileGap(a) || a.rubyFile.localeCompare(b.rubyFile));
  lines.push("Ported files with Rails methods or tests still missing, largest gap first.", "");
  const table = [
    "| Ruby file | TypeScript file | Methods missing | Tests matched |",
    "| --- | --- | ---: | ---: |",
    ...gaps.map(
      (f) =>
        `| ${link(f.rubyFile, f.rubyUrl)} | ${link(f.tsFile!, tsUrl(f, ref))} | ${f.methodsMissing} | ${
          f.testsTotal === 0 ? DASH : `${f.testsMatched} / ${f.testsTotal}`
        } |`,
    ),
  ];
  if (gaps.length > 20) lines.push(...details(`All ${gaps.length} files`, table));
  else lines.push(...table, "");
  return lines;
}

function missingLines(files: FileRow[] | null): string[] {
  const lines = ["## Missing methods", ""];
  if (files === null) return [...lines, DASH, ""];
  const withNames = files
    .filter((f) => (f.missingMethods ?? []).length > 0)
    .sort((a, b) => b.missingMethods.length - a.missingMethods.length);
  if (withNames.length === 0) return [...lines, "None recorded for this package.", ""];
  lines.push(
    "The Rails methods `parity:api` finds no TypeScript counterpart for, by Ruby file.",
    "",
  );
  for (const f of withNames) {
    const names = f.missingMethods.map((m) => `\`${m}\``).join(", ");
    lines.push(
      ...details(`<code>${escapeCell(f.rubyFile)}</code>: ${f.missingMethods.length} missing`, [
        names,
      ]),
    );
  }
  return lines;
}

function unportedLines(files: FileRow[] | null): string[] {
  const lines = ["## Unported Ruby files", ""];
  if (files === null) return [...lines, DASH, ""];
  const unported = files
    .filter((f) => f.tsFile === null)
    .sort((a, b) => a.rubyFile.localeCompare(b.rubyFile));
  if (unported.length === 0)
    return [...lines, "Every compared Ruby file has a TypeScript file.", ""];
  const items = unported.map(
    (f) => `- ${link(f.rubyFile, f.rubyUrl)} (${f.methodsMatched + f.methodsMissing} methods)`,
  );
  if (items.length > 20) lines.push(...details(`All ${items.length} files`, items));
  else lines.push(...items, "");
  return lines;
}

function tagLines(entry: PackageSummary | undefined | null): string[] {
  const lines = ["## Deviation receipts", ""];
  if (!entry?.tags) return [...lines, DASH, ""];
  const rows = Object.entries(entry.tags).filter(
    ([, c]) => c.PERMANENT + c.CONVERGEABLE + c.none > 0,
  );
  if (rows.length === 0) return [...lines, "No receipt tags in this package.", ""];
  lines.push(
    "JSDoc receipt tags in the package's source, by the receipt each carries.",
    "",
    "| Tag | PERMANENT | CONVERGEABLE | none |",
    "| --- | ---: | ---: | ---: |",
    ...rows.map(([t, c]) => `| \`@${t}\` | ${c.PERMANENT} | ${c.CONVERGEABLE} | ${c.none} |`),
    "",
  );
  return lines;
}

function skipLines(data: ParityData, entry: PackageSummary | undefined | null): string[] {
  const lines = ["## Permanently skipped tests", ""];
  if (!entry) return [...lines, DASH, ""];
  const groups = Object.entries(entry.permanentSkips ?? {}).filter(([, t]) => t.length > 0);
  if (groups.length === 0) return [...lines, "None.", ""];
  const headings = new Map(
    (data.summary?.claudeSections ?? []).map((s) => [`${s.file}#${s.anchor}`, s.heading]),
  );
  for (const [key, tests] of groups) {
    const title = key === "" ? "No section cited" : escapeCell(headings.get(key) ?? key);
    const items = tests.map((t) => {
      const url = `${GITHUB_REPO}/blob/${data.buildRef}/${t.file}#L${t.line}`;
      return `- [${escapeCell(t.testName ?? `${t.file}:${t.line}`)}](${url})`;
    });
    lines.push(...details(`${title} (${tests.length})`, items));
  }
  return lines;
}

/** The markdown of `docs/packages/<pkg>.md`. */
export function packagePage(data: ParityData, pkg: string): string {
  const fig = data.packages.find((p) => p.name === pkg);
  const entry = data.summary?.packages.find((p) => p.name === pkg);
  const files = data.summary ? data.summary.files.filter((f) => f.package === pkg) : null;
  const lines = [`# @blazetrails/${pkg}`, ""];
  if (fig?.description) lines.push(fig.description, "");
  lines.push(...statsLines(data, fig, files), "::: v-pre", "");
  lines.push(
    ...gapLines(files, data.buildRef),
    ...missingLines(files),
    ...unportedLines(files),
    ...tagLines(data.summary ? entry : null),
    ...skipLines(data, data.summary ? entry : null),
    ":::",
    "",
  );
  lines.push(
    "## Ratified deviations",
    "",
    "Each rule below is ratified in the repository's `CLAUDE.md` files. The first",
    "paragraph is quoted; the link opens the full section at this build's commit.",
    "",
  );
  const sections = data.summary ? sectionsFor(data.summary, pkg) : null;
  if (sections === null) lines.push(DASH, "");
  else if (sections.length === 0) lines.push("None recorded for this package.", "");
  if (sections !== null && sections.length > 0) lines.push("::: v-pre", "");
  for (const s of sections ?? []) {
    const url = `${GITHUB_REPO}/blob/${data.buildRef}/${s.file}#${s.anchor}`;
    lines.push(
      `### ${s.heading}`,
      "",
      renderLede(s, data.buildRef),
      "",
      `[${s.file} →](${url})`,
      "",
    );
  }
  if (sections !== null && sections.length > 0) lines.push(":::", "");
  lines.push(
    "## Source",
    "",
    `[packages/${pkg} on GitHub →](${GITHUB_REPO}/tree/${data.buildRef}/packages/${pkg})`,
    "",
  );
  return lines.join("\n");
}
