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
import { SqlLiteral } from "./nodes/sql-literal.js";
import { And } from "./nodes/and.js";
import { Or } from "./nodes/or.js";
import { Grouping } from "./nodes/grouping.js";
import { Case } from "./nodes/case.js";
import { Concat, Contains, Overlaps } from "./nodes/infix-operation.js";
import {
  parseRange,
  betweenFromRange,
  notBetweenFromRange,
  infinitySign,
  unboundableSign,
  isNilBound,
  type RangeHost,
  type RangePredicates,
} from "./predications-range.js";

/**
 * Stands in for Rails' `when Arel::SelectManager` arm (predications.rb:65-74
 * for `in`, 112-121 for `not_in`), duck-typed on the `ast` reader as
 * `buildQuoted` matches managers (casted.ts:41-44) — a structural check keeps
 * the runtime import out. The `instanceof Node` half matters: a bare
 * `"ast" in value` also admits `{ ast: undefined }`, which would build
 * `In(this, undefined)`.
 */
export function isSelectManagerLike(value: unknown): value is { ast: Node } {
  return (
    typeof value === "object" && value !== null && (value as { ast?: unknown }).ast instanceof Node
  );
}

/**
 * Stands in for Rails' `when Enumerable` arm. Ruby's `Enumerable` covers Set,
 * Hash and Range as well as Array, so matching only `Array.isArray` would drop
 * a Set/Map/generator into the scalar arm and silently cast the container
 * itself.
 *
 * Two deliberate edges:
 * - JS strings are iterable, but Ruby's String is NOT Enumerable, so they must
 *   reach `quoted_node`. `typeof value === "object"` excludes them.
 * - A plain JS object is not iterable, so it reaches `quoted_node` — matching
 *   `Object.new` at attribute_test.rb:747-757. Note this DIVERGES for a Ruby
 *   Hash, which IS Enumerable: Rails' `in({a: 1})` takes the `quoted_array`
 *   arm and expands to `[Casted([:a, 1], self)]`, where this casts the object
 *   whole. Ruby's Hash maps to a JS Map (iterable, so it expands correctly);
 *   an object literal is the closer analogue of `Object.new`, so the scalar
 *   arm is the better of the two readings, not an exact one.
 */
export function isEnumerable(value: unknown): value is Iterable<unknown> {
  return typeof value === "object" && value !== null && Symbol.iterator in value;
}

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
  /** @internal */
  quotedArray(others: unknown[]): Node[];
}

function groupedAny(nodes: Node[]): Grouping {
  // Rails' `Or.inject` on [] returns nil; the visitor renders that as
  // `NULL`. Preserve three-valued semantics (NULL is *not* the same as
  // FALSE under SQL: `NULL OR FALSE` is NULL, `FALSE OR FALSE` is FALSE)
  // while still guarding against the `Array#reduce` TypeError on empty.
  if (nodes.length === 0) return new Grouping(new SqlLiteral("NULL", { retryable: true }));
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
  const member = (host as Record<string, unknown>)[methodId];
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
  eq(this: Node & PredicationHost, other: unknown): Equality {
    return new Equality(this, this.quotedNode(other));
  },
  notEq(this: Node & PredicationHost, other: unknown): NotEqual {
    return new NotEqual(this, this.quotedNode(other));
  },
  gt(this: Node & PredicationHost, other: unknown): GreaterThan {
    return new GreaterThan(this, this.quotedNode(other));
  },
  gteq(this: Node & PredicationHost, other: unknown): GreaterThanOrEqual {
    return new GreaterThanOrEqual(this, this.quotedNode(other));
  },
  lt(this: Node & PredicationHost, other: unknown): LessThan {
    return new LessThan(this, this.quotedNode(other));
  },
  lteq(this: Node & PredicationHost, other: unknown): LessThanOrEqual {
    return new LessThanOrEqual(this, this.quotedNode(other));
  },

  isDistinctFrom(this: Node & PredicationHost, other: unknown): IsDistinctFrom {
    return new IsDistinctFrom(this, this.quotedNode(other));
  },
  isNotDistinctFrom(this: Node & PredicationHost, other: unknown): IsNotDistinctFrom {
    return new IsNotDistinctFrom(this, this.quotedNode(other));
  },

  matches(
    this: Node & PredicationHost,
    pattern: unknown,
    escape: string | Node | null = null,
    caseSensitive = false,
  ): Matches {
    // Rails: `Nodes::Matches.new self, quoted_node(other), ...`.
    // `quotedNode` (→ buildQuoted) already unwraps SelectManager/TreeManager
    // `.ast` and passes Nodes through untouched, so we don't need a
    // separate branch for AST-bearing inputs here.
    return new Matches(this, this.quotedNode(pattern), escape, caseSensitive);
  },
  doesNotMatch(
    this: Node & PredicationHost,
    pattern: unknown,
    escape: string | Node | null = null,
    caseSensitive = false,
  ): DoesNotMatch {
    return new DoesNotMatch(this, this.quotedNode(pattern), escape, caseSensitive);
  },
  matchesRegexp(this: Node & PredicationHost, pattern: string, caseSensitive = true): RegexpNode {
    return new RegexpNode(this, this.quotedNode(pattern), caseSensitive);
  },
  doesNotMatchRegexp(
    this: Node & PredicationHost,
    pattern: string,
    caseSensitive = true,
  ): NotRegexp {
    return new NotRegexp(this, this.quotedNode(pattern), caseSensitive);
  },

  in(this: Node & PredicationHost, other: unknown): In {
    // Mirrors Arel::Predications#in:
    //   SelectManager → In(self, other.ast)
    //   Enumerable    → In(self, quoted_array(other))
    //   else          → In(self, quoted_node(other))
    if (isSelectManagerLike(other)) return new In(this, other.ast);
    if (isEnumerable(other)) return new In(this, this.quotedArray([...other]));
    return new In(this, this.quotedNode(other));
  },
  notIn(this: Node & PredicationHost, other: unknown): NotIn {
    if (isSelectManagerLike(other)) return new NotIn(this, other.ast);
    if (isEnumerable(other)) return new NotIn(this, this.quotedArray([...other]));
    return new NotIn(this, this.quotedNode(other));
  },

  // `between` / `notBetween` accept three forms — `[begin, end]`,
  // `{ begin, end, excludeEnd? }`, or `(begin, end, excludeEnd?)` — same
  // as Attribute#between. The decision tree (in predications-range.ts)
  // mirrors Rails' Predications#between (predications.rb): unboundable
  // bounds collapse to In([])/NotIn([]), open-ended bounds reduce to
  // half-comparisons, exclusive end uses `<` / `>=`, and degenerate
  // `b == e` collapses to eq.
  between: function (
    this: Node & PredicationHost & RangeHost & RangePredicates,
    beginOrRange: unknown,
    end?: unknown,
    excludeEnd?: boolean,
  ): Node {
    const range = parseRange(beginOrRange, end, excludeEnd);
    return betweenFromRange(this, range);
  } as {
    (
      this: Node & PredicationHost & RangeHost & RangePredicates,
      range: readonly [unknown, unknown],
    ): Node;
    (
      this: Node & PredicationHost & RangeHost & RangePredicates,
      range: { begin: unknown; end: unknown; excludeEnd?: boolean },
    ): Node;
    (
      this: Node & PredicationHost & RangeHost & RangePredicates,
      begin: unknown,
      end: unknown,
      excludeEnd?: boolean,
    ): Node;
  },

  notBetween: function (
    this: Node & PredicationHost & RangeHost & RangePredicates,
    beginOrRange: unknown,
    end?: unknown,
    excludeEnd?: boolean,
  ): Node {
    const range = parseRange(beginOrRange, end, excludeEnd);
    return notBetweenFromRange(this, range);
  } as {
    (
      this: Node & PredicationHost & RangeHost & RangePredicates,
      range: readonly [unknown, unknown],
    ): Node;
    (
      this: Node & PredicationHost & RangeHost & RangePredicates,
      range: { begin: unknown; end: unknown; excludeEnd?: boolean },
    ): Node;
    (
      this: Node & PredicationHost & RangeHost & RangePredicates,
      begin: unknown,
      end: unknown,
      excludeEnd?: boolean,
    ): Node;
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
  when(this: Node & PredicationHost, right: unknown): Case {
    return new Case(this).when(this.quotedNode(right));
  },
  concat(this: Node, other: Node): Concat {
    return new Concat(this, other);
  },
  contains(this: Node & PredicationHost, other: unknown): Contains {
    return new Contains(this, this.quotedNode(other));
  },
  overlaps(this: Node & PredicationHost, other: unknown): Overlaps {
    return new Overlaps(this, this.quotedNode(other));
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

  // Mirrors Arel::Predications#infinity? (predications.rb:248-250) —
  // `value.respond_to?(:infinite?) && value.infinite?`, which yields the sign
  // because Ruby's `Float#infinite?` returns `1 | -1 | nil`. The decision tree
  // in predications-range.ts reads the sign, so these three expose the same
  // single implementation `between` / `notBetween` above already use rather
  // than a second copy — Rails has exactly one per Ruby file.
  isInfinity(this: PredicationHost, value: unknown): 1 | -1 | 0 {
    void this;
    return infinitySign(value);
  },

  // Mirrors Arel::Predications#unboundable? (predications.rb:252-253) —
  // `value.respond_to?(:unboundable?) && value.unboundable?`. Duck-typed: a
  // bound answers it by exposing `isUnboundable()` (a QueryAttribute bind, or
  // the RangeHandler's out-of-range sentinel). A bare ±Infinity is open-ended,
  // NOT unboundable — Float has no `unboundable?` in Ruby.
  isUnboundable(this: PredicationHost, value: unknown): 1 | -1 | 0 {
    void this;
    return unboundableSign(value);
  },

  // Mirrors Arel::Predications#open_ended? (predications.rb:255-257) —
  // `value.nil? || infinity?(value) || unboundable?(value)`, composed here in
  // Rails' own shape rather than delegating: Ruby dispatches `infinity?` /
  // `unboundable?` through implicit self, so a host overriding either is
  // honored. The protocol logic itself still lives in exactly one place —
  // these call `isInfinity` / `isUnboundable` above, which delegate to
  // predications-range.ts. `betweenFromRange` composes the same three helpers
  // for the extracted `between` body.
  isOpenEnded(
    this: PredicationHost & {
      isInfinity(value: unknown): 1 | -1 | 0;
      isUnboundable(value: unknown): 1 | -1 | 0;
    },
    value: unknown,
  ): boolean {
    return isNilBound(value) || this.isInfinity(value) !== 0 || this.isUnboundable(value) !== 0;
  },
};
