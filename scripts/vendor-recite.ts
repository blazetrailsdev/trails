#!/usr/bin/env -S npx tsx
// Rewrite every tracked `vendor/<source>/…` citation to name the source's
// active version directory: `vendor/<source>/<activeVersion>/…` (RFC 0159).
//
// CLI:
//   tsx scripts/vendor-recite.ts [--check]
//
//   --check:  report the files that would change, write nothing, and exit
//             non-zero when there is at least one.
//
// An unversioned citation gains the segment, a correctly versioned one is left
// alone, and a stale one — naming a version that is not the active one — has
// its segment replaced. Sources and versions come from vendor/sources.ts, the
// registry the resolvers read, so a citation is rewritten to exactly the tree
// the comparers see.

import { execFile } from "node:child_process";
import { lstat, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { activeVersion, SOURCES } from "../vendor/sources.js";

const execFileAsync = promisify(execFile);

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Tracked paths the rewrite never touches, because what they hold is code that
 * matches or builds a citation, or a fixture for such code — not a citation.
 * A key ending in `/` excludes the whole directory. Every entry names why.
 */
export const EXCLUDED: Readonly<Record<string, string>> = {
  // The registry, its tests, README and lockfile spell source paths as data.
  "vendor/": "registry data, not citations",
  // `CITATION` (:36) matches citations and the message templates (:158-169) build them.
  "eslint/ruby-compat-needs-mri-citation.mjs": "matches and builds citations",
  "eslint/ruby-compat-needs-mri-citation.test.mjs": "fixtures for the citation rule's resolver",
  "scripts/api-compare/jsdoc-tag-line.test.ts": "fixtures for the tag-line parser",
  // `SKIPPED_PATHS` is a `vendor/rails` prefix match over the file tree.
  "scripts/parity/legacy-script-names.ts": "SKIPPED_PATHS is a path prefix, not a citation",
  "scripts/vendor-recite.ts": "this codemod",
  "scripts/vendor-recite.test.ts": "the codemod's input-shape fixtures",
};

export function isExcluded(path: string): boolean {
  return Object.keys(EXCLUDED).some((key) =>
    key.endsWith("/") ? path.startsWith(key) : path === key,
  );
}

const VERSION_SEGMENT = /^v\d[\w.-]*$/;

function citationPattern(): RegExp {
  const names = SOURCES.map((s) => s.name.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&"));
  return new RegExp(`\\bvendor\\/(${names.join("|")})\\/([\\w.+-]+)(\\/?)`, "g");
}

/** `text` with every citation naming its source's active version. */
export function reciteText(text: string): string {
  return text.replace(citationPattern(), (_match, name: string, segment: string, slash: string) => {
    const version = activeVersion(SOURCES.find((s) => s.name === name)!);
    if (VERSION_SEGMENT.test(segment)) return `vendor/${name}/${version}${slash}`;
    return `vendor/${name}/${version}/${segment}${slash}`;
  });
}

/**
 * Recite each of `paths` (relative to `root`) in place and return the ones
 * that changed. With `check`, nothing is written.
 */
export async function recite(
  root: string,
  paths: readonly string[],
  opts: { check?: boolean } = {},
): Promise<string[]> {
  const changed: string[] = [];
  for (const path of paths) {
    if (isExcluded(path)) continue;
    const file = join(root, path);
    // A tracked symlink or submodule is not a text file of its own.
    if (!(await lstat(file)).isFile()) continue;
    const text = await readFile(file, "utf8");
    if (text.includes("\0")) continue;
    const next = reciteText(text);
    if (next === text) continue;
    changed.push(path);
    if (!opts.check) await writeFile(file, next);
  }
  return changed;
}

async function trackedFiles(root: string): Promise<string[]> {
  const { stdout } = await execFileAsync("git", ["ls-files", "-z"], {
    cwd: root,
    maxBuffer: 256 * 1024 * 1024,
  });
  return stdout.split("\0").filter(Boolean);
}

async function main(argv: string[]): Promise<number> {
  const check = argv.includes("--check");
  const unknown = argv.filter((a) => a !== "--check");
  if (unknown.length > 0) throw new Error(`unknown flag: ${unknown[0]}`);

  const changed = await recite(REPO_ROOT, await trackedFiles(REPO_ROOT), { check });
  for (const path of changed) console.log(`${check ? "would recite" : "recited"} ${path}`);
  console.log(`${changed.length} file(s) ${check ? "carry a citation to recite" : "recited"}`);
  return check && changed.length > 0 ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    },
  );
}
