/**
 * The legacy compare-script spellings RFC 0092 retired, and the scan that keeps
 * them from coming back.
 *
 * `retire-legacy-compare-script-aliases` (#6305) moved every in-repo reference
 * onto `parity:*`; the aliases left in the root `package.json` are a shim for
 * out-of-repo callers and are deleted by `delete-legacy-compare-script-aliases`.
 * Over the three days #6305 was open, sibling PRs merged SEVEN fresh references
 * into `main` that only a hand grep after each rebase caught. Once the shim goes,
 * a reintroduced spelling stops being a stale doc and becomes a broken command
 * in a comment someone copy-pastes.
 *
 * The tokens are ASSEMBLED from their halves rather than written out, so this
 * file and its test are not themselves matches and need no allowlist entry.
 *
 * Hard rules: no node:* imports, no process.* in the library surface (the CLI
 * entry guard in the lint entry point is the sole exception), async fs only.
 */

import * as fs from "fs/promises";
import * as path from "path";

const SEP = ":";

/**
 * The retired spellings, halves joined so the literals never appear in this
 * file. Only the STEMS are listed: a token is matched as a substring, so each
 * one covers its own suffixed variants (the report, reseed, wide and all
 * flavours) without a row of its own.
 */
export const LEGACY_SCRIPT_NAMES: readonly string[] = [
  ["api", "compare"],
  ["api", "drift"],
  ["api", "extra"],
  ["api", "build"],
  ["api", "reasons"],
  ["api", "detached"],
  ["api", "calls"],
  ["api", "arity"],
  ["api", "inheritance"],
  ["api", "pins"],
  ["api", "moves"],
  ["api", "conventions"],
  ["lint", "deps"],
  ["test", "compare"],
  ["test", "assertions", "ratchet"],
  ["test", "stubs"],
  ["fixtures", "compare"],
  ["schema", "compare"],
].map((parts) => parts.join(SEP));

/**
 * The three intentional mentions, each a deprecation note or a historical
 * reference with no `parity:*` counterpart. Nothing else may name a legacy
 * spelling — this list is not where a new reference goes.
 */
export const ALLOWED_PATHS: ReadonlyMap<string, string> = new Map([
  ["CLAUDE.md", "the deprecation notice that tells contributors to write parity:* instead"],
  ["scripts/parity/README.md", "the same notice, in the tooling's own README (line 5)"],
  [
    "docs/infrastructure/prism-codegen-spike.md",
    "historical mentions of the wide call gate — RFC 0084 deleted that script and it has no parity:* counterpart",
  ],
]);

/** Directories the scan never descends into: upstream Ruby and build output. */
export const SKIPPED_DIRS: readonly string[] = ["node_modules", "dist", ".git", "coverage"];

/** `vendor/rails` is upstream Ruby; the rest of `vendor/` (README.md, fetch.ts,
 *  sources.ts) IS in scope — excluding `vendor/` wholesale is the miss the #6305
 *  review caught. The `output/` dirs are gitignored compare artifacts —
 *  generated, gigantic, and rewritten by the CI steps that run before this
 *  gate. */
export const SKIPPED_PATHS: readonly string[] = [
  path.join("vendor", "rails"),
  path.join("scripts", "api-compare", "output"),
  path.join("scripts", "test-compare", "output"),
  path.join("scripts", "fixtures-compare", "output"),
  path.join("scripts", "schema-compare", "output"),
];

const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".yml",
  ".yaml",
  ".sh",
  ".rb",
  ".txt",
]);

export interface LegacyNameHit {
  /** Repo-relative path, POSIX-separated. */
  file: string;
  /** 1-indexed. */
  line: number;
  token: string;
  text: string;
}

/**
 * True for a root-`package.json` line that DEFINES an alias — a legacy key
 * whose value is the `pnpm parity:*` it delegates to. The shim still exists, so
 * its own keys are not violations; any other line of that file is.
 */
export function isAliasDefinition(file: string, text: string): boolean {
  if (file !== "package.json") return false;
  return /^\s*"[a-z:]+"\s*:\s*"pnpm parity:/.test(text);
}

/**
 * Every legacy spelling in `text`. A token preceded by the `parity` prefix is
 * the CURRENT name — every current name has a legacy one as its tail — and is
 * not a hit.
 */
export function scanText(text: string): { line: number; token: string; text: string }[] {
  const hits: { line: number; token: string; text: string }[] = [];
  const lines = text.split("\n");
  for (const [i, line] of lines.entries()) {
    for (const token of LEGACY_SCRIPT_NAMES) {
      let from = 0;
      for (;;) {
        const at = line.indexOf(token, from);
        if (at === -1) break;
        from = at + 1;
        if (line.slice(0, at).endsWith(`parity${SEP}`)) continue;
        hits.push({ line: i + 1, token, text: line.trim() });
        break;
      }
    }
  }
  return hits;
}

async function walk(dir: string, root: string, out: string[]): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full);
    if (entry.isDirectory()) {
      if (SKIPPED_DIRS.includes(entry.name)) continue;
      if (SKIPPED_PATHS.includes(rel)) continue;
      await walk(full, root, out);
    } else if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(rel);
    }
  }
}

/** Every violation under `root`, allowlist and alias shim applied. */
export async function findLegacyScriptNames(root: string): Promise<LegacyNameHit[]> {
  const files: string[] = [];
  await walk(root, root, files);
  files.sort();

  const hits: LegacyNameHit[] = [];
  for (const file of files) {
    const posix = file.split(path.sep).join("/");
    if (ALLOWED_PATHS.has(posix)) continue;
    const text = await fs.readFile(path.join(root, file), "utf8");
    for (const hit of scanText(text)) {
      if (isAliasDefinition(posix, hit.text)) continue;
      hits.push({ file: posix, ...hit });
    }
  }
  return hits;
}

export function reportHits(hits: readonly LegacyNameHit[]): string {
  const lines = hits.map((h) => `  ${h.file}:${h.line}  ${h.token}\n      ${h.text}`);
  return (
    `\nlegacy compare-script spellings: ${hits.length} reference(s) reintroduced.\n\n` +
    `${lines.join("\n")}\n\n` +
    `Every one of these is retired (RFC 0092). Write the parity:* spelling ` +
    `instead — parity:api, parity:api:calls, parity:test, parity:fixtures, ` +
    `parity:schema and friends.\n`
  );
}
