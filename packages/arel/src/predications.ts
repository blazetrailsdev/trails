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

function isSelectManagerLike(value: unknown): value is { ast: Node } {
  return (
    typeof value === "object" &&
    value !== null &&
    !(value instanceof Node) &&
    (value as { ast?: unknown }).ast instanceof Node
  );
}

function isEnumerable(value: unknown): value is Iterable<unknown> {
  return typeof value === "object" && value !== null && Symbol.iterator in value;
}

export interface PredicationHost {
  /** @internal */
  quotedNode(other: unknown): Node;
  /** @internal */
  quotedArray(others: unknown[]): Node[];
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

type BetweenHost = Node & PredicationHost & RangePredicates;

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
    // eslint-disable-next-line blazetrails/rails-error-parity -- Ruby raises NoMethodError/TypeError here; TypeError is its JS analogue, not a missing ported class.
    throw new TypeError(
      `Predications.groupingAny/All: \`${methodId}\` is not a method on the host (${(host as object).constructor.name})`,
    );
  }
  const fn = member as (...args: unknown[]) => Node;
  return (expr) => fn.call(host, expr, ...extras);
}

/** @noRailsEquivalent PERMANENT */
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
  concat(other: Node): Concat;
  contains(other: unknown): Contains;
  overlaps(other: unknown): Overlaps;
  quotedArray(others: unknown[]): Node[];
  isInfinity(value: unknown): 1 | -1 | 0;
  isUnboundable(value: unknown): 1 | -1 | 0;
  isOpenEnded(value: unknown): boolean;
}

export const Predications: PredicationsModule = {
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
    if (isSelectManagerLike(other)) return new In(this, other.ast);
    if (isEnumerable(other)) return new In(this, this.quotedArray([...other]));
    return new In(this, this.quotedNode(other));
  },
  notIn(this: Node & PredicationHost, other: unknown): NotIn {
    if (isSelectManagerLike(other)) return new NotIn(this, other.ast);
    if (isEnumerable(other)) return new NotIn(this, this.quotedArray([...other]));
    return new NotIn(this, this.quotedNode(other));
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
      return new Between(this, new And([left, right]));
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

  groupingAny<T extends PredicationHost>(
    this: T,
    methodId: string | ((this: T, expr: unknown, ...extras: unknown[]) => Node),
    others: unknown[],
    ...extras: unknown[]
  ): Grouping {
    const nodes = others.map(predicationDispatch(this, methodId, extras));
    if (nodes.length === 0) return new Grouping(new SqlLiteral("NULL", { retryable: true }));
    return new Grouping(nodes.reduce((memo, node) => new Or([memo, node])));
  },

  groupingAll<T extends PredicationHost>(
    this: T,
    methodId: string | ((this: T, expr: unknown, ...extras: unknown[]) => Node),
    others: unknown[],
    ...extras: unknown[]
  ): Grouping {
    const nodes = others.map(predicationDispatch(this, methodId, extras));
    return new Grouping(new And(nodes));
  },

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
