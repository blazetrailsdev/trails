/**
 * Extractor output-schema token for the ts-api cache key.
 *
 * The per-package ts-api cache (`output/ts-api-cache/<pkg>.json` plus the
 * cross-worktree shared store) keys partly on this token. When it changes,
 * every stale entry whose shape predates the change is evicted — without it, an
 * entry cached BEFORE a new per-method field was added is served verbatim
 * WITHOUT the field. That was the PR #4020 trap: `calls` (the call-set
 * dimension) was added to the extractor in PR #4002 but the cache token was not
 * bumped, so a fresh local `pnpm api:compare` served call-less manifests for
 * every package whose source hadn't changed and the call-mismatch gate reported
 * the inverse of reality. Only `API_COMPARE_FORCE=1` recovered fidelity.
 *
 * Two independent inputs make the token self-busting, so adding a field can't
 * silently leave stale entries even if a human forgets a manual bump:
 *
 *   1. {@link EXTRACTOR_OUTPUT_FIELDS} — the declared per-method field set, the
 *      INTENTIONAL token a reviewer can audit. Add a field name here whenever
 *      you add a `MethodInfo` property the extractor populates (see types.ts).
 *   2. The extractor SOURCE content hashes — the BACKSTOP: any edit to the
 *      extractor scripts (which emitting a new field necessarily requires)
 *      changes the token, so even a forgotten (1) can't reintroduce the trap.
 *      This is the same mtime-independent, cross-worktree guard the Ruby
 *      manifest already gets for free by keying on `extract-ruby-api.rb`'s
 *      content (which is why the Ruby cache does NOT share this flaw).
 *
 * Tradeoff: input (2) means ANY edit to the extractor scripts — even a comment
 * — busts the whole cross-worktree TS cache, forcing a ~16s re-extract. That is
 * deliberate and matches the Ruby side: correctness over a warm cache during
 * extractor development, and edits to these files are comparatively rare.
 *
 * Constraints: async fs only, no `node:` specifiers, no `process` references.
 */
import * as fs from "fs/promises";
import * as path from "path";
import { hashParts } from "./shared-cache.js";

/**
 * Base version for output-shape changes that AREN'T a new field name — e.g. a
 * field's value encoding changes while its key stays the same. Pure field
 * ADDITIONS bump the token on their own (via {@link EXTRACTOR_OUTPUT_FIELDS} and
 * the source-hash inputs), so you rarely need to touch this by hand.
 */
export const SCHEMA_VERSION_BASE = 8;

/**
 * Every per-method field the extractor can emit (mirrors `MethodInfo` in
 * types.ts). Adding a property to `MethodInfo` that the extractor populates?
 * Add its emitted key here too, so the schema token changes and stale cache
 * entries missing the field are evicted automatically.
 */
export const EXTRACTOR_OUTPUT_FIELDS = [
  "name",
  "visibility",
  "params",
  "line",
  "file",
  "isStatic",
  "deps",
  "depRefs",
  "calls",
  "internal",
  "option_keys",
  "optionKeys",
] as const;

/**
 * Extractor scripts whose content defines the emitted output shape, relative to
 * the directory passed to {@link extractorSchemaToken}. Any edit busts the
 * token (content-keyed, so it's mtime-independent and matches cross-worktree).
 */
export const EXTRACTOR_SOURCES = ["extract-ts-api.ts", "extract-ts-api-worker.mjs"];

/** sha1 of one extractor source's contents, or "" if it can't be read. */
async function sourceHash(file: string): Promise<string> {
  try {
    return hashParts([await fs.readFile(file, "utf-8")]);
  } catch {
    return "";
  }
}

/**
 * Compute the extractor output-schema token. `dir` is the directory holding the
 * extractor scripts (so the source hashes resolve regardless of cwd/worktree).
 * The result is a short string like `"8-1a2b3c4d5e6f"` used verbatim as the
 * `schemaVersion` field on cache entries and as a prefix on the shared-cache
 * content key.
 */
export async function extractorSchemaToken(dir: string): Promise<string> {
  const srcHashes = await Promise.all(EXTRACTOR_SOURCES.map((f) => sourceHash(path.join(dir, f))));
  const digest = hashParts([
    String(SCHEMA_VERSION_BASE),
    ...EXTRACTOR_OUTPUT_FIELDS,
    ...srcHashes,
  ]).slice(0, 12);
  return `${SCHEMA_VERSION_BASE}-${digest}`;
}
