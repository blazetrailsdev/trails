import { Node } from "../nodes/node.js";
import * as Nodes from "../nodes/index.js";
import { Table } from "../table.js";
import { Visitor, type NodeCtor } from "./visitor.js";
import { PlainString } from "../collectors/plain-string.js";

type AppendableCollector = { append(s: string): unknown; value: string };

function isAppendableCollector(c: unknown): c is AppendableCollector {
  if (typeof c !== "object" || c === null) return false;
  const obj = c as Record<string, unknown>;
  return typeof obj.append === "function" && typeof obj.value === "string";
}

/** Mirrors `Arel::Visitors::Dot::Node` — a labeled box with side-fields. */
export class DotNode {
  readonly name: string;
  readonly id: number;
  readonly fields: string[];

  constructor(name: string, id: number, fields: string[] = []) {
    this.name = name;
    this.id = id;
    this.fields = fields;
  }
}

/**
 * Mirrors `Arel::Visitors::Dot::Edge` (a Struct of name/from/to).
 * `to` is `undefined` between construction (in `edge()`) and the inner
 * `withNode()` call that supplies the destination. `toDot` asserts it's
 * populated by the time the graph is rendered.
 */
export class DotEdge {
  readonly name: string;
  readonly from: DotNode;
  to?: DotNode;

  constructor(name: string, from: DotNode) {
    this.name = name;
    this.from = from;
  }
}

/**
 * Dot visitor — renders the AST as a Graphviz dot graph.
 *
 * Mirrors: Arel::Visitors::Dot (activerecord/lib/arel/visitors/dot.rb).
 * Each visit method names the children it should walk; `visit_edge`
 * follows a named field, allocating a Node + Edge per traversed value.
 * `visit__no_edges` and `visit__children` / `visit__regexp` are aliased
 * by multiple node types, mirroring Rails' `alias`.
 */
export class Dot extends Visitor {
  private nodes: DotNode[] = [];
  private edges: DotEdge[] = [];
  private nodeStack: DotNode[] = [];
  private edgeStack: DotEdge[] = [];
  private seen: Map<unknown, DotNode> = new Map();
  private nextId = 0;

  /**
   * Sentinel key for `null`/`undefined` in the seen-map. Rails treats
   * `nil` as a singleton via `nil.object_id`; we collapse JS `null` and
   * `undefined` onto one entry so a graph with both produces a single
   * NilClass node, matching Rails' shape.
   */
  private static readonly NIL_SENTINEL = Symbol("Dot.NIL_SENTINEL");

  override accept(object: Node, collector?: unknown): { value: string } {
    // Lazily register Table — at static-block time `Table` (imported from
    // ../table.js) is a partial forwarding ref due to a circular import via
    // tree-manager.js. By the first instance call the class is fully loaded.
    if (!this.dispatch.has(Table)) {
      this.dispatch.set(Table, "visitArelTable");
    }

    this.nodes = [];
    this.edges = [];
    this.nodeStack = [];
    this.edgeStack = [];
    this.seen = new Map();
    this.nextId = 0;

    this.visit(object);
    const sink = isAppendableCollector(collector) ? collector : new PlainString();
    sink.append(this.toDot());
    return sink as { value: string };
  }

  /** Convenience entry that returns the dot string directly. */
  compile(node: Node): string {
    return this.accept(node).value;
  }

  // ---------------------------------------------------------------------
  // visit_* methods (per-node-type edge declarations)
  // ---------------------------------------------------------------------

  protected visitArelNodesFunction(o: Nodes.Function): void {
    this.visitEdge(o, "expressions");
    this.visitEdge(o, "distinct");
    this.visitEdge(o, "alias");
  }

  protected visitArelNodesUnary(o: Nodes.Unary): void {
    this.visitEdge(o, "expr");
  }

  protected visitArelNodesBinary(o: Nodes.Binary): void {
    this.visitEdge(o, "left");
    this.visitEdge(o, "right");
  }

  protected visitArelNodesUnaryOperation(o: Nodes.UnaryOperation): void {
    this.visitEdge(o, "operator");
    this.visitEdge(o, "expr");
  }

  protected visitArelNodesInfixOperation(o: Nodes.InfixOperation): void {
    this.visitEdge(o, "operator");
    this.visitEdge(o, "left");
    this.visitEdge(o, "right");
  }

  /** Aliased to Regexp / NotRegexp in dispatch (Rails: `alias`). */
  protected visitRegexp(o: Nodes.Regexp | Nodes.NotRegexp): void {
    this.visitEdge(o, "left");
    this.visitEdge(o, "right");
    this.visitEdge(o, "caseSensitive");
  }

  protected visitArelNodesOrdering(o: Nodes.Ordering): void {
    this.visitEdge(o, "expr");
  }

  protected visitArelNodesTableAlias(o: Nodes.TableAlias): void {
    this.visitEdge(o, "name");
    this.visitEdge(o, "relation");
  }

  protected visitArelNodesCount(o: Nodes.Count): void {
    this.visitEdge(o, "expressions");
    this.visitEdge(o, "distinct");
  }

  protected visitArelNodesValuesList(o: Nodes.ValuesList): void {
    this.visitEdge(o, "rows");
  }

  protected visitArelNodesStringJoin(o: Nodes.StringJoin): void {
    this.visitEdge(o, "left");
  }

  protected visitArelNodesWindow(o: Nodes.Window): void {
    this.visitEdge(o, "partitions");
    this.visitEdge(o, "orders");
    this.visitEdge(o, "framing");
  }

  protected visitArelNodesNamedWindow(o: Nodes.NamedWindow): void {
    this.visitEdge(o, "partitions");
    this.visitEdge(o, "orders");
    this.visitEdge(o, "framing");
    this.visitEdge(o, "name");
  }

  /** Aliased to CurrentRow / Distinct in dispatch (Rails: `alias`). */
  protected visitNoEdges(_o: Node): void {
    // intentionally left blank
  }

  /**
   * Trails' Extract extends Unary with `expr` + `field` (rather than Rails'
   * Function-shaped `expressions` + `alias`). Walk the actual fields so the
   * graph reflects the AST instead of emitting nil edges.
   */
  protected visitArelNodesExtract(o: Nodes.Extract): void {
    this.visitEdge(o, "expr");
    this.visitEdge(o, "field");
  }

  /**
   * Trails' Exists is a standalone Node with `expressions: Node` (single)
   * and `alias` — not a Function subclass like Rails. Walk only the two
   * fields it actually has; the generic visitArelNodesFunction would emit
   * a `distinct` edge that doesn't exist on this node.
   */
  protected visitArelNodesExists(o: Nodes.Exists): void {
    this.visitEdge(o, "expressions");
    this.visitEdge(o, "alias");
  }

  protected visitArelNodesNamedFunction(o: Nodes.NamedFunction): void {
    this.visitEdge(o, "name");
    this.visitEdge(o, "expressions");
    this.visitEdge(o, "distinct");
    this.visitEdge(o, "alias");
  }

  protected visitArelNodesInsertStatement(o: Nodes.InsertStatement): void {
    this.visitEdge(o, "relation");
    this.visitEdge(o, "columns");
    this.visitEdge(o, "values");
    this.visitEdge(o, "select");
  }

  protected visitArelNodesSelectCore(o: Nodes.SelectCore): void {
    this.visitEdge(o, "source");
    this.visitEdge(o, "projections");
    this.visitEdge(o, "wheres");
    this.visitEdge(o, "windows");
    this.visitEdge(o, "groups");
    this.visitEdge(o, "comment");
    this.visitEdge(o, "havings");
    this.visitEdge(o, "setQuantifier");
    this.visitEdge(o, "optimizerHints");
  }

  protected visitArelNodesSelectStatement(o: Nodes.SelectStatement): void {
    this.visitEdge(o, "cores");
    this.visitEdge(o, "limit");
    this.visitEdge(o, "orders");
    this.visitEdge(o, "offset");
    this.visitEdge(o, "lock");
    this.visitEdge(o, "with");
  }

  protected visitArelNodesUpdateStatement(o: Nodes.UpdateStatement): void {
    this.visitEdge(o, "relation");
    this.visitEdge(o, "wheres");
    this.visitEdge(o, "values");
    this.visitEdge(o, "groups");
    this.visitEdge(o, "havings");
    this.visitEdge(o, "orders");
    this.visitEdge(o, "limit");
    this.visitEdge(o, "offset");
    this.visitEdge(o, "key");
  }

  protected visitArelNodesDeleteStatement(o: Nodes.DeleteStatement): void {
    this.visitEdge(o, "relation");
    this.visitEdge(o, "wheres");
    this.visitEdge(o, "groups");
    this.visitEdge(o, "havings");
    this.visitEdge(o, "orders");
    this.visitEdge(o, "limit");
    this.visitEdge(o, "offset");
    this.visitEdge(o, "key");
  }

  protected visitArelTable(o: Table): void {
    this.visitEdge(o, "name");
  }

  protected visitArelNodesCasted(o: Nodes.Casted): void {
    this.visitEdge(o, "value");
    this.visitEdge(o, "attribute");
  }

  protected visitArelNodesHomogeneousIn(o: Nodes.HomogeneousIn): void {
    this.visitEdge(o, "values");
    this.visitEdge(o, "type");
    this.visitEdge(o, "attribute");
  }

  protected visitArelAttributesAttribute(o: Nodes.Attribute): void {
    this.visitEdge(o, "relation");
    this.visitEdge(o, "name");
  }

  /** Aliased to And / Or / With in dispatch (Rails: `alias`). */
  protected visitChildren(o: { children: ReadonlyArray<unknown> }): void {
    o.children.forEach((child, i) => {
      this.edge(String(i), () => this.visit(child));
    });
  }

  /**
   * Aliased to String / Time / Date / Integer / etc. — stash the value as a
   * side-field on the current node. Rails' `visit_Arel_Nodes_SqlLiteral` is
   * an alias of `visit_String` and works because `SqlLiteral < String` in
   * Ruby; Trails wraps the string in `node.value`, so we unwrap here.
   *
   * `null`/`undefined` render as `""` to match Rails' `nil.to_s` ("") that
   * `to_dot`'s `quote field` produces — not JS's `String(null)` ("null").
   */
  protected visitString(o: unknown): void {
    const top = this.nodeStack[this.nodeStack.length - 1];
    if (!top) return;
    const value = o instanceof Nodes.SqlLiteral ? o.value : o;
    top.fields.push(value == null ? "" : String(value));
  }

  protected visitArelNodesBindParam(o: Nodes.BindParam): void {
    this.visitEdge(o, "value");
  }

  protected visitActiveModelAttribute(o: { valueBeforeTypeCast?: unknown }): void {
    this.visitEdge(o, "valueBeforeTypeCast");
  }

  /**
   * Mirrors Rails: `visit_Hash` (dot.rb:227). The outer edge label is
   * `pair_#{i}`; the inner `visit pair` dispatches to `visit_Array` so
   * each key and value becomes a child node under the pair, preserving
   * both halves of the entry in the graph.
   */
  protected visitHash(o: Record<string, unknown>): void {
    Object.entries(o).forEach((pair, i) => {
      this.edge(`pair_${i}`, () => this.visit(pair));
    });
  }

  protected visitArray(o: ReadonlyArray<unknown>): void {
    o.forEach((member, i) => {
      this.edge(String(i), () => this.visit(member));
    });
  }

  protected visitArelNodesComment(o: Nodes.Comment): void {
    this.visitEdge(o, "values");
  }

  protected visitArelNodesCase(o: Nodes.Case): void {
    this.visitEdge(o, "case");
    this.visitEdge(o, "conditions");
    this.visitEdge(o, "default");
  }

  /**
   * Trails' OptimizerHints carries hints on `hints`, not on Unary's
   * `expr` field (which stays `null` — see nodes/unary.ts). The default
   * Unary fallback would visit `expr` and miss the hints entirely.
   */
  protected visitArelNodesOptimizerHints(o: Nodes.OptimizerHints): void {
    this.visitEdge(o, "hints");
  }

  // ---------------------------------------------------------------------
  // Core machinery (visit, edge, with_node, quote, to_dot)
  // ---------------------------------------------------------------------

  /**
   * Mirrors Rails' Dot#visit_edge — descend into a named field. Rails uses
   * `o.send(method)`, which raises `NoMethodError` on a typo; we mirror
   * that by checking the property exists (allowing `null`/`undefined` when
   * the field is declared but unset). A typo'd field would otherwise
   * silently emit a NilClass leaf and obscure the visitor bug.
   */
  protected visitEdge(o: object, method: string): void {
    if (!(method in o)) {
      const klass = (o as { constructor?: { name?: string } }).constructor?.name ?? "Object";
      throw new TypeError(`undefined method '${method}' for ${klass}`);
    }
    const value = (o as Record<string, unknown>)[method];
    this.edge(method, () => this.visit(value));
  }

  /** Mirrors Rails' Dot#edge — push edge, run block, pop. */
  protected edge(name: string, block: () => void): void {
    const from = this.nodeStack[this.nodeStack.length - 1]!;
    const e = new DotEdge(name, from);
    this.edgeStack.push(e);
    this.edges.push(e);
    try {
      block();
    } finally {
      this.edgeStack.pop();
    }
  }

  /** Mirrors Rails' Dot#with_node — link incoming edge then push node. */
  protected withNode(node: DotNode, block: () => void): void {
    const e = this.edgeStack[this.edgeStack.length - 1];
    if (e) e.to = node;
    this.nodeStack.push(node);
    try {
      block();
    } finally {
      this.nodeStack.pop();
    }
  }

  /** Mirrors Rails' Dot#quote — escape `"` for inclusion in a label. */
  protected quote(value: unknown): string {
    return String(value).replace(/"/g, '\\"');
  }

  /**
   * Mirrors Rails' Dot#visit. Reuses an already-emitted node (sets the
   * incoming edge's `to` to the seen node) and recurses through
   * super.visit (the dispatch table) to fire the per-class handler.
   */
  protected override visit(object: unknown, _collector?: unknown): unknown {
    // Rails keys @seen by `object_id` — preserves per-instance identity
    // for heap objects (two `String.new("foo")` get distinct entries) but
    // dedupes Ruby singletons (nil / true / false / Symbols / small
    // Integers / Floats / Bignums all share a stable object_id).
    //
    // JS Map's primitive equality is value-based, which would falsely
    // collapse two Tables that share a `name` string. Memoize:
    //   - reference-typed values, by reference identity;
    //   - null/undefined, collapsed onto NIL_SENTINEL so a single
    //     NilClass node represents Rails' nil singleton;
    //   - booleans / numbers / bigints / symbols, via typed-prefix keys
    //     so repeated equal scalar edges (e.g. Regexp#caseSensitive) reuse
    //     one DotNode the way Rails does;
    //   - strings are explicitly excluded — they DON'T dedupe in Ruby
    //     (each String.new gets its own object_id), and a value-based
    //     dedupe would wrongly collapse same-named Tables.
    const seenKey: unknown = (() => {
      if (object === null || object === undefined) return Dot.NIL_SENTINEL;
      const t = typeof object;
      if (t === "object") return object; // reference identity
      if (t === "boolean") return `boolean:${object as boolean}`;
      if (t === "number") {
        const n = object as number;
        if (Number.isNaN(n)) return "number:NaN";
        if (Object.is(n, -0)) return "number:-0";
        return `number:${n}`;
      }
      if (t === "bigint") return `bigint:${(object as bigint).toString()}`;
      if (t === "symbol") return object; // Symbol identity is reference-like
      return undefined; // strings: no dedupe
    })();

    if (seenKey !== undefined) {
      const seenNode = this.seen.get(seenKey);
      if (seenNode) {
        const e = this.edgeStack[this.edgeStack.length - 1];
        if (e) e.to = seenNode;
        return undefined;
      }
    }

    // Mirrors Rails' Dot#visit: every value (including primitives) gets a
    // Node entry whose `name` is the value's class. visit_String / visit_Hash
    // / visit_Array then mutate the new node's fields/edges.
    const node = new DotNode(this.classNameOf(object), this.nextId++);
    if (seenKey !== undefined) {
      this.seen.set(seenKey, node);
    }
    this.nodes.push(node);
    this.withNode(node, () => {
      if (this.isPrimitive(object)) {
        this.visitString(object);
      } else if (Array.isArray(object)) {
        this.visitArray(object);
      } else if (object instanceof Node) {
        super.visit(object);
      } else if (this.isActiveModelAttribute(object)) {
        // Mirrors Rails' `visit_ActiveModel_Attribute`. Checked after the
        // Node branch — Trails' BindParam *also* exposes a
        // `valueBeforeTypeCast` method via NodeExpression duck-typing, so
        // we only fall here for non-Node value objects.
        this.visitActiveModelAttribute(object as { valueBeforeTypeCast?: unknown });
      } else if (this.isPlainObject(object)) {
        this.visitHash(object as unknown as Record<string, unknown>);
      } else {
        // Unknown non-Node object — render as a leaf with its String form
        // so unfamiliar value classes don't crash the visitor.
        this.visitString(object);
      }
    });
    return undefined;
  }

  /**
   * Mirrors Rails' Dot#to_dot — emits the digraph header, one
   * `id [label="..."]` line per node, then one `from -> to [label="..."]`
   * line per edge.
   */
  protected toDot(): string {
    const header = 'digraph "Arel" {\nnode [width=0.375,height=0.25,shape=record];';
    const nodeLines = this.nodes.map((n) => {
      let label = `<f0>${n.name}`;
      n.fields.forEach((field, i) => {
        label += `|<f${i + 1}>${this.quote(field)}`;
      });
      return `${n.id} [label="${label}"];`;
    });
    // Every visit() in this Dot opens a Node and routes through withNode,
    // which sets the incoming edge's `to`. So `e.to` is always populated
    // by the time toDot runs — assert it (rather than silently dropping
    // edges) so a regression that breaks the invariant fails loudly.
    const edgeLines = this.edges.map((e) => {
      if (!e.to) {
        throw new Error(`Dot: edge "${e.name}" has no destination node`);
      }
      return `${e.from.id} -> ${e.to.id} [label="${e.name}"];`;
    });
    return [header, ...nodeLines, ...edgeLines, "}"].join("\n");
  }

  private isPrimitive(o: unknown): boolean {
    if (o === null || o === undefined) return true;
    const t = typeof o;
    return (
      t === "string" ||
      t === "number" ||
      t === "boolean" ||
      t === "bigint" ||
      t === "symbol" ||
      o instanceof Date
    );
  }

  private isActiveModelAttribute(o: unknown): boolean {
    return (
      typeof o === "object" && o !== null && "valueBeforeTypeCast" in (o as Record<string, unknown>)
    );
  }

  private isPlainObject(o: unknown): boolean {
    if (!o || typeof o !== "object") return false;
    if (Array.isArray(o)) return false;
    // Node covers Table (which extends Node).
    if (o instanceof Node) return false;
    const proto = Object.getPrototypeOf(o);
    return proto === Object.prototype || proto === null;
  }

  /**
   * Rails: `o.class.name`. We use the JS ctor name for objects and emit
   * Rails-style class names for primitives and nil values — `String`,
   * `Integer`, `Float`, `TrueClass`, `FalseClass`, `NilClass`, `Symbol`,
   * `Time` — so leaf nodes match Rails' shape.
   */
  private classNameOf(o: unknown): string {
    if (o === null) return "NilClass";
    if (o === undefined) return "NilClass";
    if (typeof o === "string") return "String";
    if (typeof o === "number") return Number.isInteger(o) ? "Integer" : "Float";
    if (typeof o === "boolean") return o ? "TrueClass" : "FalseClass";
    if (typeof o === "bigint") return "Integer";
    if (typeof o === "symbol") return "Symbol";
    if (o instanceof Date) return "Time";
    const ctor = (o as { constructor?: { name?: string } }).constructor;
    return ctor?.name ?? "Object";
  }

  static {
    const reg = (ctor: NodeCtor, m: string) => Dot.dispatchCache().set(ctor, m);
    // Function family
    reg(Nodes.Function, "visitArelNodesFunction");
    // Each aggregate has its own Rails alias chain; Trails dispatches them
    // explicitly to keep the Rails-named helper visible.
    reg(Nodes.Sum, "visitArelNodesFunction");
    reg(Nodes.Max, "visitArelNodesFunction");
    reg(Nodes.Min, "visitArelNodesFunction");
    reg(Nodes.Avg, "visitArelNodesFunction");
    reg(Nodes.Exists, "visitArelNodesExists");
    reg(Nodes.NamedFunction, "visitArelNodesNamedFunction");
    reg(Nodes.Count, "visitArelNodesCount");
    reg(Nodes.Extract, "visitArelNodesExtract");
    // Unary / Binary / specialized
    reg(Nodes.Unary, "visitArelNodesUnary");
    reg(Nodes.Binary, "visitArelNodesBinary");
    reg(Nodes.UnaryOperation, "visitArelNodesUnaryOperation");
    reg(Nodes.InfixOperation, "visitArelNodesInfixOperation");
    reg(Nodes.Regexp, "visitRegexp");
    reg(Nodes.NotRegexp, "visitRegexp");
    reg(Nodes.Ordering, "visitArelNodesOrdering");
    reg(Nodes.TableAlias, "visitArelNodesTableAlias");
    reg(Nodes.ValuesList, "visitArelNodesValuesList");
    reg(Nodes.StringJoin, "visitArelNodesStringJoin");
    reg(Nodes.Window, "visitArelNodesWindow");
    reg(Nodes.NamedWindow, "visitArelNodesNamedWindow");
    reg(Nodes.CurrentRow, "visitNoEdges");
    reg(Nodes.Distinct, "visitNoEdges");
    // Statements
    reg(Nodes.InsertStatement, "visitArelNodesInsertStatement");
    reg(Nodes.SelectCore, "visitArelNodesSelectCore");
    reg(Nodes.SelectStatement, "visitArelNodesSelectStatement");
    reg(Nodes.UpdateStatement, "visitArelNodesUpdateStatement");
    reg(Nodes.DeleteStatement, "visitArelNodesDeleteStatement");
    // Misc — `Table` is registered lazily in accept() (it's mid-load
    // here due to a circular import via tree-manager).
    reg(Nodes.Casted, "visitArelNodesCasted");
    reg(Nodes.HomogeneousIn, "visitArelNodesHomogeneousIn");
    reg(Nodes.Attribute, "visitArelAttributesAttribute");
    reg(Nodes.And, "visitChildren");
    reg(Nodes.Or, "visitChildren");
    reg(Nodes.With, "visitChildren");
    reg(Nodes.WithRecursive, "visitChildren");
    reg(Nodes.SqlLiteral, "visitString");
    reg(Nodes.BindParam, "visitArelNodesBindParam");
    reg(Nodes.Comment, "visitArelNodesComment");
    reg(Nodes.Case, "visitArelNodesCase");
    // Quoted, True, False, BoundSqlLiteral, Fragments don't extend any
    // ancestor with a useful Dot handler — register explicitly as leaves.
    reg(Nodes.Quoted, "visitNoEdges");
    reg(Nodes.True, "visitNoEdges");
    reg(Nodes.False, "visitNoEdges");
    reg(Nodes.BoundSqlLiteral, "visitNoEdges");
    reg(Nodes.Fragments, "visitNoEdges");
    reg(Nodes.SelectOptions, "visitNoEdges");
    reg(Nodes.OptimizerHints, "visitArelNodesOptimizerHints");
    // Other Trails nodes inherit from registered ancestors (Unary/Binary/
    // InfixOperation/Ordering/Function), so the Visitor.resolveDispatch
    // prototype walk routes them through the right handler at first use.
  }
}
