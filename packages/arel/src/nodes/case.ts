import { Node, NodeVisitor } from "./node.js";
import { NodeExpression } from "./node-expression.js";
import { SqlLiteral } from "./sql-literal.js";
import { buildQuoted } from "./casted.js";
import { As, Binary } from "./binary.js";
import { Unary } from "./unary.js";

/**
 * Represents a CASE WHEN ... THEN ... ELSE ... END expression.
 *
 * Rails mutates in-place and returns self for chaining.
 *
 * Mirrors: Arel::Nodes::Case
 */
export class Case extends NodeExpression {
  readonly case: Node | null;
  readonly conditions: When[];
  default: Else | null;

  constructor(operand?: Node, defaultValue?: Node) {
    super();
    this.case = operand ?? null;
    this.conditions = [];
    this.default = defaultValue ? new Else(defaultValue) : null;
  }

  // Property-form override (vs. `when(...) {}`): Predications.when is
  // mixed into NodeExpression as a property via Included<>, and Case
  // overrides with self-mutating semantics (Rails: builds When clauses
  // on this.conditions, returns self).
  when = (condition: Node | unknown, result?: Node | unknown): this => {
    const whenNode = buildQuoted(condition);
    const thenNode = buildQuoted(result === undefined ? null : result);
    this.conditions.push(new When(whenNode, thenNode));
    return this;
  };

  else(result: Node | unknown): this {
    this.default = new Else(buildQuoted(result === undefined ? null : result));
    return this;
  }
  // Mirrors Arel::Nodes::Case#then — sets the right side of the most
  // recent When clause. Rails: `@conditions.last.right = build_quoted(expression)`.
  // Rails raises NoMethodError on `nil.right=` if no #when has been called;
  // we throw a clearer error for the same condition.
  //
  // Thenable hazard: defining `then` on a class makes instances Promise-
  // thenable. `Promise.resolve(caseNode)` invokes `then(onFulfilled, onRejected)`,
  // and `await caseNode` from async code does the same. We can't safely call
  // `onFulfilled(this)` because the Promise machinery would recursively try
  // to assimilate `this` (still thenable), causing an infinite loop. Instead
  // we reject with a TypeError so `await caseNode` throws clearly, rather
  // than hanging or silently yielding a stale value.
  // Overloads: narrow the Promise.then signature to `void` so typed Arel
  // callers chaining `.when().then(value).when()` see `this` (and TS can
  // resolve `this.when` without an undefined-check).
  then(onFulfilled: (v: unknown) => unknown, onRejected: (e: unknown) => unknown): void;
  then(result: Node | unknown): this;

  then(result: Node | unknown, onRejected?: unknown): this | void {
    if (typeof result === "function" && typeof onRejected === "function") {
      (onRejected as (e: Error) => unknown)(
        new TypeError("Arel::Nodes::Case is not awaitable; use #toSql() to render"),
      );
      return;
    }
    const last = this.conditions[this.conditions.length - 1];
    if (!last) throw new Error("Case#then called before Case#when");
    last.right = buildQuoted(result === undefined ? null : result);
    return this;
  }

  as(aliasName: string): As {
    return new As(this, new SqlLiteral(aliasName, { retryable: true }));
  }

  clone(): Case {
    const c = new Case(this.case ?? undefined);
    c.conditions.push(...this.conditions);
    c.default = this.default;
    return c;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

export class When extends Binary {}
export class Else extends Unary {}
