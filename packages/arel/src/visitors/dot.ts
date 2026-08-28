import * as Nodes from "../nodes/index.js";
import { Table } from "../table.js";
import { Visitor, type NodeCtor } from "./visitor.js";
import { _setDot } from "../node-slots.js";
import { PlainString } from "../collectors/plain-string.js";
import { Attribute as ModelAttribute } from "@blazetrails/activemodel";
import { temporalClassName } from "../temporal-tag.js";
import { isHashAnalogue } from "./ruby-class.js";

type AppendableCollector = { append(s: string): unknown; value: string };

function isAppendableCollector(c: unknown): c is AppendableCollector {
  if (typeof c !== "object" || c === null) return false;
  const obj = c as Record<string, unknown>;
  return typeof obj.append === "function" && typeof obj.value === "string";
}

export class Dot extends Visitor {
  private nodes: Node[] = [];
  private edges: Edge[] = [];
  private nodeStack: Node[] = [];
  private edgeStack: Edge[] = [];
  private seen: Map<unknown, Node> = new Map();
  private nextId = 0;

  private static readonly NIL_SENTINEL = Symbol("Dot.NIL_SENTINEL");

  override accept(object: Nodes.Node, collector?: unknown): { value: string } {
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

  protected visitRegexp(o: Nodes.Regexp | Nodes.NotRegexp): void {
    this.visitEdge(o, "left");
    this.visitEdge(o, "right");
    this.visitEdge(o, "caseSensitive");
  }

  protected visitArelNodesRegexp(o: Nodes.Regexp): void {
    this.visitRegexp(o);
  }

  protected visitArelNodesNotRegexp(o: Nodes.NotRegexp): void {
    this.visitRegexp(o);
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

  protected visitNoEdges(_o: Nodes.Node): void {}

  protected visitArelNodesCurrentRow(o: Nodes.Node): void {
    this.visitNoEdges(o);
  }

  protected visitArelNodesDistinct(o: Nodes.Node): void {
    this.visitNoEdges(o);
  }

  protected visitArelNodesExtract(o: Nodes.Extract): void {
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
    this.visitEdge(o, "orders");
    this.visitEdge(o, "limit");
    this.visitEdge(o, "offset");
    this.visitEdge(o, "key");
  }

  protected visitArelNodesDeleteStatement(o: Nodes.DeleteStatement): void {
    this.visitEdge(o, "relation");
    this.visitEdge(o, "wheres");
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

  protected visitChildren(o: { children: ReadonlyArray<unknown> }): void {
    o.children.forEach((child, i) => {
      this.edge(String(i), () => this.visit(child));
    });
  }

  protected visitArelNodesAnd(o: { children: ReadonlyArray<unknown> }): void {
    this.visitChildren(o);
  }

  protected visitArelNodesOr(o: { children: ReadonlyArray<unknown> }): void {
    this.visitChildren(o);
  }

  protected visitArelNodesWith(o: { children: ReadonlyArray<unknown> }): void {
    this.visitChildren(o);
  }

  protected visitString(o: unknown): void {
    const top = this.nodeStack[this.nodeStack.length - 1];
    if (!top) return;
    const value = o instanceof Nodes.SqlLiteral ? o.value : o;
    top.fields.push(value == null ? "" : String(value));
  }

  protected visitTime(o: unknown): void {
    this.visitString(o);
  }

  protected visitDate(o: unknown): void {
    this.visitString(o);
  }

  protected visitDateTime(o: unknown): void {
    this.visitString(o);
  }

  protected visitNilClass(o: unknown): void {
    this.visitString(o);
  }

  protected visitTrueClass(o: unknown): void {
    this.visitString(o);
  }

  protected visitFalseClass(o: unknown): void {
    this.visitString(o);
  }

  protected visitInteger(o: unknown): void {
    this.visitString(o);
  }

  protected visitBigDecimal(o: unknown): void {
    this.visitString(o);
  }

  protected visitFloat(o: unknown): void {
    this.visitString(o);
  }

  protected visitSymbol(o: unknown): void {
    this.visitString(o);
  }

  protected visitArelNodesSqlLiteral(o: Nodes.SqlLiteral): void {
    this.visitString(o);
  }

  protected visitArelNodesBindParam(o: Nodes.BindParam): void {
    this.visitEdge(o, "value");
  }

  protected visitActiveModelAttribute(o: ModelAttribute): void {
    this.visitEdge(o, "valueBeforeTypeCast");
  }

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

  protected visitSet(o: ReadonlySet<unknown>): void {
    this.visitArray([...o]);
  }

  protected visitArelNodesComment(o: Nodes.Comment): void {
    this.visitEdge(o, "values");
  }

  protected visitArelNodesCase(o: Nodes.Case): void {
    this.visitEdge(o, "case");
    this.visitEdge(o, "conditions");
    this.visitEdge(o, "default");
  }

  protected visitEdge(o: object, method: string): void {
    if (!(method in o)) {
      const klass = (o as { constructor?: { name?: string } }).constructor?.name ?? "Object";
      // eslint-disable-next-line blazetrails/rails-error-parity -- Ruby raises NoMethodError/TypeError here; TypeError is its JS analogue, not a missing ported class.
      throw new TypeError(`undefined method '${method}' for ${klass}`);
    }
    this.edge(method, () => this.visit((o as Record<string, unknown>)[method]));
  }

  protected override visit(object: unknown, _collector?: unknown): unknown {
    const seenKey: unknown = (() => {
      if (object === null || object === undefined) return Dot.NIL_SENTINEL;
      const t = typeof object;
      if (t === "object") return object;
      if (t === "boolean") return `boolean:${object as boolean}`;
      if (t === "number") {
        const n = object as number;
        if (Number.isNaN(n)) return "number:NaN";
        if (Object.is(n, -0)) return "number:-0";
        return `number:${n}`;
      }
      if (t === "bigint") return `bigint:${(object as bigint).toString()}`;
      if (t === "symbol") return object;
      return undefined;
    })();

    if (seenKey !== undefined) {
      const seenNode = this.seen.get(seenKey);
      if (seenNode) {
        const e = this.edgeStack[this.edgeStack.length - 1];
        if (e) e.to = seenNode;
        return undefined;
      }
    }

    const node = new Node(this.classNameOf(object), this.nextId++);
    if (seenKey !== undefined) {
      this.seen.set(seenKey, node);
    }
    this.nodes.push(node);
    this.withNode(node, () => {
      super.visit(object);
    });
    return undefined;
  }

  protected edge(name: string, block: () => void): void {
    const edge = new Edge(name, this.nodeStack[this.nodeStack.length - 1]);
    this.edgeStack.push(edge);
    this.edges.push(edge);
    try {
      block();
    } finally {
      this.edgeStack.pop();
    }
  }

  protected withNode(node: Node, block: () => void): void {
    const e = this.edgeStack[this.edgeStack.length - 1];
    if (e) e.to = node;
    this.nodeStack.push(node);
    try {
      block();
    } finally {
      this.nodeStack.pop();
    }
  }

  protected quote(string: unknown): string {
    return String(string).replace(/"/g, '\\"');
  }

  protected toDot(): string {
    const header = 'digraph "Arel" {\nnode [width=0.375,height=0.25,shape=record];';
    const nodeLines = this.nodes.map((n) => {
      let label = `<f0>${n.name}`;
      n.fields.forEach((field, i) => {
        label += `|<f${i + 1}>${this.quote(field)}`;
      });
      return `${n.id} [label="${label}"];`;
    });
    const edgeLines = this.edges.map((e) => `${e.from.id} -> ${e.to!.id} [label="${e.name}"];`);
    return [header, ...nodeLines, ...edgeLines, "}"].join("\n");
  }

  compile(node: Nodes.Node): string {
    return this.accept(node).value;
  }

  protected visitArelNodesExists(o: Nodes.Exists): void {
    this.visitEdge(o, "expressions");
    this.visitEdge(o, "alias");
  }

  private classNameOf(o: unknown): string {
    if (o === null) return "NilClass";
    if (o === undefined) return "NilClass";
    if (typeof o === "string") return "String";
    if (typeof o === "number") return Number.isInteger(o) ? "Integer" : "Float";
    if (typeof o === "boolean") return o ? "TrueClass" : "FalseClass";
    if (typeof o === "bigint") return "Integer";
    // boundary: legacy JS Date values stringify to Rails' `Time` class name.
    if (o instanceof Date) return "Time";
    const temporalClass = temporalClassName(o);
    if (temporalClass) return temporalClass;
    if (isHashAnalogue(o)) return "Hash";
    const ctor = (o as { constructor?: { name?: string } }).constructor;
    return ctor?.name ?? "Object";
  }

  /** @internal */
  static registerDispatch(): void {
    const reg = (ctor: NodeCtor, m: string) => Dot.dispatchCache().set(ctor, m);
    reg(Nodes.Function, "visitArelNodesFunction");
    reg(Nodes.Sum, "visitArelNodesFunction");
    reg(Nodes.Max, "visitArelNodesFunction");
    reg(Nodes.Min, "visitArelNodesFunction");
    reg(Nodes.Avg, "visitArelNodesFunction");
    reg(Nodes.Exists, "visitArelNodesExists");
    reg(Nodes.NamedFunction, "visitArelNodesNamedFunction");
    reg(Nodes.Count, "visitArelNodesCount");
    reg(Nodes.Extract, "visitArelNodesExtract");
    reg(Nodes.Unary, "visitArelNodesUnary");
    reg(Nodes.Binary, "visitArelNodesBinary");
    reg(Nodes.UnaryOperation, "visitArelNodesUnaryOperation");
    reg(Nodes.InfixOperation, "visitArelNodesInfixOperation");
    reg(Nodes.Regexp, "visitArelNodesRegexp");
    reg(Nodes.NotRegexp, "visitArelNodesNotRegexp");
    reg(Nodes.Ordering, "visitArelNodesOrdering");
    reg(Nodes.TableAlias, "visitArelNodesTableAlias");
    reg(Nodes.ValuesList, "visitArelNodesValuesList");
    reg(Nodes.StringJoin, "visitArelNodesStringJoin");
    reg(Nodes.Window, "visitArelNodesWindow");
    reg(Nodes.NamedWindow, "visitArelNodesNamedWindow");
    reg(Nodes.CurrentRow, "visitArelNodesCurrentRow");
    reg(Nodes.Distinct, "visitArelNodesDistinct");
    reg(Nodes.InsertStatement, "visitArelNodesInsertStatement");
    reg(Nodes.SelectCore, "visitArelNodesSelectCore");
    reg(Nodes.SelectStatement, "visitArelNodesSelectStatement");
    reg(Nodes.UpdateStatement, "visitArelNodesUpdateStatement");
    reg(Nodes.DeleteStatement, "visitArelNodesDeleteStatement");
    reg(Nodes.Casted, "visitArelNodesCasted");
    reg(Nodes.HomogeneousIn, "visitArelNodesHomogeneousIn");
    reg(Nodes.Attribute, "visitArelAttributesAttribute");
    reg(Nodes.And, "visitArelNodesAnd");
    reg(Nodes.Or, "visitArelNodesOr");
    reg(Nodes.With, "visitArelNodesWith");
    reg(Nodes.WithRecursive, "visitArelNodesWith");
    reg(Nodes.SqlLiteral, "visitArelNodesSqlLiteral");
    reg(Nodes.BindParam, "visitArelNodesBindParam");
    reg(Nodes.Comment, "visitArelNodesComment");
    reg(Nodes.Case, "visitArelNodesCase");
    reg(ModelAttribute, "visitActiveModelAttribute");
    reg(Set, "visitSet");
    reg(Nodes.Quoted, "visitNoEdges");
    reg(Nodes.True, "visitNoEdges");
    reg(Nodes.False, "visitNoEdges");
    reg(Nodes.BoundSqlLiteral, "visitNoEdges");
    reg(Nodes.Fragments, "visitNoEdges");
  }
}

export class Node {
  readonly name: string;
  readonly id: number;
  readonly fields: string[];

  constructor(name: string, id: number, fields: string[] = []) {
    this.name = name;
    this.id = id;
    this.fields = fields;
  }
}

export class Edge {
  readonly name: string;
  readonly from: Node;
  to?: Node;

  constructor(name: string, from: Node) {
    this.name = name;
    this.from = from;
  }
}

_setDot(Dot);
