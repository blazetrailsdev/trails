/**
 * Glob — thin wrapper around `tinyglobby`.
 *
 * Phase 1 trailties consumers (`Paths`, `SourceAnnotationExtractor`,
 * `CodeStatistics`, app-template DSL) need filesystem globbing. We
 * delegate to `tinyglobby` (picomatch-based, ~15kB, the same engine
 * used by fast-glob) rather than re-implementing the matcher.
 *
 * Browser support is intentionally deferred — `tinyglobby` uses Node's
 * `fs` directly. When the browser-adapter PR lands, this file will gain
 * a runtime branch that swaps in a vfs-aware implementation.
 */

import { glob as tinyglob } from "tinyglobby";

export interface GlobOptions {
  /** Directory to glob from. Defaults to the process cwd. */
  cwd?: string;
  /** Include dotfiles. Default false. */
  dot?: boolean;
}

/**
 * Match paths (files AND directories) relative to `cwd` using
 * picomatch-style patterns. Mirrors Ruby `Dir.glob`'s default behavior
 * of returning both files and directories — needed by Phase 1 consumers
 * that walk `app/models/*` and similar.
 *
 * Supports `*`, `**`, `?`, `[abc]`, `{a,b}`, leading `!` for negation.
 * Returns paths relative to `cwd`, sorted.
 */
export async function glob(patterns: string | string[], opts: GlobOptions = {}): Promise<string[]> {
  const results = await tinyglob(patterns, {
    cwd: opts.cwd,
    dot: opts.dot ?? false,
    onlyFiles: false,
  });
  return results.sort();
}
