#!/usr/bin/env npx tsx
/**
 * Open stories that ask to port something a skip register says is unportable
 * (RFC 0156). Report-only.
 *
 *   pnpm parity:skips:stories
 *
 * A register row says "no TS counterpart is expected"; an open story naming the
 * same Ruby surface says "port it". One of the two is wrong, and nothing else
 * notices. Two registers are read:
 *
 * - `UNPORTED_FILES` (`unported-files/`): a story whose body names a Ruby file
 *   `isSourceUnported` excludes.
 * - `SCOPED_SKIP_GROUPS` (`conventions.ts`): a story whose body names one of a
 *   group's `rubyFiles` AND, in code position (after a backtick, `.`, `#` or
 *   `::`), one of its `names` or that name's TS spelling.
 *
 * A Ruby file counts only when the body says which gem it is in — a path
 * through a vendored package's lib root, as `rubyFileMentions` reads it. A bare
 * `railtie.rb` names a file in half the packages, and the registers are keyed
 * per package.
 *
 * Stories are read from the tasks checkout this worktree links at `tasks/`;
 * "open" is any `status:` other than `done` / `closed` in the exported
 * frontmatter.
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

export interface RubyFileMention {
  pkg: string;
  file: string;
}

const CLOSED_STATUSES = new Set(["done", "closed"]);

/**
 * Lib-root namespace directory → parity package, from each vendored package's
 * `libPath` (`activesupport/lib/active_support` → `active_support`), longest
 * first so `rack/session` wins over `rack`.
 */
export const LIB_ROOTS: ReadonlyMap<string, string> = new Map(
  SOURCES.flatMap((source) =>
    source.packages.flatMap((pkg): [string, string][] => {
      const root = pkg.libPath.split(/(?:^|\/)lib\//)[1] ?? "";
      return root === "" ? [] : [[root, pkg.name]];
    }),
  ).sort(([a], [b]) => b.length - a.length),
);

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Every Ruby file a body names under a known lib root, as the package and the
 * root-relative path the registers key on
 * (`vendor/rails/activesupport/lib/active_support/test_case.rb:23` →
 * `activesupport`, `test_case.rb`).
 */
export function rubyFileMentions(body: string): RubyFileMention[] {
  const mentions = new Map<string, RubyFileMention>();
  for (const [token] of body.matchAll(/[\w./-]+\.rb(?!\w)/g)) {
    for (const [root, pkg] of LIB_ROOTS) {
      const match = new RegExp(`(?:^|/)${escapeRegExp(root)}/`).exec(token);
      if (!match) continue;
      const file = token.slice(match.index + match[0].length);
      mentions.set(`${pkg}\u0000${file}`, { pkg, file });
      break;
    }
  }
  return [...mentions.values()];
}

/** `name` (or one of its TS spellings) appears in code position. */
export function namesMember(body: string, name: string): boolean {
  const spellings = [name, ...(rubyMethodToTsIgnoringSkip(name) ?? [])];
  return spellings.some((spelling) =>
    new RegExp(`(?:\`|\\.|#|::)${escapeRegExp(spelling)}(?![\\w?!=])`).test(body),
  );
}

export function storySkipConflicts(stories: readonly StoryText[]): StorySkipConflict[] {
  const conflicts: StorySkipConflict[] = [];
  for (const { id, status, body } of stories) {
    if (CLOSED_STATUSES.has(status)) continue;
    for (const { pkg, file } of rubyFileMentions(body)) {
      const entry = unportedSourceEntry(file, pkg);
      if (entry) {
        conflicts.push({
          story: id,
          status,
          register: "unported-file",
          pkg,
          rubyFile: file,
          reason: entry.reason,
        });
      }
      for (const group of SCOPED_SKIP_GROUPS) {
        if (!group.rubyFiles.includes(file)) continue;
        for (const name of group.names) {
          if (!namesMember(body, name)) continue;
          conflicts.push({
            story: id,
            status,
            register: "scoped-skip",
            pkg,
            rubyFile: file,
            name,
            reason: group.reason,
          });
        }
      }
    }
  }
  return conflicts;
}

/** The story id, `status:` and body of one story file. */
export function parseStory(id: string, source: string): StoryText {
  const status = /^status:\s*"?([\w-]+)"?\s*$/m.exec(source)?.[1] ?? "";
  const body = source.replace(/^---\n[\s\S]*?\n---\n/, "");
  return { id, status, body };
}

async function readStories(rfcsDir: string): Promise<StoryText[]> {
  const stories: StoryText[] = [];
  for (const rfc of await readdir(rfcsDir)) {
    const storiesDir = path.join(rfcsDir, rfc, "stories");
    let files: string[];
    try {
      files = await readdir(storiesDir);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      const source = await readFile(path.join(storiesDir, file), "utf8");
      stories.push(parseStory(file.slice(0, -3), source));
    }
  }
  return stories;
}

async function main(): Promise<void> {
  const rfcsDir = fileURLToPath(new URL("../../tasks/rfcs/", import.meta.url));
  const conflicts = storySkipConflicts(await readStories(rfcsDir));
  console.log(
    `story/skip-register conflicts (report-only): ${conflicts.length} row(s) over ` +
      `${new Set(conflicts.map((c) => c.story)).size} open stor(ies)`,
  );
  for (const c of conflicts) {
    const what = c.name === undefined ? c.rubyFile : `${c.rubyFile} ${c.name}`;
    console.log(`  ${c.story} (${c.status})  ${c.register}  ${c.pkg}  ${what}`);
  }
}

async function runAsScript(): Promise<void> {
  const self = fileURLToPath(import.meta.url);
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
  if (path.resolve(self) !== invoked) return;
  await main();
}

void runAsScript();
