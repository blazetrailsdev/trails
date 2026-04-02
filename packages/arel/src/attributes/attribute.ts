import { Node, NodeVisitor } from "../nodes/node.js";
import type { Table } from "../table.js";
import {
  NotEqual,
  GreaterThan,
  GreaterThanOrEqual,
  LessThan,
  LessThanOrEqual,
  Between,
  As,
  ATTRIBUTE_BRAND,
} from "../nodes/binary.js";
import { Equality } from "../nodes/equality.js";
import { Matches, DoesNotMatch } from "../nodes/matches.js";
import { In } from "../nodes/in.js";
import { NotIn } from "../nodes/binary.js";
import { Addition, Subtraction, Multiplication, Division } from "../nodes/infix-operation.js";
import { Ascending } from "../nodes/ascending.js";
import { Descending } from "../nodes/descending.js";
import { Quoted } from "../nodes/casted.js";
import { Grouping } from "../nodes/grouping.js";
import { And } from "../nodes/and.js";
import { Or } from "../nodes/or.js";
import { Not } from "../nodes/unary.js";
import { SqlLiteral } from "../nodes/sql-literal.js";
import { NamedFunction } from "../nodes/named-function.js";
import { Extract } from "../nodes/extract.js";
import { Regexp as RegexpNode, NotRegexp } from "../nodes/regexp.js";
import { IsDistinctFrom, IsNotDistinctFrom } from "../nodes/binary.js";
import { Case } from "../nodes/case.js";
import {
  InfixOperation,
  BitwiseAnd,
  BitwiseOr,
  BitwiseXor,
  BitwiseShiftLeft,
  BitwiseShiftRight,
} from "../nodes/infix-operation.js";
import { Over } from "../nodes/over.js";
import { NamedWindow, Window } from "../nodes/window.js";
import { True } from "../nodes/true.js";

function buildQuoted(value: unknown): Node {
  if (value instanceof Node) return value;
  return new Quoted(value);
}

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

export class Attribute extends Node {
  readonly [ATTRIBUTE_BRAND] = true;
  readonly relation: Table;
  readonly name: string;
  readonly caster?: TypeCaster;

  constructor(relation: Table, name: string, caster?: TypeCaster) {
    super();
    this.relation = relation;
    this.name = name;
    this.caster = caster;
  }

  get typeCaster(): unknown {
    const rel = this.relation as unknown as { typeForAttribute?: (n: string) => unknown };
    return rel?.typeForAttribute ? rel.typeForAttribute(this.name) : undefined;
  }

  typeCastForDatabase(value: unknown): unknown {
    const rel = this.relation as unknown as {
      typeCastForDatabase?: (n: string, v: unknown) => unknown;
    };
    return rel?.typeCastForDatabase ? rel.typeCastForDatabase(this.name, value) : value;
  }

  isAbleToTypeCast(): boolean {
    const rel = this.relation as unknown as { isAbleToTypeCast?: () => boolean };
    return typeof rel?.isAbleToTypeCast === "function" ? rel.isAbleToTypeCast() : false;
  }

  private castValue(value: unknown): unknown {
    if (value instanceof SqlLiteral) return value;
    if (value instanceof Node) return value;
    if (this.caster) return this.caster.typeCastForDatabase(value);
    return value;
  }

  // -- Predicates --

  eq(other: unknown): Equality {
    return new Equality(this, buildQuoted(this.castValue(other)));
  }

  notEq(other: unknown): NotEqual {
    return new NotEqual(this, buildQuoted(other));
  }

  gt(other: unknown): GreaterThan {
    return new GreaterThan(this, buildQuoted(other));
  }

  gteq(other: unknown): GreaterThanOrEqual {
    return new GreaterThanOrEqual(this, buildQuoted(other));
  }

  lt(other: unknown): LessThan {
    return new LessThan(this, buildQuoted(other));
  }

  lteq(other: unknown): LessThanOrEqual {
    return new LessThanOrEqual(this, buildQuoted(other));
  }

  matches(
    pattern: string | { ast: Node },
    escape: string | null = null,
    caseSensitive = false,
  ): Matches {
    const right =
      typeof pattern === "string" ? buildQuoted(pattern) : (pattern as { ast: Node }).ast;
    return new Matches(this, right, escape, caseSensitive);
  }

  doesNotMatch(
    pattern: string | { ast: Node },
    escape: string | null = null,
    caseSensitive = false,
  ): DoesNotMatch {
    const right =
      typeof pattern === "string" ? buildQuoted(pattern) : (pattern as { ast: Node }).ast;
    return new DoesNotMatch(this, right, escape, caseSensitive);
  }

  matchesRegexp(pattern: string, caseSensitive = true): RegexpNode {
    return new RegexpNode(this, buildQuoted(pattern), caseSensitive);
  }

  doesNotMatchRegexp(pattern: string, caseSensitive = true): NotRegexp {
    return new NotRegexp(this, buildQuoted(pattern), caseSensitive);
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

  between(range: [unknown, unknown]): Between | LessThanOrEqual | GreaterThanOrEqual | True;
  between(begin: unknown, end: unknown): Between | LessThanOrEqual | GreaterThanOrEqual | True;
  between(rangeObj: {
    begin: unknown;
    end: unknown;
  }): Between | LessThanOrEqual | GreaterThanOrEqual | True;
  between(
    beginOrRange: unknown,
    end?: unknown,
  ): Between | LessThanOrEqual | GreaterThanOrEqual | True {
    let beginVal: unknown;
    let endVal: unknown;
    if (Array.isArray(beginOrRange) && end === undefined) {
      beginVal = beginOrRange[0];
      endVal = beginOrRange[1];
    } else if (
      typeof beginOrRange === "object" &&
      beginOrRange !== null &&
      !Array.isArray(beginOrRange) &&
      !(beginOrRange instanceof Node) &&
      "begin" in (beginOrRange as Record<string, unknown>) &&
      "end" in (beginOrRange as Record<string, unknown>) &&
      end === undefined
    ) {
      beginVal = (beginOrRange as { begin: unknown; end: unknown }).begin;
      endVal = (beginOrRange as { begin: unknown; end: unknown }).end;
    } else {
      beginVal = beginOrRange;
      endVal = end;
    }
    if (beginVal === -Infinity && endVal === Infinity) {
      return new True();
    }
    if (beginVal === -Infinity) {
      return new LessThanOrEqual(this, buildQuoted(endVal));
    }
    if (endVal === Infinity) {
      return new GreaterThanOrEqual(this, buildQuoted(beginVal));
    }
    return new Between(this, new And([buildQuoted(beginVal), buildQuoted(endVal)]));
  }

  notBetween(range: [unknown, unknown]): Not;
  notBetween(begin: unknown, end: unknown): Not;
  notBetween(beginOrRange: unknown, end?: unknown): Not {
    if (Array.isArray(beginOrRange) && end === undefined) {
      return new Not(this.between(beginOrRange as [unknown, unknown]));
    }
    return new Not(this.between(beginOrRange, end!));
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

  // -- Ordering --

  asc(): Ascending {
    return new Ascending(this);
  }

  desc(): Descending {
    return new Descending(this);
  }

  // -- Math --

  add(other: unknown): Grouping {
    return new Grouping(new Addition(this, buildQuoted(other)));
  }

  subtract(other: unknown): Grouping {
    return new Grouping(new Subtraction(this, buildQuoted(other)));
  }

  multiply(other: unknown): Multiplication {
    return new Multiplication(this, buildQuoted(other));
  }

  divide(other: unknown): Division {
    return new Division(this, buildQuoted(other));
  }

  bitwiseAnd(other: unknown): Grouping {
    return new Grouping(new BitwiseAnd(this, buildQuoted(other)));
  }

  bitwiseOr(other: unknown): Grouping {
    return new Grouping(new BitwiseOr(this, buildQuoted(other)));
  }

  bitwiseXor(other: unknown): Grouping {
    return new Grouping(new BitwiseXor(this, buildQuoted(other)));
  }

  bitwiseShiftLeft(other: unknown): Grouping {
    return new Grouping(new BitwiseShiftLeft(this, buildQuoted(other)));
  }

  bitwiseShiftRight(other: unknown): Grouping {
    return new Grouping(new BitwiseShiftRight(this, buildQuoted(other)));
  }

  // -- Aliasing --

  as(aliasName: string): As {
    return new As(this, new SqlLiteral(aliasName));
  }

  // -- Aggregate functions --

  count(distinct = false): NamedFunction {
    return new NamedFunction("COUNT", [this], undefined, distinct);
  }

  sum(): NamedFunction {
    return new NamedFunction("SUM", [this]);
  }

  maximum(): NamedFunction {
    return new NamedFunction("MAX", [this]);
  }

  minimum(): NamedFunction {
    return new NamedFunction("MIN", [this]);
  }

  average(): NamedFunction {
    return new NamedFunction("AVG", [this]);
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

  concat(other: unknown, ...rest: unknown[]): NamedFunction {
    return new NamedFunction("CONCAT", [this, buildQuoted(other), ...rest.map(buildQuoted)]);
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

  // -- Type casting --

  cast(asType: string): NamedFunction {
    return new NamedFunction("CAST", [
      new SqlLiteral(`${this.relation.name}.${this.name} AS ${asType}`),
    ]);
  }

  // -- Extract --

  extract(field: string): Extract {
    return new Extract(this, field);
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
   * Mirrors: Arel::Attributes::Attribute#contains
   */
  contains(other: unknown): InfixOperation {
    return new InfixOperation("@>", this, buildQuoted(other));
  }

  /**
   * PostgreSQL && (overlaps) operator.
   *
   * Mirrors: Arel::Attributes::Attribute#overlaps
   */
  overlaps(other: unknown): InfixOperation {
    return new InfixOperation("&&", this, buildQuoted(other));
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
