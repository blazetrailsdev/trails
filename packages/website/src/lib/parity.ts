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
  const packages = (await publishedPackages(root)).map(({ dir, description }) => {
    const entry: PackageSummary | undefined = valid?.packages.find((p) => p.name === dir);
    const files = valid?.files.filter((f) => f.package === dir) ?? [];
    const counterpart = entry?.railsCounterpart ?? null;
    const source =
      counterpart === null ? null : (lock?.sources[counterpart] ?? lock?.sources.rails);
    return {
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
    };
  });
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
 * heading kept only as a "Moved to" pointer at the package's own file is the
 * same rule, listed once under the package.
 */
export function sectionsFor(summary: Summary, pkg: string): ClaudeSection[] {
  const own = `packages/${pkg}/CLAUDE.md`;
  const cited = new Set<string>();
  for (const t of summary.tagSites)
    if (t.package === pkg && t.citedSection) cited.add(t.citedSection);
  const entry = summary.packages.find((p) => p.name === pkg);
  for (const key of Object.keys(entry?.permanentSkips ?? {})) if (key !== "") cited.add(key);
  return summary.claudeSections.filter(
    (s) =>
      s.file === own ||
      (cited.has(`${s.file}#${s.anchor}`) && !s.lede.startsWith(`Moved to [${own}]`)),
  );
}

/**
 * A lede as VitePress markdown: relative links point at GitHub, and `<` outside
 * a code span is escaped so Vue does not read prose like `<pkg>` as a tag.
 */
function renderLede(s: ClaudeSection, ref: string): string {
  const linked = s.lede.replace(/\]\((?!https?:|#)([^)]+)\)/g, (_m, link: string) => {
    const target = path.posix.join(path.posix.dirname(s.file), link);
    return `](${GITHUB_REPO}/blob/${ref}/${target})`;
  });
  return linked
    .split("`")
    .map((part, i) => (i % 2 === 0 ? part.replace(/</g, "&lt;") : part))
    .join("`");
}

/** The markdown of `docs/packages/<pkg>.md`. */
export function packagePage(data: ParityData, pkg: string): string {
  const fig = data.packages.find((p) => p.name === pkg);
  const lines = [`# @blazetrails/${pkg}`, ""];
  if (fig?.description) lines.push(fig.description, "");
  const counterpart =
    fig?.railsCounterpart == null
      ? "none (TypeScript-only package)"
      : `\`${fig.railsCounterpart}\` ${fig.railsVersion ?? ""}`.trim();
  lines.push(
    "| | |",
    "| --- | --- |",
    `| Rails counterpart | ${counterpart} |`,
    `| API methods matched | ${percent(fig?.api ?? null)} |`,
    `| Rails tests matched | ${percent(fig?.tests ?? null)} |`,
    `| Measured at | ${shortSha(data.measuredAt)} |`,
    "",
    "## Ratified deviations",
    "",
    "Each rule below is ratified in the repository's `CLAUDE.md` files. The first",
    "paragraph is quoted; the link opens the full section at this build's commit.",
    "",
  );
  const sections = data.summary ? sectionsFor(data.summary, pkg) : null;
  if (sections === null) lines.push("—", "");
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
  return lines.join("\n");
}
