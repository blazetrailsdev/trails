import { Node } from "./nodes/node.js";
import {
  NotEqual,
  GreaterThan,
  GreaterThanOrEqual,
  LessThan,
  LessThanOrEqual,
  NotIn,
  IsDistinctFrom,
  IsNotDistinctFrom,
} from "./nodes/binary.js";
import { Equality } from "./nodes/equality.js";
import { Matches, DoesNotMatch } from "./nodes/matches.js";
import { In } from "./nodes/in.js";
import { Regexp as RegexpNode, NotRegexp } from "./nodes/regexp.js";
import { Quoted } from "./nodes/casted.js";
import { And } from "./nodes/and.js";
import { Or } from "./nodes/or.js";
import { Grouping } from "./nodes/grouping.js";
import { Case } from "./nodes/case.js";
import { Concat, Contains, Overlaps } from "./nodes/infix-operation.js";
import {
  parseRange,
  betweenFromRange,
  notBetweenFromRange,
  type RangeHost,
} from "./predications-range.js";

/**
 * Host contract for the Predications mixin.
 *
 * Implementors provide `quotedNode(other)` which either type-casts (for
 * Attribute) or plain-wraps (for NodeExpression / InfixOperation) — same
 * role Rails' private `quoted_node` method plays inside Predications.
 */
export interface PredicationHost {
  /** @internal */
  quotedNode(other: unknown): Node;
}

function groupedAny(nodes: Node[]): Grouping {
  // Rails' `Or.inject` on [] returns nil; the visitor renders that as
  // `NULL`. Preserve three-valued semantics (NULL is *not* the same as
  // FALSE under SQL: `NULL OR FALSE` is NULL, `FALSE OR FALSE` is FALSE)
  // while still guarding against the `Array#reduce` TypeError on empty.
  if (nodes.length === 0) return new Grouping(new Quoted(null));
  return new Grouping(nodes.reduce((acc, n) => new Or(acc, n)));
}

function groupedAll(nodes: Node[]): Grouping {
  // Match Attribute#groupedAll: an empty And inside a Grouping. The
  // visitor renders this as `()`, same as Rails' empty-And rendering.
  return new Grouping(new And(nodes));
}

// Build the `expr → Node` callback used by groupingAny / groupingAll.
// Resolves a method-id string against the host (with a clear error if
// the name doesn't refer to a callable method) or invokes a closure
// directly. Mirrors Ruby's `send(method_id, expr, *extras)` shape.
function predicationDispatch<T extends PredicationHost>(
  host: T,
  methodId: string | ((this: T, expr: unknown, ...extras: unknown[]) => Node),
  extras: unknown[],
): (expr: unknown) => Node {
  if (typeof methodId === "function") {
    return (expr) => methodId.call(host, expr, ...extras);
  }
  const member = (host as unknown as Record<string, unknown>)[methodId];
  if (typeof member !== "function") {
    throw new TypeError(
      `Predications.groupingAny/All: \`${methodId}\` is not a method on the host (${(host as object).constructor.name})`,
    );
  }
  const fn = member as (...args: unknown[]) => Node;
  return (expr) => fn.call(host, expr, ...extras);
}

/**
 * Predications — predicate-builder mixin.
 *
 * Mirrors: Arel::Predications (activerecord/lib/arel/predications.rb)
 */
export const Predications = {
  eq(this: PredicationHost, other: unknown): Equality {
    return new Equality(this as unknown as Node, this.quotedNode(other));
  },
  notEq(this: PredicationHost, other: unknown): NotEqual {
    return new NotEqual(this as unknown as Node, this.quotedNode(other));
  },
  gt(this: PredicationHost, other: unknown): GreaterThan {
    return new GreaterThan(this as unknown as Node, this.quotedNode(other));
  },
  gteq(this: PredicationHost, other: unknown): GreaterThanOrEqual {
    return new GreaterThanOrEqual(this as unknown as Node, this.quotedNode(other));
  },
  lt(this: PredicationHost, other: unknown): LessThan {
    return new LessThan(this as unknown as Node, this.quotedNode(other));
  },
  lteq(this: PredicationHost, other: unknown): LessThanOrEqual {
    return new LessThanOrEqual(this as unknown as Node, this.quotedNode(other));
  },

  isDistinctFrom(this: PredicationHost, other: unknown): IsDistinctFrom {
    return new IsDistinctFrom(this as unknown as Node, this.quotedNode(other));
  },
  isNotDistinctFrom(this: PredicationHost, other: unknown): IsNotDistinctFrom {
    return new IsNotDistinctFrom(this as unknown as Node, this.quotedNode(other));
  },

  matches(
    this: PredicationHost,
    pattern: unknown,
    escape: string | null = null,
    caseSensitive = false,
  ): Matches {
    // Rails: `Nodes::Matches.new self, quoted_node(other), ...`.
    // `quotedNode` (→ buildQuoted) already unwraps SelectManager/TreeManager
    // `.ast` and passes Nodes through untouched, so we don't need a
    // separate branch for AST-bearing inputs here.
    return new Matches(this as unknown as Node, this.quotedNode(pattern), escape, caseSensitive);
  },
  doesNotMatch(
    this: PredicationHost,
    pattern: unknown,
    escape: string | null = null,
    caseSensitive = false,
  ): DoesNotMatch {
    return new DoesNotMatch(
      this as unknown as Node,
      this.quotedNode(pattern),
      escape,
      caseSensitive,
    );
  },
  matchesRegexp(this: PredicationHost, pattern: string, caseSensitive = true): RegexpNode {
    return new RegexpNode(this as unknown as Node, this.quotedNode(pattern), caseSensitive);
  },
  doesNotMatchRegexp(this: PredicationHost, pattern: string, caseSensitive = true): NotRegexp {
    return new NotRegexp(this as unknown as Node, this.quotedNode(pattern), caseSensitive);
  },

  in(this: PredicationHost, other: unknown[] | { ast: Node } | Node | unknown): In {
    // Mirrors Arel::Predications#in:
    //   SelectManager → In(self, other.ast)
    //   Enumerable    → In(self, quoted_array(other))
    //   else          → In(self, quoted_node(other))
    if (Array.isArray(other)) {
      // Node[] is valid NodeOrValue for In/NotIn — no cast needed.
      return new In(
        this as unknown as Node,
        other.map((v) => this.quotedNode(v)),
      );
    }
    // SelectManager/TreeManager-shaped object: only forward `.ast` when
    // it's actually a Node — anything else falls through to quotedNode
    // so we don't construct a malformed In with a stray non-Node ast.
    if (other && typeof other === "object" && !(other instanceof Node) && "ast" in other) {
      const ast = (other as { ast: unknown }).ast;
      if (ast instanceof Node) return new In(this as unknown as Node, ast);
    }
    return new In(this as unknown as Node, this.quotedNode(other));
  },
  notIn(this: PredicationHost, other: unknown[] | { ast: Node } | Node | unknown): NotIn {
    if (Array.isArray(other)) {
      return new NotIn(
        this as unknown as Node,
        other.map((v) => this.quotedNode(v)),
      );
    }
    if (other && typeof other === "object" && !(other instanceof Node) && "ast" in other) {
      const ast = (other as { ast: unknown }).ast;
      if (ast instanceof Node) return new NotIn(this as unknown as Node, ast);
    }
    return new NotIn(this as unknown as Node, this.quotedNode(other));
  },

  // `between` / `notBetween` accept three forms — `[begin, end]`,
  // `{ begin, end, excludeEnd? }`, or `(begin, end, excludeEnd?)` — same
  // as Attribute#between. The decision tree (in predications-range.ts)
  // mirrors Rails' Predications#between (predications.rb): unboundable
  // bounds collapse to In([])/NotIn([]), open-ended bounds reduce to
  // half-comparisons, exclusive end uses `<` / `>=`, and degenerate
  // `b == e` collapses to eq.
  between: function (
    this: PredicationHost,
    beginOrRange: unknown,
    end?: unknown,
    excludeEnd?: boolean,
  ): Node {
    const range = parseRange(beginOrRange, end, excludeEnd);
    return betweenFromRange(this as unknown as RangeHost, range);
  } as {
    (this: PredicationHost, range: readonly [unknown, unknown]): Node;
    (this: PredicationHost, range: { begin: unknown; end: unknown; excludeEnd?: boolean }): Node;
    (this: PredicationHost, begin: unknown, end: unknown, excludeEnd?: boolean): Node;
  },

  notBetween: function (
    this: PredicationHost,
    beginOrRange: unknown,
    end?: unknown,
    excludeEnd?: boolean,
  ): Node {
    const range = parseRange(beginOrRange, end, excludeEnd);
    return notBetweenFromRange(this as unknown as RangeHost, range);
  } as {
    (this: PredicationHost, range: readonly [unknown, unknown]): Node;
    (this: PredicationHost, range: { begin: unknown; end: unknown; excludeEnd?: boolean }): Node;
    (this: PredicationHost, begin: unknown, end: unknown, excludeEnd?: boolean): Node;
  },

  isNull(this: PredicationHost): Equality {
    return new Equality(this as unknown as Node, new Quoted(null));
  },
  isNotNull(this: PredicationHost): NotEqual {
    return new NotEqual(this as unknown as Node, new Quoted(null));
  },

  // -- _any / _all variants --

  eqAny(this: PredicationHost & { eq(o: unknown): Node }, others: unknown[]): Grouping {
    return groupedAny(others.map((o) => this.eq(o)));
  },
  eqAll(this: PredicationHost & { eq(o: unknown): Node }, others: unknown[]): Grouping {
    return groupedAll(others.map((o) => this.eq(o)));
  },
  notEqAny(this: PredicationHost & { notEq(o: unknown): Node }, others: unknown[]): Grouping {
    return groupedAny(others.map((o) => this.notEq(o)));
  },
  notEqAll(this: PredicationHost & { notEq(o: unknown): Node }, others: unknown[]): Grouping {
    return groupedAll(others.map((o) => this.notEq(o)));
  },
  gtAny(this: PredicationHost & { gt(o: unknown): Node }, others: unknown[]): Grouping {
    return groupedAny(others.map((o) => this.gt(o)));
  },
  gtAll(this: PredicationHost & { gt(o: unknown): Node }, others: unknown[]): Grouping {
    return groupedAll(others.map((o) => this.gt(o)));
  },
  gteqAny(this: PredicationHost & { gteq(o: unknown): Node }, others: unknown[]): Grouping {
    return groupedAny(others.map((o) => this.gteq(o)));
  },
  gteqAll(this: PredicationHost & { gteq(o: unknown): Node }, others: unknown[]): Grouping {
    return groupedAll(others.map((o) => this.gteq(o)));
  },
  ltAny(this: PredicationHost & { lt(o: unknown): Node }, others: unknown[]): Grouping {
    return groupedAny(others.map((o) => this.lt(o)));
  },
  ltAll(this: PredicationHost & { lt(o: unknown): Node }, others: unknown[]): Grouping {
    return groupedAll(others.map((o) => this.lt(o)));
  },
  lteqAny(this: PredicationHost & { lteq(o: unknown): Node }, others: unknown[]): Grouping {
    return groupedAny(others.map((o) => this.lteq(o)));
  },
  lteqAll(this: PredicationHost & { lteq(o: unknown): Node }, others: unknown[]): Grouping {
    return groupedAll(others.map((o) => this.lteq(o)));
  },
  matchesAny(this: PredicationHost & { matches(o: string): Node }, others: string[]): Grouping {
    return groupedAny(others.map((o) => this.matches(o)));
  },
  matchesAll(this: PredicationHost & { matches(o: string): Node }, others: string[]): Grouping {
    return groupedAll(others.map((o) => this.matches(o)));
  },
  doesNotMatchAny(
    this: PredicationHost & { doesNotMatch(o: string): Node },
    others: string[],
  ): Grouping {
    return groupedAny(others.map((o) => this.doesNotMatch(o)));
  },
  doesNotMatchAll(
    this: PredicationHost & { doesNotMatch(o: string): Node },
    others: string[],
  ): Grouping {
    return groupedAll(others.map((o) => this.doesNotMatch(o)));
  },
  inAny(this: PredicationHost & { in(o: unknown[]): Node }, others: unknown[][]): Grouping {
    return groupedAny(others.map((o) => this.in(o)));
  },
  inAll(this: PredicationHost & { in(o: unknown[]): Node }, others: unknown[][]): Grouping {
    return groupedAll(others.map((o) => this.in(o)));
  },
  notInAny(this: PredicationHost & { notIn(o: unknown[]): Node }, others: unknown[][]): Grouping {
    return groupedAny(others.map((o) => this.notIn(o)));
  },
  notInAll(this: PredicationHost & { notIn(o: unknown[]): Node }, others: unknown[][]): Grouping {
    return groupedAll(others.map((o) => this.notIn(o)));
  },
  when(this: PredicationHost, right: unknown): Case {
    return new Case(this as unknown as Node).when(this.quotedNode(right));
  },
  concat(this: Node, other: Node): Concat {
    return new Concat(this, other);
  },
  contains(this: PredicationHost, other: unknown): Contains {
    return new Contains(this as unknown as Node, this.quotedNode(other));
  },
  overlaps(this: PredicationHost, other: unknown): Overlaps {
    return new Overlaps(this as unknown as Node, this.quotedNode(other));
  },
  quotedArray(this: PredicationHost, others: unknown[]): Node[] {
    return others.map((v) => this.quotedNode(v));
  },

  // -- Rails-private helpers (mixed in alongside the public API for
  //    surface fidelity; not referenced internally because the existing
  //    *_any/*_all impls call the file-level groupedAny/groupedAll
  //    above with already-built nodes). --

  // Mirrors Arel::Predications#grouping_any(method_id, others, *extras)
  // — calls `this[methodId](expr, ...extras)` on each value and folds
  // the resulting nodes with OR inside a Grouping. The closure variant
  // lets TS callers skip stringly-typed dispatch. Generic over the
  // host type so a class like Attribute (with a richer surface than
  // bare PredicationHost) can pass typed closures without `as` casts.
  groupingAny<T extends PredicationHost>(
    this: T,
    methodId: string | ((this: T, expr: unknown, ...extras: unknown[]) => Node),
    others: unknown[],
    ...extras: unknown[]
  ): Grouping {
    return groupedAny(others.map(predicationDispatch(this, methodId, extras)));
  },

  // Mirrors Arel::Predications#grouping_all — fold with AND.
  groupingAll<T extends PredicationHost>(
    this: T,
    methodId: string | ((this: T, expr: unknown, ...extras: unknown[]) => Node),
    others: unknown[],
    ...extras: unknown[]
  ): Grouping {
    return groupedAll(others.map(predicationDispatch(this, methodId, extras)));
  },

  // Mirrors Arel::Predications#infinity? — in the TS port, true only
  // for JavaScript +/-Infinity values. Ruby's `infinite?` protocol
  // (which Rails also accepts) has no TS analog; if a future Trails
  // wrapper type wants to surface infiniteness, this is the place to
  // teach it. Used to decide whether to clamp a `between` bound to
  // an open half-range.
  isInfinity(this: PredicationHost, value: unknown): boolean {
    return value === Infinity || value === -Infinity;
  },

  // Mirrors Arel::Predications#unboundable? — Rails-side, this catches
  // values that can't be compared (e.g. an unboundable bind value).
  // The TS port has no analog of Ruby's `unboundable?` protocol, so
  // this returns false; kept for surface fidelity.
  isUnboundable(this: PredicationHost, value: unknown): boolean {
    void this;
    void value;
    return false;
  },

  // Mirrors Arel::Predications#open_ended? — null, infinite, or
  // unboundable values are treated as "no bound on this side".
  // Dispatches `isInfinity` / `isUnboundable` through `this` (rather
  // than calling the Predications module directly) so host classes
  // can override either check. Mirrors Ruby's method-lookup semantics
  // for `infinity?` / `unboundable?`.
  isOpenEnded(
    this: PredicationHost & {
      isInfinity(value: unknown): boolean;
      isUnboundable(value: unknown): boolean;
    },
    value: unknown,
  ): boolean {
    return (
      value === null || value === undefined || this.isInfinity(value) || this.isUnboundable(value)
    );
  },
};
