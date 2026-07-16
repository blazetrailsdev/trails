/**
 * Shared types for the Prism → JS deterministic codegen spike.
 *
 * Prism's WASM build yields node objects whose kind is `constructor.name`
 * ("CallNode", "DefNode", …) and whose children are reachable both via named
 * getters and the generic `compactChildNodes()`. We type them loosely as
 * `PrismNode` — the registry keys off the runtime kind string, so a precise
 * union would only fight the visitor pattern this spike is demonstrating.
 */
export interface PrismNode {
  constructor: { name: string };
  compactChildNodes(): PrismNode[];
  // Named fields accessed opportunistically by handlers; typed as unknown so
  // each handler narrows what it actually touches.
  [field: string]: unknown;
}

/** A node handler emits source text for one Prism node kind. */
export type Handler = (node: PrismNode, e: Emitter) => string;

/**
 * Prism exposes a string literal's decoded text as an `unescaped` object
 * `{ encoding, validEncoding, value }`, not a bare string. This pulls the
 * `.value` out (tolerating the plain-string shape too, defensively).
 */
export function rubyStr(unescaped: unknown): string {
  if (unescaped && typeof unescaped === "object" && "value" in unescaped) {
    return String((unescaped as { value: unknown }).value);
  }
  return String(unescaped ?? "");
}

/**
 * The emitter walks the AST through the registry, recording coverage as it
 * goes. Handlers recurse by calling `e.emit(child)` rather than dispatching
 * themselves — that keeps the registry the single dispatch surface and means
 * every visited node is counted exactly once.
 */
export interface Emitter {
  emit(node: PrismNode | null | undefined): string;
  /** Join a StatementsNode's children as newline-separated statements. */
  emitBody(node: PrismNode | null | undefined): string;
  /** Indent a (possibly multi-line) block by one level. */
  indent(src: string): string;
  readonly coverage: Coverage;
  /**
   * True while emitting the body of a `class`. Toggles `def` between JS method
   * syntax (in a class) and an exported free function (module-level, matching
   * the repo's `this`-typed mixin pattern minus the TS types).
   */
  inClass: boolean;
}

/** Per-kind tally of handled vs. passthrough node instances. */
export interface Coverage {
  record(kind: string, handled: boolean): void;
  readonly counts: Map<string, { handled: number; passthrough: number }>;
}
