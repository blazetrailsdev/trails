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
  Between,
} from "./nodes/binary.js";
import { Equality } from "./nodes/equality.js";
import { Matches, DoesNotMatch } from "./nodes/matches.js";
import { In } from "./nodes/in.js";
import { Regexp as RegexpNode, NotRegexp } from "./nodes/regexp.js";
import { SqlLiteral } from "./nodes/sql-literal.js";
import { And, Or } from "./nodes/nary.js";
import { Grouping } from "./nodes/grouping.js";
import { Case } from "./nodes/case.js";
import { Concat, Contains, Overlaps } from "./nodes/infix-operation.js";
import { rbEqual } from "@blazetrails/activesupport";

/**
 * Stands in for Rails' `when Arel::SelectManager` arm (predications.rb:65-74
 * for `in`, 112-121 for `not_in`), duck-typed on the `ast` reader as
 * `buildQuoted` matches managers (casted.ts:41-44) — a structural check keeps
 * the runtime import out. The `instanceof Node` half matters: a bare
 * `"ast" in value` also admits `{ ast: undefined }`, which would build
 * `In(this, undefined)`. A `Node` is excluded: it is the `else`-arm value
 * itself, not a manager wrapping one.
 */
function isSelectManagerLike(value: unknown): value is { ast: Node } {
  return (
    typeof value === "object" &&
    value !== null &&
    !(value instanceof Node) &&
    (value as { ast?: unknown }).ast instanceof Node
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
 * - **A plain JS object casts whole rather than expanding.** Ruby's Hash IS
 *   Enumerable, so Rails' `in({a: 1})` takes the `quoted_array` arm and
 *   expands to `[Casted([:a, 1], self)]`. There is no single JS value that is
 *   both the Hash analogue and the `Object.new` analogue, so the two Ruby arms
 *   are split across two JS types: a `Map` is the Hash analogue and is
 *   iterable, so it expands through this guard exactly as Ruby's Hash does; an
 *   object literal is the `Object.new` analogue and correctly reaches
 *   `quoted_node` (attribute_test.rb:747-757). Passing an object literal to
 *   `in` / `notIn` therefore casts the container — use a `Map` to get Ruby
 *   Hash pair-expansion. This is a decided split, not an accident; both arms
 *   are pinned by tests.
 */
function isEnumerable(value: unknown): value is Iterable<unknown> {
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

/**
 * The two private folders from Arel::Predications (grouping_any /
 * grouping_all). Declared structurally so the *_any/*_all variants can
 * name them in their `this` types without referring to `Predications`
 * while it is still being defined.
 *
 * Mirrors the real signatures below, closure arm included -- a host typed
 * through this interface keeps the closure form. The assertion after the
 * mixin pins the two declarations together so they cannot drift.
 */
export interface GroupingFolders {
  /** @internal */
  groupingAny<T extends PredicationHost>(
    this: T,
    methodId: string | ((this: T, expr: unknown, ...extras: unknown[]) => Node),
    others: unknown[],
    ...extras: unknown[]
  ): Grouping;
  /** @internal */
  groupingAll<T extends PredicationHost>(
    this: T,
    methodId: string | ((this: T, expr: unknown, ...extras: unknown[]) => Node),
    others: unknown[],
    ...extras: unknown[]
  ): Grouping;
}

/**
 * The `self` half of Rails' `between` contract. `between` / `not_between`
 * (predications.rb:36-61, 84-110) and `open_ended?` (:255-257) dispatch these
 * on implicit self, so an including class overriding one is honored — declared
 * structurally for the same reason {@link GroupingFolders} is: the bodies below
 * cannot name `Predications` while it is still being defined.
 */
interface RangePredicates {
  /** @internal */
  isInfinity(value: unknown): 1 | -1 | 0;
  /** @internal */
  isUnboundable(value: unknown): 1 | -1 | 0;
  /** @internal */
  isOpenEnded(value: unknown): boolean;
  /** @internal */
  in(values: unknown[]): Node;
  /** @internal */
  notIn(values: unknown[]): Node;
  /** @internal */
  eq(other: unknown): Node;
  /** @internal */
  gt(right: unknown): Node;
  /** @internal */
  gteq(right: unknown): Node;
  /** @internal */
  lt(right: unknown): Node;
  /** @internal */
  lteq(right: unknown): Node;
}

interface InfiniteLike {
  isInfinite?: () => 1 | -1 | false;
}

interface UnboundableLike {
  isUnboundable?: () => 1 | -1 | false;
}

/** The receiver `between` / `notBetween` dispatch their whole tree through. */
type BetweenHost = Node & PredicationHost & RangePredicates;

/**
 * The JS analogue of the Ruby Range `between` / `not_between` take
 * (predications.rb:36, :84): the `begin` / `end` / `exclude_end?` trio, and
 * nothing else — those bodies read no other member off `other`.
 */
export interface RangeLike {
  begin: unknown;
  end: unknown;
  excludeEnd?: boolean;
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
  gt(this: Node & PredicationHost, right: unknown): GreaterThan {
    return new GreaterThan(this, this.quotedNode(right));
  },
  gteq(this: Node & PredicationHost, right: unknown): GreaterThanOrEqual {
    return new GreaterThanOrEqual(this, this.quotedNode(right));
  },
  lt(this: Node & PredicationHost, right: unknown): LessThan {
    return new LessThan(this, this.quotedNode(right));
  },
  lteq(this: Node & PredicationHost, right: unknown): LessThanOrEqual {
    return new LessThanOrEqual(this, this.quotedNode(right));
  },

  isDistinctFrom(this: Node & PredicationHost, other: unknown): IsDistinctFrom {
    return new IsDistinctFrom(this, this.quotedNode(other));
  },
  isNotDistinctFrom(this: Node & PredicationHost, other: unknown): IsNotDistinctFrom {
    return new IsNotDistinctFrom(this, this.quotedNode(other));
  },

  matches(
    this: Node & PredicationHost,
    other: unknown,
    escape: string | Node | null = null,
    caseSensitive = false,
  ): Matches {
    // Rails: `Nodes::Matches.new self, quoted_node(other), ...`.
    // `quotedNode` (→ buildQuoted) already unwraps SelectManager/TreeManager
    // `.ast` and passes Nodes through untouched, so we don't need a
    // separate branch for AST-bearing inputs here.
    return new Matches(this, this.quotedNode(other), escape, caseSensitive);
  },
  doesNotMatch(
    this: Node & PredicationHost,
    other: unknown,
    escape: string | Node | null = null,
    caseSensitive = false,
  ): DoesNotMatch {
    return new DoesNotMatch(this, this.quotedNode(other), escape, caseSensitive);
  },
  matchesRegexp(this: Node & PredicationHost, other: string, caseSensitive = true): RegexpNode {
    return new RegexpNode(this, this.quotedNode(other), caseSensitive);
  },
  doesNotMatchRegexp(this: Node & PredicationHost, other: string, caseSensitive = true): NotRegexp {
    return new NotRegexp(this, this.quotedNode(other), caseSensitive);
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

  // Mirrors Arel::Predications#between (predications.rb:36-61).
  between(this: BetweenHost, other: RangeLike): Node {
    if (this.isUnboundable(other.begin) === 1 || this.isUnboundable(other.end) === -1) {
      return this.in([]);
    } else if (this.isOpenEnded(other.begin)) {
      if (this.isOpenEnded(other.end)) {
        if (this.isInfinity(other.begin) === 1 || this.isInfinity(other.end) === -1) {
          return this.in([]);
        } else {
          return this.notIn([]);
        }
      } else if (other.excludeEnd) {
        return this.lt(other.end);
      } else {
        return this.lteq(other.end);
      }
    } else if (this.isOpenEnded(other.end)) {
      return this.gteq(other.begin);
    } else if (other.excludeEnd) {
      return this.gteq(other.begin).and(this.lt(other.end));
    } else if (rbEqual(other.begin, other.end)) {
      // predications.rb:56's `==` is a value comparison; `===` covers only its
      // identity arm, so two equal Dates would not collapse.
      return this.eq(other.begin);
    } else {
      const left = this.quotedNode(other.begin);
      const right = this.quotedNode(other.end);
      return new Between(this, new And([left, right]));
    }
  },

  // Mirrors Arel::Predications#not_between (predications.rb:84-110).
  notBetween(this: BetweenHost, other: RangeLike): Node {
    if (this.isUnboundable(other.begin) === 1 || this.isUnboundable(other.end) === -1) {
      return this.notIn([]);
    } else if (this.isOpenEnded(other.begin)) {
      if (this.isOpenEnded(other.end)) {
        if (this.isInfinity(other.begin) === 1 || this.isInfinity(other.end) === -1) {
          return this.notIn([]);
        } else {
          return this.in([]);
        }
      } else if (other.excludeEnd) {
        return this.gteq(other.end);
      } else {
        return this.gt(other.end);
      }
    } else if (this.isOpenEnded(other.end)) {
      return this.lt(other.begin);
    } else {
      const left = this.lt(other.begin);
      const right = other.excludeEnd ? this.gteq(other.end) : this.gt(other.end);
      return left.or(right);
    }
  },

  eqAny(
    this: PredicationHost & GroupingFolders & { eq(o: unknown): Node },
    others: unknown[],
  ): Grouping {
    return this.groupingAny("eq", others);
  },
  eqAll(
    this: PredicationHost & GroupingFolders & { eq(o: unknown): Node },
    others: unknown[],
  ): Grouping {
    // predications.rb:34 folds `quoted_array(others)`, not the bare array --
    // uniquely among the *_all variants. `eq` re-quotes via quoted_node, which
    // passes Nodes through untouched, so the pre-quoting is idempotent for
    // plain values; keep it anyway so a host with a custom quotedNode sees the
    // same input Rails gives it.
    return this.groupingAll("eq", this.quotedArray(others));
  },
  notEqAny(
    this: PredicationHost & GroupingFolders & { notEq(o: unknown): Node },
    others: unknown[],
  ): Grouping {
    return this.groupingAny("notEq", others);
  },
  notEqAll(
    this: PredicationHost & GroupingFolders & { notEq(o: unknown): Node },
    others: unknown[],
  ): Grouping {
    return this.groupingAll("notEq", others);
  },
  gtAny(
    this: PredicationHost & GroupingFolders & { gt(o: unknown): Node },
    others: unknown[],
  ): Grouping {
    return this.groupingAny("gt", others);
  },
  gtAll(
    this: PredicationHost & GroupingFolders & { gt(o: unknown): Node },
    others: unknown[],
  ): Grouping {
    return this.groupingAll("gt", others);
  },
  gteqAny(
    this: PredicationHost & GroupingFolders & { gteq(o: unknown): Node },
    others: unknown[],
  ): Grouping {
    return this.groupingAny("gteq", others);
  },
  gteqAll(
    this: PredicationHost & GroupingFolders & { gteq(o: unknown): Node },
    others: unknown[],
  ): Grouping {
    return this.groupingAll("gteq", others);
  },
  ltAny(
    this: PredicationHost & GroupingFolders & { lt(o: unknown): Node },
    others: unknown[],
  ): Grouping {
    return this.groupingAny("lt", others);
  },
  ltAll(
    this: PredicationHost & GroupingFolders & { lt(o: unknown): Node },
    others: unknown[],
  ): Grouping {
    return this.groupingAll("lt", others);
  },
  lteqAny(
    this: PredicationHost & GroupingFolders & { lteq(o: unknown): Node },
    others: unknown[],
  ): Grouping {
    return this.groupingAny("lteq", others);
  },
  lteqAll(
    this: PredicationHost & GroupingFolders & { lteq(o: unknown): Node },
    others: unknown[],
  ): Grouping {
    return this.groupingAll("lteq", others);
  },
  matchesAny(
    this: PredicationHost & GroupingFolders & { matches(o: string): Node },
    others: string[],
    escape: string | Node | null = null,
    caseSensitive = false,
  ): Grouping {
    return this.groupingAny("matches", others, escape, caseSensitive);
  },
  matchesAll(
    this: PredicationHost & GroupingFolders & { matches(o: string): Node },
    others: string[],
    escape: string | Node | null = null,
    caseSensitive = false,
  ): Grouping {
    return this.groupingAll("matches", others, escape, caseSensitive);
  },
  doesNotMatchAny(
    this: PredicationHost & GroupingFolders & { doesNotMatch(o: string): Node },
    others: string[],
    escape: string | Node | null = null,
  ): Grouping {
    // predications.rb:155-161 forwards only `escape` -- unlike matches_*_any,
    // it does not thread case_sensitive, so does_not_match's own default wins.
    return this.groupingAny("doesNotMatch", others, escape);
  },
  doesNotMatchAll(
    this: PredicationHost & GroupingFolders & { doesNotMatch(o: string): Node },
    others: string[],
    escape: string | Node | null = null,
  ): Grouping {
    // predications.rb:155-161 forwards only `escape` -- unlike matches_*_any,
    // it does not thread case_sensitive, so does_not_match's own default wins.
    return this.groupingAll("doesNotMatch", others, escape);
  },
  inAny(
    this: PredicationHost & GroupingFolders & { in(o: unknown): Node },
    others: unknown[],
  ): Grouping {
    return this.groupingAny("in", others);
  },
  inAll(
    this: PredicationHost & GroupingFolders & { in(o: unknown): Node },
    others: unknown[],
  ): Grouping {
    return this.groupingAll("in", others);
  },
  notInAny(
    this: PredicationHost & GroupingFolders & { notIn(o: unknown): Node },
    others: unknown[],
  ): Grouping {
    return this.groupingAny("notIn", others);
  },
  notInAll(
    this: PredicationHost & GroupingFolders & { notIn(o: unknown): Node },
    others: unknown[],
  ): Grouping {
    return this.groupingAll("notIn", others);
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
  //    surface fidelity; the *_any/*_all variants above delegate here,
  //    mirroring predications.rb:231-241). --

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
    const nodes = others.map(predicationDispatch(this, methodId, extras));
    // Rails' `Or.inject` on [] returns nil; the visitor renders that as
    // `NULL`. Preserve three-valued semantics (NULL is *not* the same as
    // FALSE under SQL: `NULL OR FALSE` is NULL, `FALSE OR FALSE` is FALSE)
    // while still guarding against the `Array#reduce` TypeError on empty.
    if (nodes.length === 0) return new Grouping(new SqlLiteral("NULL", { retryable: true }));
    return new Grouping(nodes.reduce((memo, node) => new Or([memo, node])));
  },

  // Mirrors Arel::Predications#grouping_all — fold with AND.
  groupingAll<T extends PredicationHost>(
    this: T,
    methodId: string | ((this: T, expr: unknown, ...extras: unknown[]) => Node),
    others: unknown[],
    ...extras: unknown[]
  ): Grouping {
    const nodes = others.map(predicationDispatch(this, methodId, extras));
    return new Grouping(new And(nodes));
  },

  // Mirrors Arel::Predications#infinity? (predications.rb:248-250) —
  // `value.respond_to?(:infinite?) && value.infinite?`, which yields the SIGN
  // because Ruby's `Float#infinite?` returns `1 | -1 | nil`. The duck-type
  // dispatch is Rails': bare ±Infinity (Ruby's `Float` responds to `infinite?`)
  // or anything exposing `isInfinite()` — which is how a `Quoted` answers
  // (casted.rb:43-45). `Casted` defines no `infinite?` (casted.rb:5-35), so it
  // never answers and `open_ended?(Casted(INFINITY))` stays false.
  //
  // `0` stands in for Ruby's `nil` miss: Ruby's `0` is truthy and so could not
  // double as "absent", and a `0` sign is unreachable anyway. The producers
  // (`Quoted#isInfinite`, `BindParam#isInfinite`, `QueryAttribute#isInfinite`)
  // return `1 | -1 | false`, mirroring `respond_to?(:x) && value.x` — `false`
  // is the `&&` short-circuit. Do not add a `true` arm back: a boolean producer
  // would report `+1` for a -Infinity bound.
  isInfinity(this: PredicationHost, value: unknown): 1 | -1 | 0 {
    void this;
    if (value === Infinity) return 1;
    if (value === -Infinity) return -1;
    if (
      value &&
      typeof value === "object" &&
      typeof (value as InfiniteLike).isInfinite === "function"
    ) {
      const r = (value as InfiniteLike).isInfinite!();
      if (r === 1 || r === -1) return r;
    }
    return 0;
  },

  // Mirrors Arel::Predications#unboundable? (predications.rb:252-253) —
  // `value.respond_to?(:unboundable?) && value.unboundable?`, the same
  // duck-typed predicate the visitor uses (to_sql.rb:905-907). A bound is
  // unboundable when it serializes out of range for its column type; trails
  // threads that through a bound exposing `isUnboundable()` (a QueryAttribute
  // bind, or the RangeHandler's out-of-range sentinel).
  //
  // A bare ±Infinity is NOT unboundable — Float has no `unboundable?`, so Rails
  // answers false and the bound falls through to the `open_ended?` / `infinity?`
  // arms of the between tree. `Float::INFINITY..` still collapses to `in([])`,
  // but via the nested `infinity?` check at predications.rb:42.
  isUnboundable(this: PredicationHost, value: unknown): 1 | -1 | 0 {
    void this;
    if (
      value &&
      typeof value === "object" &&
      typeof (value as UnboundableLike).isUnboundable === "function"
    ) {
      const r = (value as UnboundableLike).isUnboundable!();
      if (r === 1) return 1;
      if (r === -1) return -1;
    }
    return 0;
  },

  // Mirrors Arel::Predications#open_ended? (predications.rb:255-257) —
  // `value.nil? || infinity?(value) || unboundable?(value)`. `infinity?` and
  // `unboundable?` dispatch through implicit self in Ruby, so a host overriding
  // either is honored here too.
  //
  // The leading `value.nil?` is a real dispatch, not a null check: the node
  // classes override `nil?` to report on the *wrapped* value (`BindParam#nil?`
  // bind_param.rb:23-25, `Casted#nil?` / `Quoted#nil?` casted.rb:16,41). So
  // `between(BindParam(nil), 3)` is `lteq(3)` in Rails, not a Between over a nil
  // bind — reading only `=== null` skips that.
  isOpenEnded(
    this: PredicationHost & {
      isInfinity(value: unknown): 1 | -1 | 0;
      isUnboundable(value: unknown): 1 | -1 | 0;
    },
    value: unknown,
  ): boolean {
    const isNil =
      value === null ||
      value === undefined ||
      (typeof (value as { isNil?: () => boolean }).isNil === "function" &&
        (value as { isNil: () => boolean }).isNil());
    return isNil || this.isInfinity(value) !== 0 || this.isUnboundable(value) !== 0;
  },
};

/**
 * Pins GroupingFolders (above) against the real folder implementations. The
 * interface exists only because the *_any/*_all variants cannot name
 * `Predications` while it is still being defined; this assertion makes the two
 * declarations fail to compile if they ever disagree, so the second
 * declaration cannot become the kind of drifting duplicate this file just
 * removed from the *_any/*_all fold paths.
 *
 * @noRailsEquivalent TypeScript-only compile-time assertion; Ruby reopens the module instead.
 */
const _groupingFoldersMatchImplementation: GroupingFolders = Predications;
void _groupingFoldersMatchImplementation;
