#!/usr/bin/env npx tsx
/**
 * `pnpm parity:skips:stories` (RFC 0156, report-only): open stories that ask to
 * port what a skip register says is unportable. A story conflicts with
 * `UNPORTED_FILES` when it names a Ruby file `isSourceUnported` excludes, and
 * with a mirrorless `SCOPED_SKIP_GROUPS` group when it names one of the
 * group's `rubyFiles` and, in code position, one of its `names`.
 *
 * The registers are keyed per package, so a file counts once the body says
 * which gem it is in: a path through a vendored lib root, or a bare path beside
 * that gem's namespace (`test_case.rb` with `ActiveSupport::TestCase`).
 *
 * Stories come from the checkout `scripts/tasks/tasks.sh` would use; "open" is
 * any exported `status:` other than `done` / `closed`.
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

/** Every Ruby file a body names, as its package and lib-root-relative path. */
export function rubyFileMentions(body: string): { pkg: string; file: string }[] {
  const mentions = new Map<string, { pkg: string; file: string }>();
  const constants = [...body.matchAll(/(?<![\w:])[A-Z]\w*(?:::[A-Z]\w*)+/g)].map(([c]) =>
    c.toLowerCase(),
  );
  const namedPackages = LIB_ROOTS.filter(([root]) => {
    const namespace = root.replace(/\//g, "::").replace(/_/g, "").toLowerCase();
    return constants.some((c) => c.startsWith(`${namespace}::`));
  }).map(([, pkg]) => pkg);
  for (const [token] of body.matchAll(/[\w./-]+\.rb(?!\w)/g)) {
    const rooted = LIB_ROOTS.map(
      ([root, pkg]) => [new RegExp(`(?:^|/)${escapeRegExp(root)}/`).exec(token), pkg] as const,
    ).find(([match]) => match !== null);
    const pkgs = rooted
      ? [rooted[1]]
      : /(?:^|\/)(?:lib|test|vendor|railties|active\w*|action\w*)\//.test(token)
        ? []
        : namedPackages;
    const file = rooted ? token.slice(rooted[0]!.index + rooted[0]![0].length) : token;
    for (const pkg of pkgs) mentions.set(`${pkg}\u0000${file}`, { pkg, file });
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
