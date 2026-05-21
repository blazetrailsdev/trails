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
 *
 * `insertedAtLine` is the 0-indexed virtual line IMMEDIATELY BEFORE
 * the injected block — i.e., the start coordinate is exclusive. The
 * injected lines themselves are `insertedAtLine + 1 .. insertedAtLine + lineCount`
 * (inclusive on both ends); those virtual lines have no original-source
 * counterpart and `remapLine()` returns `null` for them. Later virtual
 * lines are shifted up by `lineCount` to recover original-source lines.
 *
 * The sentinel value `-1` means the block was prepended ABOVE virtual
 * line 0 — so a header of length N occupies virtual lines `0..N-1`.
 *
 * Plugins emitting a trailing footer should use
 * `insertedAtLine: <last unmapped body line>`; the next `lineCount`
 * virtual lines are then treated as injected.
 */
export interface LineDelta {
  insertedAtLine: number;
  lineCount: number;
}
