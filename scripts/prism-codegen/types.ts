/**
 * Shared types for the Prism → JS deterministic codegen spike.
 *
 * Prism's WASM build yields node objects whose kind is `constructor.name`
 * ("CallNode", "DefNode", …) and whose children are reachable both via named
 * getters and the generic `compactChildNodes()`. We type them loosely as
 * `PrismNode` — the registry keys off the runtime kind string, so a precise
 * union would only fight the visitor pattern this spike is demonstrating.
 *
 * Handlers build TypeScript AST nodes (`ts.factory`), not strings: a handled
 * node is one for which a WELL-FORMED JS node with already-decided semantics
 * exists. A handler that hits a case it cannot represent returns `null`, which
 * the emitter records as passthrough — there is deliberately no raw-text
 * escape hatch, so unparseable output is impossible by construction.
 */
import type ts from "typescript";

export interface PrismNode {
  constructor: { name: string };
  compactChildNodes(): PrismNode[];
  // Named fields accessed opportunistically by handlers; typed as unknown so
  // each handler narrows what it actually touches.
  [field: string]: unknown;
}

/**
 * An expression handler builds a `ts.Expression` for one Prism node kind, or
 * returns `null` to decline (→ recorded as passthrough by the emitter).
 */
export type ExprHandler = (node: PrismNode, e: Emitter) => ts.Expression | null;

/**
 * A statement handler builds the statement list for one Prism node kind at
 * statement position. `isLast` is true for the final statement of a method
 * body (Ruby's implicit return); handlers propagate it into branches.
 * Returning `null` declines → the emitter falls back to expression position.
 */
export type StmtHandler = (node: PrismNode, e: Emitter, isLast: boolean) => ts.Statement[] | null;

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
 * goes. Handlers recurse by calling `e.expr(child)` / `e.stmts(...)` rather
 * than dispatching themselves — that keeps the registry the single dispatch
 * surface and means every dispatched node is counted exactly once.
 */
export interface Emitter {
  /** Emit an expression for a node (passthrough marker if unhandled). */
  expr(node: PrismNode | null | undefined): ts.Expression;
  /** Emit one statement-position node. */
  stmt(node: PrismNode, isLast: boolean): ts.Statement[];
  /** Emit a StatementsNode (or single node) as a statement list. */
  stmts(node: PrismNode | null | undefined, implicitReturn: boolean): ts.Statement[];
  readonly coverage: Coverage;
  /**
   * Per-method attribution: for each emitted def, how many nodes were
   * dispatched inside it and how many fell to passthrough. A method with zero
   * passthrough is one whose generated body the tool fully understood — the
   * trustworthy denominator for any generated-vs-port comparison.
   */
  readonly perDef: Map<string, { total: number; passthrough: number }>;
  /** Name of the def currently being emitted (coverage attribution). */
  currentDef: string;
  /**
   * True while emitting the body of a `class`. Toggles `def` between JS method
   * syntax (in a class) and an exported free function (module-level, matching
   * the repo's `this`-typed mixin pattern minus the TS types).
   */
  inClass: boolean;
  /** True inside `class << self` — defs become static members. */
  inSingleton: boolean;
  /**
   * Method names the hand-ported trails TS declares `async` (the source of
   * truth for async — see async-source.ts). A `def` whose name is in this set
   * is emitted `async`; calls to these names are `await`ed inside async bodies.
   */
  readonly asyncMethods: ReadonlySet<string>;
  /** True while emitting the body of a method that was marked `async`. */
  inAsyncMethod: boolean;
  /**
   * Locals assigned in the current function scope. First-write registration
   * lets the def emitter hoist a single `let a, b;` declaration, so writes are
   * plain assignments (Ruby has no declaration statement to translate).
   */
  readonly declared: Set<string>;
}

/** Per-kind tally of handled vs. passthrough node instances. */
export interface Coverage {
  record(kind: string, handled: boolean): void;
  readonly counts: Map<string, { handled: number; passthrough: number }>;
}
