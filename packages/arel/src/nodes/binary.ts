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

// `ModelAttribute` is not an Arel node but occupies node slots in Rails:
// `build_quoted` returns one unwrapped into the AST (casted.rb:50), and both
// Assignment (to_sql.rb:631) and ValuesList (to_sql.rb:110) accept one.
//
// This union types what may *occupy* a Binary slot, which in Rails is a
// strictly wider set than what `ToSql` can *visit*. Most scalar visitors are
// aliased to `unsupported` (to_sql.rb:832-845), yet Rails still constructs and
// compares nodes holding those scalars — so an arm here is justified by a
// Rails construction site, not by a rendering visitor. Each non-Node arm below
// names one.
export type NodeOrValue =
  | Node
  | ModelAttribute
  // Rails puts bare Strings in both slots: `Cte#initialize` stores the CTE
  // name as `@left` (cte.rb:10-12), `TableAlias` the alias name as `@right`
  // (table_alias.rb), and Rails' own tests build `Equality.new("foo", "bar")`
  // (test/cases/arel/nodes/binary_test.rb:11). Visiting one still raises —
  // `visit_String` is aliased to `unsupported` (to_sql.rb:842) — because these
  // slots are read structurally (`o.name`) and quoted, never visited.
  | string
  // The one scalar Rails actually renders: `visit_Integer` is a real visitor
  // (to_sql.rb:824-826). `bigint` rides along because Ruby's Integer is
  // arbitrary-precision with no separate bignum visitor. TS cannot split
  // integral from fractional `number`, so a non-integral one is admitted here
  // and raises at visit time via `visitFloat` (`visit_Float` → `unsupported`,
  // to_sql.rb:839), matching Rails.
  | number
  | bigint
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
  // `boolean` and `undefined` are deliberately absent. `visit_TrueClass` /
  // `visit_FalseClass` are aliased to `unsupported` (to_sql.rb:845, :838) and
  // Rails has no construction site putting a bare true/false in a node slot —
  // callers wrap in `Casted`/`BindParam`, or use `Nodes::True`/`Nodes::False`.
  // `undefined` has no Ruby analogue at all; `null` is the sole nil.
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
let cteFactory: ((name: string, relation: Node) => Cte) | null = null;
export function _registerCteFactory(fn: (name: string, relation: Node) => Cte): void {
  cteFactory = fn;
}

export class As extends Binary {
  toCte(): Cte {
    const name = this.right instanceof SqlLiteral ? this.right.value : String(this.right);
    if (!cteFactory) {
      throw new Error(
        'As.toCte() requires the Cte factory registry. Import from "@blazetrails/arel" instead of deep-importing node classes.',
      );
    }
    return cteFactory(name, this.left as Node);
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
