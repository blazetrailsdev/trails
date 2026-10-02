import "../nodes/index.js";
import type { Attribute } from "../attributes/attribute.js";
import { Table } from "../table.js";
import { Visitor } from "./visitor.js";
import { Nodes, Visitors } from "../namespaces.js";
import { Attribute as ModelAttribute } from "@blazetrails/activemodel";
import { camelize } from "@blazetrails/activesupport";
import {
  rbFSend,
  rbObjAsString,
  rbObjClass,
  rbObjId,
  rbModConstSet,
} from "@blazetrails/ruby-compat";

export class Dot extends Visitor {
  private nodes: Node[] = [];
  private edges: Edge[] = [];
  private nodeStack: Node[] = [];
  private edgeStack: Edge[] = [];
  private seen: Map<number | bigint, Node> = new Map();

  override accept<C extends { append(str: string): C }>(object: unknown, collector: C): C {
    this.visit(object);
    return collector.append(this.toDot());
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
    this.visitEdge(o, "case_sensitive");
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
    this.visitEdge(o, "set_quantifier");
    this.visitEdge(o, "optimizer_hints");
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

  protected visitArelAttributesAttribute(o: Attribute): void {
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
    this.nodeStack[this.nodeStack.length - 1].fields.push(o);
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
    this.visitEdge(o, "value_before_type_cast");
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

  /** @missingRailsName send — PERMANENT */
  protected visitEdge(o: object, method: string): void {
    this.edge(method, () => this.visit(rbFSend(o, camelize(method, false))));
  }

  /**
   * @missingRailsName name — PERMANENT
   * @missingRailsName objectId — PERMANENT
   */
  protected override visit(o: unknown): unknown {
    let node = this.seen.get(rbObjId(o));
    if (node != null) {
      this.edgeStack[this.edgeStack.length - 1].to = node;
      return;
    }

    node = new Node(rbObjClass(o), rbObjId(o));
    this.seen.set(node.id, node);
    this.nodes.push(node);
    this.withNode(node, () => {
      super.visit(o);
    });
  }

  protected edge(name: string, block: () => void): void {
    const edge = new Edge(name, this.nodeStack[this.nodeStack.length - 1]);
    this.edgeStack.push(edge);
    this.edges.push(edge);
    block();
    this.edgeStack.pop();
  }

  protected withNode(node: Node, block: () => void): void {
    const edge = this.edgeStack[this.edgeStack.length - 1];
    if (edge) {
      edge.to = node;
    }

    this.nodeStack.push(node);
    block();
    this.nodeStack.pop();
  }

  protected quote(string: unknown): string {
    return rbObjAsString(string).replace(/"/g, '\\"');
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

  protected visitArelNodesExists(o: Nodes.Exists): void {
    this.visitEdge(o, "expressions");
    this.visitEdge(o, "alias");
  }
}

export class Node {
  readonly name: string;
  readonly id: number | bigint;
  readonly fields: unknown[];

  constructor(name: string, id: number | bigint, fields: unknown[] = []) {
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

rbModConstSet(Visitors, "Dot", Dot);
rbModConstSet(Dot, "Node", Node);
rbModConstSet(Dot, "Edge", Edge);
