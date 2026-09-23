#!/usr/bin/env npx tsx
/**
 * `pnpm parity:skips:stories` (RFC 0156, report-only): open stories naming a
 * Ruby file `isSourceUnported` excludes, or a mirrorless `SCOPED_SKIP_GROUPS`
 * (file, name) pair — asks to port what a register calls unportable. Stories
 * come from the checkout `scripts/tasks/tasks.sh` would use.
 */
import * as path from "path";
import { readdir, readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { SOURCES } from "../../vendor/sources.js";
import { SCOPED_SKIP_GROUPS, rubyMethodToTsIgnoringSkip } from "@blazetrails/parity/conventions";
import { unportedSourceEntry } from "@blazetrails/parity/unported-files";

export interface StoryText {
  id: string;
  status: string;
  body: string;
}

export interface StorySkipConflict {
  story: string;
  status: string;
  register: "unported-file" | "scoped-skip";
  pkg: string;
  rubyFile: string;
  name?: string;
  reason: string;
}

/** Lib root (`active_support`) → package, longest first so `rack/session` beats `rack`. */
const LIB_ROOTS: [string, string][] = SOURCES.flatMap((source) =>
  source.packages.flatMap((pkg): [string, string][] => {
    const root = pkg.libPath.split(/(?:^|\/)lib\//)[1] ?? "";
    return root === "" ? [] : [[root, pkg.name]];
  }),
).sort(([a], [b]) => b.length - a.length);

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The packages whose namespace `text` names: as `Ns::X`, or bare when `bareToo`. */
function namedPackages(text: string, bareToo: boolean): string[] {
  const constants = [...text.matchAll(/(?<![\w:])[A-Z]\w*(?:::[A-Z]\w*)*/g)].map(([c]) =>
    c.toLowerCase(),
  );
  return LIB_ROOTS.filter(([root]) => {
    const namespace = root.replace(/\//g, "::").replace(/_/g, "").toLowerCase();
    const bare = bareToo && namespace !== "rails" && constants.includes(namespace);
    return bare || constants.some((c) => c.startsWith(`${namespace}::`));
  }).map(([, pkg]) => pkg);
}

/**
 * Every Ruby file a body names, as its package and lib-root-relative path. A
 * path through a lib root is bound to that root's package. A bare path is
 * bound, in order, to the one gem a `Ns::X` constant on its own line names;
 * to nothing when the body names the same file through a root; else to the
 * one gem the whole body names — with two, `railtie.rb:97` could be either's.
 */
export function rubyFileMentions(body: string): { pkg: string; file: string }[] {
  const mentions = new Map<string, { pkg: string; file: string }>();
  const add = (pkg: string, file: string) => mentions.set(`${pkg}\u0000${file}`, { pkg, file });
  const bare: { token: string; line: string }[] = [];
  for (const { 0: token, index } of body.matchAll(/[\w./-]+\.rb(?!\w)/g)) {
    const rooted = LIB_ROOTS.map(
      ([root, pkg]) => [new RegExp(`(?:^|/)${escapeRegExp(root)}/`).exec(token), pkg] as const,
    ).find(([match]) => match !== null);
    if (rooted) add(rooted[1], token.slice(rooted[0]!.index + rooted[0]![0].length));
    else if (!/(?:^|\/)(?:lib|test|vendor|railties|active\w*|action\w*)\//.test(token)) {
      const from = body.lastIndexOf("\n", index) + 1;
      const to = body.indexOf("\n", index);
      bare.push({ token, line: body.slice(from, to === -1 ? undefined : to) });
    }
  }
  const bound = [...mentions.values()].map(({ file }) => file);
  const storyPackages = namedPackages(body, true);
  for (const { token, line } of bare) {
    const linePackages = namedPackages(line, false);
    if (linePackages.length === 1) add(linePackages[0], token);
    else if (bound.some((file) => file === token || file.endsWith(`/${token}`))) continue;
    else if (storyPackages.length === 1) add(storyPackages[0], token);
  }
  return [...mentions.values()];
}

/** `name` (or one of its TS spellings) appears after a backtick, `.`, `#` or `::`. */
export function namesMember(body: string, name: string): boolean {
  return [name, ...(rubyMethodToTsIgnoringSkip(name) ?? [])].some((spelling) =>
    new RegExp(`(?:\`|\\.|#|::)${escapeRegExp(spelling)}(?![\\w?!=])`).test(body),
  );
}

export function storySkipConflicts(stories: readonly StoryText[]): StorySkipConflict[] {
  const conflicts: StorySkipConflict[] = [];
  for (const { id: story, status, body } of stories) {
    if (status === "done" || status === "closed") continue;
    for (const { pkg, file: rubyFile } of rubyFileMentions(body)) {
      const entry = unportedSourceEntry(rubyFile, pkg);
      if (entry) {
        conflicts.push({
          story,
          status,
          register: "unported-file",
          pkg,
          rubyFile,
          reason: entry.reason,
        });
      }
      for (const { tsMirrorName, rubyFiles, names, reason } of SCOPED_SKIP_GROUPS) {
        if (tsMirrorName !== undefined || !rubyFiles.includes(rubyFile)) continue;
        for (const name of names.filter((n) => namesMember(body, n))) {
          conflicts.push({ story, status, register: "scoped-skip", pkg, rubyFile, name, reason });
        }
      }
    }
  }
  return conflicts;
}

export function parseStory(id: string, source: string): StoryText {
  const status = /^status:\s*"?([\w-]+)"?\s*$/m.exec(source)?.[1] ?? "";
  return { id, status, body: source.replace(/^---\n[\s\S]*?\n---\n/, "") };
}

/** The first candidate checkout that has an `rfcs/` directory. */
export async function resolveRfcsDir(candidates: readonly string[]): Promise<string | undefined> {
  for (const candidate of candidates) {
    const rfcsDir = path.join(candidate, "rfcs");
    if (
      await readdir(rfcsDir).then(
        () => true,
        () => false,
      )
    )
      return rfcsDir;
  }
  return undefined;
}

async function main(): Promise<number> {
  const { TASKS_DIR, RFCS_DIR, HOME } = process.env;
  const rfcsDir = await resolveRfcsDir(
    [
      TASKS_DIR,
      RFCS_DIR,
      fileURLToPath(new URL("../../tasks", import.meta.url)),
      HOME && path.join(HOME, "github/blazetrailsdev/tasks"),
    ].filter((c): c is string => !!c),
  );
  if (rfcsDir === undefined) {
    console.error("parity:skips:stories: no tasks checkout with rfcs/ found; set $TASKS_DIR.");
    return 1;
  }
  const stories: StoryText[] = [];
  for (const rfc of await readdir(rfcsDir)) {
    const dir = path.join(rfcsDir, rfc, "stories");
    for (const file of await readdir(dir).catch(() => [] as string[])) {
      if (!file.endsWith(".md")) continue;
      stories.push(parseStory(file.slice(0, -3), await readFile(path.join(dir, file), "utf8")));
    }
  }
  const conflicts = storySkipConflicts(stories);
  console.log(
    `story/skip-register conflicts (report-only): ${conflicts.length} row(s) over ` +
      `${new Set(conflicts.map((c) => c.story)).size} open stor(ies)`,
  );
  for (const c of conflicts) {
    const what = c.name === undefined ? c.rubyFile : `${c.rubyFile} ${c.name}`;
    console.log(`  ${c.story} (${c.status})  ${c.register}  ${c.pkg}  ${what}`);
  }
  return 0;
}

async function runAsScript(): Promise<void> {
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
  if (path.resolve(fileURLToPath(import.meta.url)) === invoked) process.exitCode = await main();
}

void runAsScript();
