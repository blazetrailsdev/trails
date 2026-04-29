import type { Included } from "@blazetrails/activesupport";
import { Node, NodeVisitor } from "./node.js";
import { Fragments } from "./fragments.js";
import { buildQuoted } from "./casted.js";

/**
 * SqlLiteral — a raw SQL string passed through unescaped.
 *
 * Mirrors: Arel::Nodes::SqlLiteral. Rails extends `String` and includes
 * Expressions, Predications, AliasPredication, OrderPredications. The
 * runtime mixin wiring lives in ../index.ts to avoid module-load cycles.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SqlLiteral extends Node {
  readonly value: string;
  retryableFlag = false;

  constructor(value: string, options?: { retryable?: boolean }) {
    super();
    this.value = value;
    if (options?.retryable) {
      this.retryableFlag = true;
    }
  }

  get retryable(): boolean {
    return this.retryableFlag;
  }

  fetchAttribute(_block?: (attr: Node) => unknown): unknown {
    return undefined;
  }

  // Required by the Predications mixin (mirrors Rails' private
  // Predications#quoted_node, which calls `Nodes.build_quoted(other, self)`).
  quotedNode(other: unknown): Node {
    return other instanceof Node ? other : buildQuoted(other, this);
  }

  join(other: Node): Fragments {
    return new Fragments([this, other]);
  }

  toYAML(): string {
    // Minimal YAML-ish representation for test parity (no external deps).
    const escaped = this.value.replace(/\n/g, "\\n");
    return `---\n!sql_literal\nvalue: ${JSON.stringify(escaped)}`;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

type _AliasPredication = import("../alias-predication.js").AliasPredicationModule;
type _OrderPredications = import("../order-predications.js").OrderPredicationsModule;
type _Expressions = import("../expressions.js").ExpressionsModule;
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface SqlLiteral
  extends
    Included<typeof import("../predications.js").Predications>,
    _Expressions,
    _AliasPredication,
    _OrderPredications {}
