import { cloneSlot, objectClone } from "../clone-support.js";
import { Node } from "./node.js";
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
  case: Node | null;
  conditions: When[];
  default: Node | null;

  constructor(operand?: Node, defaultValue?: Node) {
    super();
    this.case = operand ?? null;
    this.conditions = [];
    // case.rb:11 stores the second argument raw — only `#else` wraps in an
    // Else node (case.rb:25-28).
    this.default = defaultValue ?? null;
  }

  // Overrides the mixed-in Predications.when with Case's self-mutating
  // semantics (case.rb:13-16). A prototype method, not an own property: an own
  // property would be copied by `objectClone` still closed over the ORIGINAL,
  // so a cloned Case's `#when` would mutate the original's conditions.
  when(condition: Node | unknown, result?: Node | unknown): this {
    const whenNode = buildQuoted(condition);
    const thenNode = buildQuoted(result === undefined ? null : result);
    this.conditions.push(new When(whenNode, thenNode));
    return this;
  }

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

  // Mirrors Arel::Nodes::Case#initialize_copy (case.rb:29-33), which Ruby runs
  // for `#clone`: each of the three slots is itself cloned, so a cloned Case
  // shares no sub-node with the original.
  clone(): this {
    const copy = objectClone(this);
    if (this.case) copy.case = cloneSlot(this.case);
    copy.conditions = this.conditions.map((x) => x.clone());
    if (this.default) copy.default = cloneSlot(this.default);
    return copy;
  }
}

export class When extends Binary {}
export class Else extends Unary {}
