import { Node, NodeVisitor } from "./node.js";
import type { Table } from "../table.js";
import {
  Equality,
  NotEqual,
  GreaterThan,
  GreaterThanOrEqual,
  LessThan,
  LessThanOrEqual,
  Matches,
  DoesNotMatch,
  In,
  NotIn,
  Between,
  Addition,
  Subtraction,
  Multiplication,
  Division,
  As,
} from "./binary.js";
import { Ascending, Descending } from "./unary.js";
import { Quoted } from "./quoted.js";
import { Grouping } from "./grouping.js";
import { And } from "./and.js";
import { Or } from "./or.js";
import { Not } from "./not.js";
import { SqlLiteral } from "./sql-literal.js";
import { NamedFunction } from "./named-function.js";
import { Extract } from "./extract.js";
import { Regexp as RegexpNode, NotRegexp } from "./regexp.js";
import { IsDistinctFrom, IsNotDistinctFrom } from "./distinct-from.js";
import { Case } from "./case.js";
import { InfixOperation } from "./infix-operation.js";

function buildQuoted(value: unknown): Node {
  if (value instanceof Node) return value;
  return new Quoted(value);
}

/**
 * Combines multiple nodes with OR, wrapped in a Grouping.
 */
function groupedAny(nodes: Node[]): Grouping {
  const combined = nodes.reduce((left, right) => new Or(left, right));
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
  readonly relation: Table;
  readonly name: string;
  readonly caster?: TypeCaster;

  constructor(relation: Table, name: string, caster?: TypeCaster) {
    super();
    this.relation = relation;
    this.name = name;
    this.caster = caster;
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

  matches(pattern: string, _caseSensitive = true, escape: string | null = null): Matches {
    return new Matches(this, buildQuoted(pattern), escape);
  }

  doesNotMatch(pattern: string, _caseSensitive = true, escape: string | null = null): DoesNotMatch {
    return new DoesNotMatch(this, buildQuoted(pattern), escape);
  }

  in(values: unknown[] | any): In {
    // Support SelectManager as subquery
    if (!Array.isArray(values) && values && typeof values === "object" && "ast" in values) {
      return new In(this, values as any);
    }
    return new In(this, (values as unknown[]).map(buildQuoted) as any);
  }

  notIn(values: unknown[]): NotIn {
    return new NotIn(this, values.map(buildQuoted) as any);
  }

  between(range: [unknown, unknown]): Between | LessThanOrEqual;
  between(begin: unknown, end: unknown): Between | LessThanOrEqual;
  between(rangeObj: { begin: unknown; end: unknown }): Between | LessThanOrEqual;
  between(beginOrRange: unknown, end?: unknown): Between | LessThanOrEqual {
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
      "begin" in (beginOrRange as any) &&
      "end" in (beginOrRange as any) &&
      end === undefined
    ) {
      beginVal = (beginOrRange as any).begin;
      endVal = (beginOrRange as any).end;
    } else {
      beginVal = beginOrRange;
      endVal = end;
    }
    if (beginVal === -Infinity) {
      return new LessThanOrEqual(this, buildQuoted(endVal));
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

  add(other: unknown): Addition {
    return new Addition(this, buildQuoted(other));
  }

  subtract(other: unknown): Subtraction {
    return new Subtraction(this, buildQuoted(other));
  }

  multiply(other: unknown): Multiplication {
    return new Multiplication(this, buildQuoted(other));
  }

  divide(other: unknown): Division {
    return new Division(this, buildQuoted(other));
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

  // -- Regexp --

  matchesRegexp(pattern: string): RegexpNode {
    return new RegexpNode(this, buildQuoted(pattern));
  }

  doesNotMatchRegexp(pattern: string): NotRegexp {
    return new NotRegexp(this, buildQuoted(pattern));
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

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
