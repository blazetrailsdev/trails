import { Node, NodeVisitor } from "../nodes/node.js";
import {
  NotEqual,
  GreaterThan,
  GreaterThanOrEqual,
  LessThan,
  LessThanOrEqual,
  As,
  ATTRIBUTE_BRAND,
} from "../nodes/binary.js";
import { Equality } from "../nodes/equality.js";
import { Matches, DoesNotMatch } from "../nodes/matches.js";
import { In } from "../nodes/in.js";
import { NotIn } from "../nodes/binary.js";
import {
  Addition,
  Subtraction,
  Multiplication,
  Division,
  Concat,
  Contains,
  Overlaps,
} from "../nodes/infix-operation.js";
import { Count } from "../nodes/count.js";
import { Sum, Max, Min, Avg } from "../nodes/function.js";
import { Ascending } from "../nodes/ascending.js";
import { Descending } from "../nodes/descending.js";
import { Quoted, Casted, buildQuoted } from "../nodes/casted.js";
import { parseRange, betweenFromRange, notBetweenFromRange } from "../predications-range.js";
import { BindParam } from "../nodes/bind-param.js";
import { Attribute as ModelAttribute } from "@blazetrails/activemodel";
import { Grouping } from "../nodes/grouping.js";
import { And } from "../nodes/and.js";
import { Or } from "../nodes/or.js";
import { SqlLiteral } from "../nodes/sql-literal.js";
import { NamedFunction } from "../nodes/named-function.js";
import { Extract } from "../nodes/extract.js";
import { Regexp as RegexpNode, NotRegexp } from "../nodes/regexp.js";
import { IsDistinctFrom, IsNotDistinctFrom } from "../nodes/binary.js";
import { Case } from "../nodes/case.js";
import {
  BitwiseAnd,
  BitwiseOr,
  BitwiseXor,
  BitwiseShiftLeft,
  BitwiseShiftRight,
} from "../nodes/infix-operation.js";
import { BitwiseNot } from "../nodes/unary-operation.js";
import type { NodeOrValue } from "../nodes/binary.js";
import { Over } from "../nodes/over.js";
import { NamedWindow, Window } from "../nodes/window.js";
import { Predications, type PredicationHost } from "../predications.js";

/**
 * Combines multiple nodes with OR, wrapped in a Grouping.
 */
function groupedAny(nodes: Node[]): Grouping {
  const combined = nodes.reduce((left, right) => new Or([left, right]));
  return new Grouping(combined);
}

/**
 * Combines multiple nodes with AND, wrapped in a Grouping.
 */
function groupedAll(nodes: Node[]): Grouping {
  return new Grouping(new And(nodes));
}

/**
 * Attribute — represents a column on a table.
 *
 * Mirrors: Arel::Attributes::Attribute
 */
export interface TypeCaster {
  typeCastForDatabase(value: unknown): unknown;
}

export interface RelationLike {
  name: string;
  tableAlias?: string | null;
  typeCastForDatabase?: (attrName: string, value: unknown) => unknown;
  typeForAttribute?: (name: string) => unknown;
  isAbleToTypeCast?: () => boolean;
}

export class Attribute extends Node {
  readonly [ATTRIBUTE_BRAND] = true;
  readonly relation: RelationLike;
  readonly name: string;
  readonly caster?: TypeCaster;

  constructor(relation: RelationLike, name: string, caster?: TypeCaster) {
    super();
    this.relation = relation;
    this.name = name;
    this.caster = caster;
  }

  get typeCaster(): unknown {
    return this.relation.typeForAttribute ? this.relation.typeForAttribute(this.name) : undefined;
  }

  typeCastForDatabase(value: unknown): unknown {
    return this.relation.typeCastForDatabase
      ? this.relation.typeCastForDatabase(this.name, value)
      : value;
  }

  isAbleToTypeCast(): boolean {
    return typeof this.relation.isAbleToTypeCast === "function"
      ? this.relation.isAbleToTypeCast()
      : false;
  }

  /**
   * Mirrors: Arel::Predications#quoted_node — the type-aware wrapper
   * that the Predications mixin calls to bring an arbitrary right-hand
   * value into the AST. Attribute's impl wraps in `Casted(value, this)`
   * so the visitor can apply column-level type-casting; ActiveModel
   * attribute instances become BindParam so they extract as binds; raw
   * Nodes are passed through.
   *
   * @internal
   */
  quotedNode(value: unknown): Node {
    if (value instanceof Node) return value;
    if (value === null || value === undefined) return new Quoted(null);
    // ActiveModel::Attribute instances (QueryAttribute etc.) carry their
    // own type + value. Wrap in BindParam so the visitor extracts them
    // as binds rather than inlining via Casted.
    if (value instanceof ModelAttribute) {
      return new BindParam(value);
    }
    return new Casted(value, this);
  }

  // -- Predicates --

  eq(other: unknown): Equality {
    return new Equality(this, this.quotedNode(other));
  }

  notEq(other: unknown): NotEqual {
    return new NotEqual(this, this.quotedNode(other));
  }

  gt(other: unknown): GreaterThan {
    return new GreaterThan(this, this.quotedNode(other));
  }

  gteq(other: unknown): GreaterThanOrEqual {
    return new GreaterThanOrEqual(this, this.quotedNode(other));
  }

  lt(other: unknown): LessThan {
    return new LessThan(this, this.quotedNode(other));
  }

  lteq(other: unknown): LessThanOrEqual {
    return new LessThanOrEqual(this, this.quotedNode(other));
  }

  matches(
    pattern: string | { ast: Node },
    escape: string | null = null,
    caseSensitive = false,
  ): Matches {
    const right =
      typeof pattern === "string" ? this.quotedNode(pattern) : (pattern as { ast: Node }).ast;
    return new Matches(this, right, escape, caseSensitive);
  }

  doesNotMatch(
    pattern: string | { ast: Node },
    escape: string | null = null,
    caseSensitive = false,
  ): DoesNotMatch {
    const right =
      typeof pattern === "string" ? this.quotedNode(pattern) : (pattern as { ast: Node }).ast;
    return new DoesNotMatch(this, right, escape, caseSensitive);
  }

  matchesRegexp(pattern: string, caseSensitive = true): RegexpNode {
    return new RegexpNode(this, this.quotedNode(pattern), caseSensitive);
  }

  doesNotMatchRegexp(pattern: string, caseSensitive = true): NotRegexp {
    return new NotRegexp(this, this.quotedNode(pattern), caseSensitive);
  }

  in(values: unknown[] | { ast: Node }): In {
    if (!Array.isArray(values) && values && typeof values === "object" && "ast" in values) {
      return new In(this, (values as { ast: Node }).ast);
    }
    return new In(this, values.map(buildQuoted) as unknown as Node);
  }

  notIn(values: unknown[] | { ast: Node }): NotIn {
    if (!Array.isArray(values) && values && typeof values === "object" && "ast" in values) {
      return new NotIn(this, (values as { ast: Node }).ast);
    }
    return new NotIn(this, values.map(buildQuoted) as unknown as Node);
  }

  between(range: [unknown, unknown]): Node;
  between(begin: unknown, end: unknown, excludeEnd?: boolean): Node;
  between(rangeObj: { begin: unknown; end: unknown; excludeEnd?: boolean }): Node;
  between(beginOrRange: unknown, end?: unknown, excludeEnd?: boolean): Node {
    return betweenFromRange(this, parseRange(beginOrRange, end, excludeEnd));
  }

  notBetween(range: [unknown, unknown]): Node;
  notBetween(begin: unknown, end: unknown, excludeEnd?: boolean): Node;
  notBetween(rangeObj: { begin: unknown; end: unknown; excludeEnd?: boolean }): Node;
  notBetween(beginOrRange: unknown, end?: unknown, excludeEnd?: boolean): Node {
    return notBetweenFromRange(this, parseRange(beginOrRange, end, excludeEnd));
  }

  isNull(): Equality {
    return new Equality(this, new Quoted(null));
  }

  isNotNull(): NotEqual {
    return new NotEqual(this, new Quoted(null));
  }

  // -- _any / _all variants --

  eqAny(others: unknown[]): Grouping {
    return groupedAny(others.map((o) => this.eq(o)));
  }

  eqAll(others: unknown[]): Grouping {
    return groupedAll(others.map((o) => this.eq(o)));
  }

  notEqAny(others: unknown[]): Grouping {
    return groupedAny(others.map((o) => this.notEq(o)));
  }

  notEqAll(others: unknown[]): Grouping {
    return groupedAll(others.map((o) => this.notEq(o)));
  }

  gtAny(others: unknown[]): Grouping {
    return groupedAny(others.map((o) => this.gt(o)));
  }

  gtAll(others: unknown[]): Grouping {
    return groupedAll(others.map((o) => this.gt(o)));
  }

  gteqAny(others: unknown[]): Grouping {
    return groupedAny(others.map((o) => this.gteq(o)));
  }

  gteqAll(others: unknown[]): Grouping {
    return groupedAll(others.map((o) => this.gteq(o)));
  }

  ltAny(others: unknown[]): Grouping {
    return groupedAny(others.map((o) => this.lt(o)));
  }

  ltAll(others: unknown[]): Grouping {
    return groupedAll(others.map((o) => this.lt(o)));
  }

  lteqAny(others: unknown[]): Grouping {
    return groupedAny(others.map((o) => this.lteq(o)));
  }

  lteqAll(others: unknown[]): Grouping {
    return groupedAll(others.map((o) => this.lteq(o)));
  }

  matchesAny(others: string[]): Grouping {
    return groupedAny(others.map((o) => this.matches(o)));
  }

  matchesAll(others: string[]): Grouping {
    return groupedAll(others.map((o) => this.matches(o)));
  }

  doesNotMatchAny(others: string[]): Grouping {
    return groupedAny(others.map((o) => this.doesNotMatch(o)));
  }

  doesNotMatchAll(others: string[]): Grouping {
    return groupedAll(others.map((o) => this.doesNotMatch(o)));
  }

  inAny(others: unknown[][]): Grouping {
    return groupedAny(others.map((o) => this.in(o)));
  }

  inAll(others: unknown[][]): Grouping {
    return groupedAll(others.map((o) => this.in(o)));
  }

  notInAny(others: unknown[][]): Grouping {
    return groupedAny(others.map((o) => this.notIn(o)));
  }

  notInAll(others: unknown[][]): Grouping {
    return groupedAll(others.map((o) => this.notIn(o)));
  }

  // -- Rails-private helpers (mirror Arel::Predications) --
  //
  // Rails' Attribute inherits these from Predications via `include`.
  // Trails' Attribute has hand-rolled public predicates (so the include
  // chain isn't wired) — these methods delegate to the canonical
  // Predications impls so there's a single source of truth and
  // behavior stays in lockstep. Marked `protected` (matching the
  // visibility of HomogeneousIn#ivars / SelectManager#collapse) since
  // they exist for Rails-fidelity / api:compare privates coverage,
  // not as a public API surface.

  protected groupingAny(
    methodId: string | ((this: Attribute, expr: unknown, ...extras: unknown[]) => Node),
    others: unknown[],
    ...extras: unknown[]
  ): Grouping {
    return Predications.groupingAny.call<
      Attribute,
      [typeof methodId, unknown[], ...unknown[]],
      Grouping
    >(this, methodId, others, ...extras);
  }

  protected groupingAll(
    methodId: string | ((this: Attribute, expr: unknown, ...extras: unknown[]) => Node),
    others: unknown[],
    ...extras: unknown[]
  ): Grouping {
    return Predications.groupingAll.call<
      Attribute,
      [typeof methodId, unknown[], ...unknown[]],
      Grouping
    >(this, methodId, others, ...extras);
  }

  protected isInfinity(value: unknown): boolean {
    return Predications.isInfinity.call(this, value);
  }

  protected isUnboundable(value: unknown): boolean {
    return Predications.isUnboundable.call(this, value);
  }

  protected isOpenEnded(value: unknown): boolean {
    // Cast widens this' protected isInfinity/isUnboundable so they
    // match Predications.isOpenEnded's `this` constraint, which
    // requires them as public methods. The dispatch still goes through
    // `this` at runtime, so subclass overrides are honored.
    return Predications.isOpenEnded.call(
      this as unknown as PredicationHost & {
        isInfinity(value: unknown): boolean;
        isUnboundable(value: unknown): boolean;
      },
      value,
    );
  }

  // -- Ordering --

  asc(): Ascending {
    return new Ascending(this);
  }

  desc(): Descending {
    return new Descending(this);
  }

  // -- Math --
  //
  // Mirrors Arel::Math: operands pass through unwrapped. The visitor
  // renders primitive values via `visitNodeOrValue`.

  add(other: unknown): Grouping {
    return new Grouping(new Addition(this, other as NodeOrValue));
  }

  subtract(other: unknown): Grouping {
    return new Grouping(new Subtraction(this, other as NodeOrValue));
  }

  multiply(other: unknown): Multiplication {
    return new Multiplication(this, other as NodeOrValue);
  }

  divide(other: unknown): Division {
    return new Division(this, other as NodeOrValue);
  }

  bitwiseAnd(other: unknown): Grouping {
    return new Grouping(new BitwiseAnd(this, other as NodeOrValue));
  }

  bitwiseOr(other: unknown): Grouping {
    return new Grouping(new BitwiseOr(this, other as NodeOrValue));
  }

  bitwiseXor(other: unknown): Grouping {
    return new Grouping(new BitwiseXor(this, other as NodeOrValue));
  }

  bitwiseShiftLeft(other: unknown): Grouping {
    return new Grouping(new BitwiseShiftLeft(this, other as NodeOrValue));
  }

  bitwiseShiftRight(other: unknown): Grouping {
    return new Grouping(new BitwiseShiftRight(this, other as NodeOrValue));
  }

  bitwiseNot(): BitwiseNot {
    return new BitwiseNot(this);
  }

  // -- Aliasing --

  as(aliasName: string): As {
    return new As(this, new SqlLiteral(aliasName, { retryable: true }));
  }

  // -- Aggregate functions --
  //
  // Mirrors: Arel::Expressions (mixed into Attribute in Rails). Returns
  // the typed Function subclasses Rails uses (Count/Sum/Max/Min/Avg) so
  // `instanceof` checks line up across the codebase. The visitor
  // (visitAggregate in to-sql.ts) renders them identically to a
  // NamedFunction with the same name.

  count(distinct = false): Count {
    return new Count([this], distinct);
  }

  sum(): Sum {
    return new Sum([this]);
  }

  maximum(): Max {
    return new Max([this]);
  }

  minimum(): Min {
    return new Min([this]);
  }

  average(): Avg {
    return new Avg([this]);
  }

  // -- String functions --

  lower(): NamedFunction {
    return new NamedFunction("LOWER", [this]);
  }

  upper(): NamedFunction {
    return new NamedFunction("UPPER", [this]);
  }

  length(): NamedFunction {
    return new NamedFunction("LENGTH", [this]);
  }

  trim(): NamedFunction {
    return new NamedFunction("TRIM", [this]);
  }

  ltrim(): NamedFunction {
    return new NamedFunction("LTRIM", [this]);
  }

  rtrim(): NamedFunction {
    return new NamedFunction("RTRIM", [this]);
  }

  substring(start: number, length?: number): NamedFunction {
    const args: Node[] = [this, buildQuoted(start)];
    if (length !== undefined) args.push(buildQuoted(length));
    return new NamedFunction("SUBSTRING", args);
  }

  // Mirrors: Arel::Predications#concat — `Nodes::Concat.new self, other`,
  // i.e. SQL `||` infix concatenation. (The previous implementation built
  // a `CONCAT(...)` NamedFunction call, which was Trails-specific and
  // varied by dialect; the `||` form is what Rails emits.)
  concat(other: Node): Concat {
    return new Concat(this, other);
  }

  replace(from: string, to: string): NamedFunction {
    return new NamedFunction("REPLACE", [this, buildQuoted(from), buildQuoted(to)]);
  }

  // -- Math functions --

  abs(): NamedFunction {
    return new NamedFunction("ABS", [this]);
  }

  round(precision?: number): NamedFunction {
    const args: Node[] = [this];
    if (precision !== undefined) args.push(buildQuoted(precision));
    return new NamedFunction("ROUND", args);
  }

  ceil(): NamedFunction {
    return new NamedFunction("CEIL", [this]);
  }

  floor(): NamedFunction {
    return new NamedFunction("FLOOR", [this]);
  }

  // -- Extract --

  extract(field: string): Extract {
    // Mirrors Rails: `Nodes::Extract.new [self], field` (expressions.rb).
    return new Extract([this], field);
  }

  // -- Null handling --

  coalesce(...others: unknown[]): NamedFunction {
    return new NamedFunction("COALESCE", [this, ...others.map(buildQuoted)]);
  }

  // -- Distinct From --

  isDistinctFrom(other: unknown): IsDistinctFrom {
    return new IsDistinctFrom(this, buildQuoted(other));
  }

  isNotDistinctFrom(other: unknown): IsNotDistinctFrom {
    return new IsNotDistinctFrom(this, buildQuoted(other));
  }

  // -- Case --

  /**
   * Start a CASE expression on this attribute.
   *
   * Mirrors: Arel::Attributes::Attribute#when
   */
  when(value: unknown): Case {
    return new Case(this).when(buildQuoted(value));
  }

  // -- PostgreSQL array operators --

  /**
   * PostgreSQL @> (contains) operator.
   *
   * Mirrors: Arel::Predications#contains — `Arel::Nodes::Contains.new self, quoted_node(other)`.
   * Returns the dedicated `Contains` subclass (rather than a generic
   * `InfixOperation("@>", ...)`) so `instanceof` checks line up. Routes
   * through `this.quotedNode` so a scalar RHS gets the column-aware
   * `Casted` wrapping (matching how Rails' `quoted_node` carries the
   * attribute as type-cast context).
   */
  contains(other: unknown): Contains {
    return new Contains(this, this.quotedNode(other));
  }

  /**
   * PostgreSQL && (overlaps) operator.
   *
   * Mirrors: Arel::Predications#overlaps — `Arel::Nodes::Overlaps.new self, quoted_node(other)`.
   * Routes through `this.quotedNode` (rather than the bare `buildQuoted`)
   * so a scalar RHS gets the column-aware `Casted` wrapping. Same fidelity
   * fix as `contains`.
   */
  overlaps(other: unknown): Overlaps {
    return new Overlaps(this, this.quotedNode(other));
  }

  /**
   * Apply a window to this expression.
   *
   * Mirrors: `OVER` support on Arel expressions.
   */
  quotedArray(others: unknown[]): Node[] {
    return others.map((v) => buildQuoted(v));
  }

  over(window?: Window | NamedWindow | string | null): Over {
    if (!window) return new Over(this, null);
    if (typeof window === "string") return new Over(this, new SqlLiteral(window));
    if (window instanceof NamedWindow) return new Over(this, new SqlLiteral(`"${window.name}"`));
    return new Over(this, window);
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
