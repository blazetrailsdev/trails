import type { Node } from "./nodes/node.js";
import type { ArelNode } from "./arel.js";
import type {
  NotEqual,
  GreaterThan,
  GreaterThanOrEqual,
  LessThan,
  LessThanOrEqual,
  NotIn,
  IsDistinctFrom,
  IsNotDistinctFrom,
} from "./nodes/binary.js";
import type { Equality } from "./nodes/equality.js";
import type { Matches, DoesNotMatch } from "./nodes/matches.js";
import type { In } from "./nodes/in.js";
import type { Regexp as RegexpNode, NotRegexp } from "./nodes/regexp.js";
import type { Grouping } from "./nodes/grouping.js";
import type { Case } from "./nodes/case.js";
import type { Concat, Contains, Overlaps } from "./nodes/infix-operation.js";
import { Nodes } from "./namespaces.js";
import { rbEqual } from "@blazetrails/activesupport";
import {
  isNil,
  NoMethodError,
  rbFSend,
  rbObjClass,
  rbObjRespondTo,
  rtest,
} from "@blazetrails/ruby-compat";
import type { NodeOrValue } from "./nodes/binary.js";

function isSelectManagerLike(value: unknown): value is { ast: Node } {
  return (
    typeof value === "object" &&
    value !== null &&
    !(value instanceof Nodes.Node) &&
    (value as { ast?: unknown }).ast instanceof Nodes.Node
  );
}

function isEnumerable(value: unknown): value is Iterable<unknown> {
  return typeof value === "object" && value !== null && Symbol.iterator in value;
}

export interface PredicationHost {
  /** @internal */
  quotedNode(other: unknown): ReturnType<typeof Nodes.buildQuoted>;
  /** @internal */
  quotedArray(others: unknown[]): ReturnType<typeof Nodes.buildQuoted>[];
}

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

interface RangePredicates {
  /** @internal */
  isInfinity(value: unknown): 1 | -1 | null | false;
  /** @internal */
  isUnboundable(value: unknown): 1 | -1 | false;
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

type BetweenHost = ArelNode & PredicationHost & RangePredicates;

export interface RangeLike {
  begin: unknown;
  end: unknown;
  excludeEnd?: boolean;
}

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
    throw new NoMethodError(
      `undefined method '${methodId}' for an instance of ${rbObjClass(host)}`,
      methodId,
      { receiver: host },
    );
  }
  const fn = member as (...args: unknown[]) => Node;
  return (expr) => fn.call(host, expr, ...extras);
}

export interface PredicationsModule extends GroupingFolders {
  eq(other: unknown): Equality;
  notEq(other: unknown): NotEqual;
  gt(right: unknown): GreaterThan;
  gteq(right: unknown): GreaterThanOrEqual;
  lt(right: unknown): LessThan;
  lteq(right: unknown): LessThanOrEqual;
  isDistinctFrom(other: unknown): IsDistinctFrom;
  isNotDistinctFrom(other: unknown): IsNotDistinctFrom;
  matches(other: unknown, escape?: string | Node | null, caseSensitive?: boolean): Matches;
  doesNotMatch(
    other: unknown,
    escape?: string | Node | null,
    caseSensitive?: boolean,
  ): DoesNotMatch;
  matchesRegexp(other: string, caseSensitive?: boolean): RegexpNode;
  doesNotMatchRegexp(other: string, caseSensitive?: boolean): NotRegexp;
  in(other: unknown): In;
  notIn(other: unknown): NotIn;
  between(other: RangeLike): Node;
  notBetween(other: RangeLike): Node;
  eqAny(others: unknown[]): Grouping;
  eqAll(others: unknown[]): Grouping;
  notEqAny(others: unknown[]): Grouping;
  notEqAll(others: unknown[]): Grouping;
  gtAny(others: unknown[]): Grouping;
  gtAll(others: unknown[]): Grouping;
  gteqAny(others: unknown[]): Grouping;
  gteqAll(others: unknown[]): Grouping;
  ltAny(others: unknown[]): Grouping;
  ltAll(others: unknown[]): Grouping;
  lteqAny(others: unknown[]): Grouping;
  lteqAll(others: unknown[]): Grouping;
  matchesAny(others: string[], escape?: string | Node | null, caseSensitive?: boolean): Grouping;
  matchesAll(others: string[], escape?: string | Node | null, caseSensitive?: boolean): Grouping;
  doesNotMatchAny(others: string[], escape?: string | Node | null): Grouping;
  doesNotMatchAll(others: string[], escape?: string | Node | null): Grouping;
  inAny(others: unknown[]): Grouping;
  inAll(others: unknown[]): Grouping;
  notInAny(others: unknown[]): Grouping;
  notInAll(others: unknown[]): Grouping;
  when(right: unknown): Case;
  concat(other: NodeOrValue): Concat;
  contains(other: unknown): Contains;
  overlaps(other: unknown): Overlaps;
  /** @internal */
  quotedArray(others: unknown[]): ReturnType<typeof Nodes.buildQuoted>[];
  /** @internal */
  quotedNode(other: unknown): ReturnType<typeof Nodes.buildQuoted>;
  isInfinity(value: unknown): 1 | -1 | null | false;
  isUnboundable(value: unknown): 1 | -1 | false;
  isOpenEnded(value: unknown): boolean;
}

export const Predications: PredicationsModule = {
  eq(this: ArelNode & PredicationHost, other: unknown): Equality {
    return new Nodes.Equality(this, this.quotedNode(other));
  },
  notEq(this: ArelNode & PredicationHost, other: unknown): NotEqual {
    return new Nodes.NotEqual(this, this.quotedNode(other));
  },
  gt(this: ArelNode & PredicationHost, right: unknown): GreaterThan {
    return new Nodes.GreaterThan(this, this.quotedNode(right));
  },
  gteq(this: ArelNode & PredicationHost, right: unknown): GreaterThanOrEqual {
    return new Nodes.GreaterThanOrEqual(this, this.quotedNode(right));
  },
  lt(this: ArelNode & PredicationHost, right: unknown): LessThan {
    return new Nodes.LessThan(this, this.quotedNode(right));
  },
  lteq(this: ArelNode & PredicationHost, right: unknown): LessThanOrEqual {
    return new Nodes.LessThanOrEqual(this, this.quotedNode(right));
  },

  isDistinctFrom(this: ArelNode & PredicationHost, other: unknown): IsDistinctFrom {
    return new Nodes.IsDistinctFrom(this, this.quotedNode(other));
  },
  isNotDistinctFrom(this: ArelNode & PredicationHost, other: unknown): IsNotDistinctFrom {
    return new Nodes.IsNotDistinctFrom(this, this.quotedNode(other));
  },

  matches(
    this: ArelNode & PredicationHost,
    other: unknown,
    escape: string | Node | null = null,
    caseSensitive = false,
  ): Matches {
    return new Nodes.Matches(this, this.quotedNode(other), escape, caseSensitive);
  },
  doesNotMatch(
    this: ArelNode & PredicationHost,
    other: unknown,
    escape: string | Node | null = null,
    caseSensitive = false,
  ): DoesNotMatch {
    return new Nodes.DoesNotMatch(this, this.quotedNode(other), escape, caseSensitive);
  },
  matchesRegexp(this: ArelNode & PredicationHost, other: string, caseSensitive = true): RegexpNode {
    return new Nodes.Regexp(this, this.quotedNode(other), caseSensitive);
  },
  doesNotMatchRegexp(
    this: ArelNode & PredicationHost,
    other: string,
    caseSensitive = true,
  ): NotRegexp {
    return new Nodes.NotRegexp(this, this.quotedNode(other), caseSensitive);
  },

  in(this: ArelNode & PredicationHost, other: unknown): In {
    if (isSelectManagerLike(other)) return new Nodes.In(this, other.ast);
    if (isEnumerable(other)) return new Nodes.In(this, this.quotedArray([...other]));
    return new Nodes.In(this, this.quotedNode(other));
  },
  notIn(this: ArelNode & PredicationHost, other: unknown): NotIn {
    if (isSelectManagerLike(other)) return new Nodes.NotIn(this, other.ast);
    if (isEnumerable(other)) return new Nodes.NotIn(this, this.quotedArray([...other]));
    return new Nodes.NotIn(this, this.quotedNode(other));
  },

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
      return this.eq(other.begin);
    } else {
      const left = this.quotedNode(other.begin);
      const right = this.quotedNode(other.end);
      return new Nodes.Between(this, new Nodes.And([left, right]));
    }
  },

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
    return this.groupingAny("doesNotMatch", others, escape);
  },
  doesNotMatchAll(
    this: PredicationHost & GroupingFolders & { doesNotMatch(o: string): Node },
    others: string[],
    escape: string | Node | null = null,
  ): Grouping {
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
  when(this: ArelNode & PredicationHost, right: unknown): Case {
    return new Nodes.Case(this).when(this.quotedNode(right));
  },
  concat(this: ArelNode, other: NodeOrValue): Concat {
    return new Nodes.Concat(this, other);
  },
  contains(this: ArelNode & PredicationHost, other: unknown): Contains {
    return new Nodes.Contains(this, this.quotedNode(other));
  },
  overlaps(this: ArelNode & PredicationHost, other: unknown): Overlaps {
    return new Nodes.Overlaps(this, this.quotedNode(other));
  },
  quotedArray(this: PredicationHost, others: unknown[]): ReturnType<typeof Nodes.buildQuoted>[] {
    return others.map((v) => this.quotedNode(v));
  },

  groupingAny<T extends PredicationHost>(
    this: T,
    methodId: string | ((this: T, expr: unknown, ...extras: unknown[]) => Node),
    others: unknown[],
    ...extras: unknown[]
  ): Grouping {
    const nodes = others.map(predicationDispatch(this, methodId, extras));
    if (nodes.length === 0)
      return new Nodes.Grouping(new Nodes.SqlLiteral("NULL", { retryable: true }));
    return new Nodes.Grouping(nodes.reduce((memo, node) => new Nodes.Or([memo, node])));
  },

  groupingAll<T extends PredicationHost>(
    this: T,
    methodId: string | ((this: T, expr: unknown, ...extras: unknown[]) => Node),
    others: unknown[],
    ...extras: unknown[]
  ): Grouping {
    const nodes = others.map(predicationDispatch(this, methodId, extras));
    return new Nodes.Grouping(new Nodes.And(nodes));
  },

  quotedNode(this: ArelNode, other: unknown): ReturnType<typeof Nodes.buildQuoted> {
    return Nodes.buildQuoted(other, this);
  },
  isInfinity(this: PredicationHost, value: unknown): 1 | -1 | null | false {
    void this;
    return rbObjRespondTo(value, "isInfinite") && (rbFSend(value, "isInfinite") as 1 | -1 | null);
  },

  isUnboundable(this: PredicationHost, value: unknown): 1 | -1 | false {
    void this;
    return (
      rbObjRespondTo(value, "isUnboundable") &&
      (value as { isUnboundable(): 1 | -1 | false }).isUnboundable()
    );
  },

  isOpenEnded(
    this: PredicationHost & {
      isInfinity(value: unknown): 1 | -1 | null | false;
      isUnboundable(value: unknown): 1 | -1 | false;
    },
    value: unknown,
  ): boolean {
    return isNil(value) || rtest(this.isInfinity(value)) || rtest(this.isUnboundable(value));
  },
};
