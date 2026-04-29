import { Node } from "./nodes/node.js";
import {
  NotEqual,
  GreaterThan,
  GreaterThanOrEqual,
  LessThan,
  LessThanOrEqual,
  Between,
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
import { Not } from "./nodes/unary.js";
import { Grouping } from "./nodes/grouping.js";
import { True } from "./nodes/true.js";
import { Case } from "./nodes/case.js";
import { Concat, Contains, Overlaps } from "./nodes/infix-operation.js";

/**
 * Host contract for the Predications mixin.
 *
 * Implementors provide `quotedNode(other)` which either type-casts (for
 * Attribute) or plain-wraps (for NodeExpression / InfixOperation) — same
 * role Rails' private `quoted_node` method plays inside Predications.
 */
export interface PredicationHost {
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

  // `between` / `notBetween` accept three forms — `[begin, end]`, `{ begin,
  // end }`, or `(begin, end)` — same as Attribute#between. Object-literal
  // methods can't carry overload signatures directly, so the public type
  // is asserted via `as` below; the implementation parameter list stays
  // permissive for the runtime branch.
  between: function (
    this: PredicationHost,
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
    if (beginVal === -Infinity && endVal === Infinity) return new True();
    if (beginVal === -Infinity) {
      return new LessThanOrEqual(this as unknown as Node, this.quotedNode(endVal));
    }
    if (endVal === Infinity) {
      return new GreaterThanOrEqual(this as unknown as Node, this.quotedNode(beginVal));
    }
    return new Between(
      this as unknown as Node,
      new And([this.quotedNode(beginVal), this.quotedNode(endVal)]),
    );
  } as {
    (
      this: PredicationHost,
      range: readonly [unknown, unknown],
    ): Between | LessThanOrEqual | GreaterThanOrEqual | True;
    (
      this: PredicationHost,
      range: { begin: unknown; end: unknown },
    ): Between | LessThanOrEqual | GreaterThanOrEqual | True;
    (
      this: PredicationHost,
      begin: unknown,
      end: unknown,
    ): Between | LessThanOrEqual | GreaterThanOrEqual | True;
  },

  notBetween: function (this: PredicationHost, beginOrRange: unknown, end?: unknown): Not {
    const self = this as unknown as { between(b: unknown, e?: unknown): Node };
    if (Array.isArray(beginOrRange) && end === undefined) {
      return new Not(self.between(beginOrRange));
    }
    if (
      typeof beginOrRange === "object" &&
      beginOrRange !== null &&
      !(beginOrRange instanceof Node) &&
      end === undefined &&
      "begin" in (beginOrRange as Record<string, unknown>) &&
      "end" in (beginOrRange as Record<string, unknown>)
    ) {
      return new Not(self.between(beginOrRange));
    }
    return new Not(self.between(beginOrRange, end));
  } as {
    (this: PredicationHost, range: readonly [unknown, unknown]): Not;
    (this: PredicationHost, range: { begin: unknown; end: unknown }): Not;
    (this: PredicationHost, begin: unknown, end: unknown): Not;
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
};
