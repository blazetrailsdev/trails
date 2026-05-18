/**
 * A `TscPlugin` lets a framework package teach `trails-tsc` how to
 * rewrite source files before the TypeScript compiler sees them.
 * Plugins are matched by file extension; the host substitutes the
 * returned `ts` for the file's on-disk contents (or skips on `null`).
 *
 * `activerecord` will register an `ar-models` plugin that synthesizes
 * `declare <col>: <type>` lines on Base-extending classes;
 * `actionview` will register a `.tse` plugin that compiles
 * embedded-TS templates into typed render functions.
 */
export interface TscPlugin {
  /** Stable identifier (convention: lowercase-kebab). */
  readonly name: string;
  /** File extensions (with leading dot) this plugin claims. */
  readonly extensions: readonly string[];
  /** Virtualize a source file. Return `null` to leave it untouched. */
  virtualize(filePath: string, source: string): VirtualizeOutput | null;
}

export interface VirtualizeOutput {
  /** The substituted TypeScript source. */
  ts: string;
  /** Optional line-mapping metadata for diagnostic remap. */
  deltas?: readonly LineDelta[];
}

/**
 * Line-mapping record produced by a virtualizing plugin.
 * `insertedAtLine` is the 0-indexed line in the VIRTUALIZED text
 * where an injected block begins (sentinel `-1` = prepended above
 * line 0); the block spans `lineCount` virtual lines.
 */
export interface LineDelta {
  insertedAtLine: number;
  lineCount: number;
}
