import type { Attribute as ModelAttribute } from "@blazetrails/activemodel";
import type { Temporal } from "@blazetrails/activesupport/temporal";
import { Node, NodeVisitor } from "./node.js";
import { NodeExpression } from "./node-expression.js";
import { SqlLiteral } from "./sql-literal.js";
import { And } from "./and.js";
import { Or } from "./or.js";
import { Not } from "./unary.js";
import { Grouping } from "./grouping.js";
import type { Cte } from "./cte.js";
import type { SelectManager } from "../select-manager.js";

// `ModelAttribute` is not an Arel node but occupies node slots in Rails:
// `build_quoted` returns one unwrapped into the AST (casted.rb:50), and both
// Assignment (to_sql.rb:631) and ValuesList (to_sql.rb:110) accept one.
//
// This union types what may *occupy* a node slot, which in Rails is a strictly
// wider set than what `ToSql` can *visit*. Most scalar visitors are aliased to
// `unsupported` (to_sql.rb:832-845), so it is tempting to read that alias list
// as the set of types to exclude here. That inference is wrong: a slot value
// only reaches `visit` if the enclosing visitor sends it there, and the visitor
// that carries raw values into a slot this union types does not.
// `visit_Arel_Nodes_Assignment` (to_sql.rb:629-641) `case`s on the value and
// routes anything that is not a Node/Attribute to `quote(o.right)` — never to
// `visit`. So an arm below is justified by either a Rails *quoting* slot or a
// real rendering visitor, and the `unsupported` aliases only govern values that
// reach dispatch directly.
//
// `visit_Arel_Nodes_ValuesList` (to_sql.rb:100-118) has the identical
// quote-don't-visit shape and is cited below only as corroborating evidence for
// that Rails semantic — NOT as a slot this union types. `ValuesList` extends
// Unary and stores `rows: unknown[][]` in the expr slot (values-list.ts:10-17),
// and this union's array arm is `Node[]`, so no ValuesList row is typed by
// `NodeOrValue`.
export type NodeOrValue =
  | Node
  | ModelAttribute
  // A SelectManager occupies node slots in Rails' own CTE idiom —
  // `Arel::Nodes::As.new(cte_table, select_manager)` (select_manager.rb `#with`
  // takes those As nodes, and Rails' arel tests build them that way) — and
  // `visit_Arel_SelectManager` (to_sql.rb:358-361) is a real rendering visitor
  // that wraps `o.ast` in parens, so nothing here can reach `unsupported`.
  | SelectManager
  // Rails puts bare Strings in node slots structurally: `Cte#initialize` stores
  // the CTE name as `@left` (cte.rb:10-12), `TableAlias` the alias name as
  // `@right` (table_alias.rb), and Rails' own tests build
  // `Equality.new("foo", "bar")` (test/cases/arel/nodes/binary_test.rb:11).
  // These are read as `o.name` and quoted, so `visit_String` → `unsupported`
  // (to_sql.rb:842) is not reachable from them.
  | string
  // `visit_Integer` is a real rendering visitor (to_sql.rb:824-826). `bigint`
  // rides along because Ruby's Integer is arbitrary-precision with no separate
  // bignum visitor. TS cannot split integral from fractional `number`, so a
  // non-integral one is admitted here and raises at visit time via `visitFloat`
  // (`visit_Float` → `unsupported`, to_sql.rb:839), matching Rails.
  | number
  | bigint
  // Booleans reach a slot through `UpdateManager#set` (update-manager.ts),
  // whose values are user-supplied and passed through raw exactly as Rails
  // passes them. They render rather than raise, because Assignment quotes a
  // non-Node right instead of visiting it (to_sql.rb:637-639) —
  // `UPDATE "users" SET "admin" = TRUE`. The `visit_TrueClass`/
  // `visit_FalseClass` aliases (to_sql.rb:845, :838) govern only the
  // direct-dispatch path, which this slot never takes. Assignment is the sole
  // justifying slot; see the ValuesList caveat in the header comment.
  | boolean
  // The five Temporal types to-sql.ts actually visits and quotes (see
  // TEMPORAL_CLASS_NAMES in temporal-tag.ts). Duration/PlainYearMonth/
  // PlainMonthDay are deliberately absent: Rails has no visitor for them.
  // JS `Date` is absent too — it is rejected AR-wide (Temporal is the `Time`
  // analogue), and Rails aliases `visit_Date` to `unsupported`
  // (to_sql.rb:836), so a `Date` in a node slot can only ever raise.
  | Temporal.Instant
  | Temporal.ZonedDateTime
  | Temporal.PlainDateTime
  | Temporal.PlainDate
  | Temporal.PlainTime
  | Node[]
  // `nil` is a structural slot value in Rails, and every visitor that can meet
  // one guards first: `JoinSource#initialize(single_source, joinop = [])` takes
  // a nil source and `visit_Arel_Nodes_JoinSource` tests `if o.left`
  // (join_source.rb:11, to_sql.rb:510); `Join` defaults `right` to nil; and
  // `Equality`/`NotEqual` with a nil right render `IS NULL` / `IS NOT NULL`
  // rather than visiting it. So `visit_NilClass` being aliased to
  // `unsupported` (to_sql.rb:841) is not reachable from these slots.
  //
  // `undefined` is deliberately absent — the one arm this union drops. Ruby has
  // no analogue for it, so no Rails slot can hold one and no citation could
  // justify it; `null` is the sole nil, matching `visit_NilClass` being the
  // sole nil visitor. Admitting both let a JS-ism stand in for `nil` in a slot
  // whose Rails counterpart has exactly one.
  | null;

export const ATTRIBUTE_BRAND = Symbol.for("arel.Attribute");

function isAttribute(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  return (node as Record<symbol, unknown>)[ATTRIBUTE_BRAND] === true;
}

export function fetchAttributeFromBinary(
  left: NodeOrValue,
  right: NodeOrValue,
  block: (attr: Node) => unknown,
): unknown {
  if (isAttribute(left)) return block(left as Node);
  if (isAttribute(right)) return block(right as Node);
  return undefined;
}

export class Binary extends NodeExpression {
  left: NodeOrValue;
  right: NodeOrValue;

  constructor(left: NodeOrValue, right: NodeOrValue) {
    super();
    this.left = left;
    this.right = right;
  }

  as(aliasName: string): As {
    return new As(this, new SqlLiteral(aliasName, { retryable: true }));
  }

  and(other: Node): And {
    return new And([this, other]);
  }

  or(other: Node): Grouping {
    return new Grouping(new Or([this, other]));
  }

  not(): Not {
    return new Not(this);
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

export class Assignment extends Binary {}

// Cte lives in ./cte.ts (Rails parity) and extends Binary, which would be
// a hard cycle if `As.toCte` imported it directly. The package entrypoint
// (`./index.ts`) calls `_registerCteFactory` at load, mirroring the
// `registerBinaryInversions` / `registerNodeDeps` pattern used elsewhere.
let cteFactory: ((name: string | SqlLiteral, relation: Node) => Cte) | null = null;
export function _registerCteFactory(fn: (name: string | SqlLiteral, relation: Node) => Cte): void {
  cteFactory = fn;
}

export class As extends Binary {
  /** Mirrors: `Arel::Nodes::As#to_cte` (binary.rb:43-45) — `Cte.new(left.name, right)`. */
  toCte(): Cte {
    if (!cteFactory) {
      throw new Error(
        'As.toCte() requires the Cte factory registry. Import from "@blazetrails/arel" instead of deep-importing node classes.',
      );
    }
    const name = (this.left as { name: string | SqlLiteral }).name;
    return cteFactory(name, this.right as Node);
  }
}

export class Between extends Binary {
  fetchAttribute(block: (attr: Node) => unknown): unknown {
    return fetchAttributeFromBinary(this.left, this.right, block);
  }
}

export class NotEqual extends Binary {
  invert(): Node {
    if (!_invertRegistry.Equality) {
      throw new Error(
        'NotEqual.invert() requires the inversion registry. Import from "@blazetrails/arel" instead of deep-importing node classes.',
      );
    }
    return new _invertRegistry.Equality(this.left, this.right);
  }

  fetchAttribute(block: (attr: Node) => unknown): unknown {
    return fetchAttributeFromBinary(this.left, this.right, block);
  }
}

export class GreaterThan extends Binary {
  invert(): Node {
    return new LessThanOrEqual(this.left, this.right);
  }

  fetchAttribute(block: (attr: Node) => unknown): unknown {
    return fetchAttributeFromBinary(this.left, this.right, block);
  }
}

export class GreaterThanOrEqual extends Binary {
  invert(): Node {
    return new LessThan(this.left, this.right);
  }

  fetchAttribute(block: (attr: Node) => unknown): unknown {
    return fetchAttributeFromBinary(this.left, this.right, block);
  }
}

export class LessThan extends Binary {
  invert(): Node {
    return new GreaterThanOrEqual(this.left, this.right);
  }

  fetchAttribute(block: (attr: Node) => unknown): unknown {
    return fetchAttributeFromBinary(this.left, this.right, block);
  }
}

export class LessThanOrEqual extends Binary {
  invert(): Node {
    return new GreaterThan(this.left, this.right);
  }

  fetchAttribute(block: (attr: Node) => unknown): unknown {
    return fetchAttributeFromBinary(this.left, this.right, block);
  }
}

export class IsDistinctFrom extends Binary {
  invert(): Node {
    return new IsNotDistinctFrom(this.left, this.right);
  }

  fetchAttribute(block: (attr: Node) => unknown): unknown {
    return fetchAttributeFromBinary(this.left, this.right, block);
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

export class IsNotDistinctFrom extends Binary {
  invert(): Node {
    return new IsDistinctFrom(this.left, this.right);
  }

  fetchAttribute(block: (attr: Node) => unknown): unknown {
    return fetchAttributeFromBinary(this.left, this.right, block);
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

export class NotIn extends Binary {
  invert(): Node {
    if (!_invertRegistry.In) {
      throw new Error(
        'NotIn.invert() requires the inversion registry. Import from "@blazetrails/arel" instead of deep-importing node classes.',
      );
    }
    return new _invertRegistry.In(this.left, this.right);
  }

  fetchAttribute(block: (attr: Node) => unknown): unknown {
    return fetchAttributeFromBinary(this.left, this.right, block);
  }
}

/** Join base class — Rails defines via const_set in binary.rb */
export abstract class Join extends Binary {
  declare readonly left: Node;
  declare readonly right: Node | null;

  constructor(left: Node, right: Node | null = null) {
    super(left, right);
  }
}

export class CrossJoin extends Join {
  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

/** Set operations — Rails defines via const_set in binary.rb */
export class Union extends Binary {
  declare readonly left: Node;
  declare readonly right: Node;

  constructor(left: Node, right: Node) {
    super(left, right);
  }
}

export class UnionAll extends Binary {
  declare readonly left: Node;
  declare readonly right: Node;

  constructor(left: Node, right: Node) {
    super(left, right);
  }
}

export class Intersect extends Binary {
  declare readonly left: Node;
  declare readonly right: Node;

  constructor(left: Node, right: Node) {
    super(left, right);
  }
}

// Registry for breaking circular deps (Equality→Binary, In→Binary)
const _invertRegistry: {
  Equality?: new (left: NodeOrValue, right: NodeOrValue) => Binary;
  In?: new (left: NodeOrValue, right: NodeOrValue) => Binary;
} = {};

export function registerBinaryInversions(deps: {
  Equality: new (left: NodeOrValue, right: NodeOrValue) => Binary;
  In: new (left: NodeOrValue, right: NodeOrValue) => Binary;
}): void {
  _invertRegistry.Equality = deps.Equality;
  _invertRegistry.In = deps.In;
}

export interface FetchAttribute {
  fetchAttribute(block: (attr: Node) => unknown): unknown;
}

export class Except extends Binary {
  declare readonly left: Node;
  declare readonly right: Node;

  constructor(left: Node, right: Node) {
    super(left, right);
  }
}
