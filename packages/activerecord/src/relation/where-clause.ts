import { rbEqual } from "@blazetrails/activesupport";

import { Nodes, fetchAttribute, sql } from "@blazetrails/arel";
import { ArgumentError, Attribute as ModelAttribute } from "@blazetrails/activemodel";

export class WhereClause {
  private _predicates: (Nodes.Node | string)[];

  /** @internal */
  get predicates(): (Nodes.Node | string)[] {
    return this._predicates;
  }

  /** @internal */
  set predicates(value: (Nodes.Node | string)[]) {
    this._predicates = value;
  }

  constructor(predicates: (Nodes.Node | string)[] = []) {
    this._predicates = predicates;
  }

  static empty(): WhereClause {
    return new WhereClause();
  }

  isEmpty(): boolean {
    return this.predicates.length === 0;
  }

  any(): boolean {
    return this.predicates.length > 0;
  }

  plus(other: WhereClause): WhereClause {
    return new WhereClause([...this.predicates, ...other.predicates]);
  }

  minus(other: WhereClause): WhereClause {
    return new WhereClause(subtractNodes(this.predicates, other.predicates));
  }

  union(other: WhereClause): WhereClause {
    return new WhereClause(unionNodes(this.predicates, other.predicates));
  }

  merge(other: WhereClause): WhereClause {
    const filtered = this.exceptPredicates(other.extractAttributes());
    return new WhereClause(unionNodes(filtered, other.predicates));
  }

  /**
   * @missingRailsCall first — PERMANENT
   * @missingRailsCall size — PERMANENT
   */
  invert(): WhereClause {
    if (this.predicates.length === 1) {
      return new WhereClause([invertPredicate(this.predicates[0])]);
    }
    return new WhereClause([new Nodes.Not(this.ast)]);
  }

  except(...columns: (string | Nodes.Attribute | Nodes.Node)[]): WhereClause {
    return new WhereClause(this.exceptPredicates(columns));
  }

  clear(): void {
    this.predicates.length = 0;
  }

  clone(): WhereClause {
    return new WhereClause([...this.predicates]);
  }

  or(other: WhereClause): WhereClause {
    const leftClause = this.minus(other);
    const common = this.minus(leftClause);
    const rightClause = other.minus(common);

    if (leftClause.isEmpty() || rightClause.isEmpty()) {
      return common;
    } else {
      let left: Nodes.Node = leftClause.ast;
      if (left instanceof Nodes.Grouping && left.expr instanceof Nodes.Node) left = left.expr;

      let right: Nodes.Node = rightClause.ast;
      if (right instanceof Nodes.Grouping && right.expr instanceof Nodes.Node) right = right.expr;

      const orClause =
        left instanceof Nodes.Or
          ? new Nodes.Or([...left.children, right])
          : new Nodes.Or([left, right]);

      common.predicates.push(new Nodes.Grouping(orClause));
      return common;
    }
  }

  get ast(): Nodes.Node {
    const predicates = this.predicatesWithWrappedSqlLiterals();
    return predicates.length === 1 ? predicates[0] : new Nodes.And(predicates);
  }

  equals(other: unknown): boolean {
    return (
      other instanceof WhereClause &&
      this.predicates.length === other.predicates.length &&
      this.predicates.every((predicate, i) =>
        rbEqual(typeof predicate === "string" ? sql(predicate) : predicate, other.predicates[i]),
      )
    );
  }

  /** @missingRailsCall any? — PERMANENT */
  isContradiction(): boolean {
    for (const node of this.predicates) {
      if (node instanceof Nodes.In) {
        const right = (node as any).right;
        if (Array.isArray(right) && right.length === 0) return true;
      }
      if (node instanceof Nodes.Equality) {
        const right = (node as any).right;
        if (right && typeof right === "object" && "unboundable" in right && right.unboundable)
          return true;
      }
    }
    return false;
  }

  extractAttributes(): (string | Nodes.Attribute | Nodes.Node)[] {
    const attrs: (string | Nodes.Attribute | Nodes.Node)[] = [];
    this.eachAttributes((attr) => attrs.push(attr));
    return attrs;
  }

  toH(tableName?: string, opts: { equalityOnly?: boolean } = {}): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const node of equalities(this.predicates, opts.equalityOnly ?? false)) {
      const attr = extractAttribute(node);
      if (attr === null) continue;
      if (tableName !== undefined && String(attr.relation.name) !== tableName) continue;
      result[String(attr.name)] = extractNodeValue((node as any).right);
    }
    return result;
  }

  /** @internal */
  private exceptPredicates(
    columns: (string | Nodes.Attribute | Nodes.Node)[],
  ): (Nodes.Node | string)[] {
    const attrNodes: Nodes.Attribute[] = [];
    const exprNodes: Nodes.Node[] = [];
    const colStrings = new Set<string>();
    for (const c of columns) {
      if (typeof c === "string") colStrings.add(c);
      else if (c instanceof Nodes.Attribute) {
        attrNodes.push(c);
        colStrings.add(`${String(c.relation.name)}.${c.name}`);
      } else if (c instanceof Nodes.Node) {
        exprNodes.push(c);
      }
    }
    return this.predicates.filter((node) => {
      const attr = extractAttribute(node);
      if (attr === null) {
        const left = predicationLeft(node);
        if (left !== null && exprNodes.some((e) => rbEqual(e, left))) return false;
        return true;
      }
      if (attrNodes.some((a) => rbEqual(a, attr))) return false;
      if (colStrings.has(String(attr.name))) return false;
      const qualified = `${String(attr.relation.name)}.${attr.name}`;
      if (colStrings.has(qualified)) return false;
      return true;
    });
  }

  /** @internal */
  predicatesWithWrappedSqlLiterals(): Nodes.Node[] {
    return this.nonEmptyPredicates().map((node) => {
      if (node instanceof Nodes.SqlLiteral || typeof node === "string") return wrapSqlLiteral(node);
      return node;
    });
  }

  /** @internal */
  private nonEmptyPredicates(): (Nodes.Node | string)[] {
    return this.predicates.filter(
      (n) => n !== "" && !(n instanceof Nodes.SqlLiteral && n.value === ""),
    );
  }

  /** @internal */
  private eachAttributes(
    fn: (attr: Nodes.Attribute | Nodes.Node, node: Nodes.Node | string) => void,
  ): void {
    for (const node of this.predicates) {
      let attr: Nodes.Attribute | Nodes.Node | null = extractAttribute(node);
      if (!attr && isEqualityNode(node)) {
        const left = (node as any).left;
        if (left && typeof left.eq === "function") attr = left;
      }
      if (attr) fn(attr, node);
    }
  }

  /** @internal */
  protected referencedColumns(): Record<string, Nodes.Node | string> {
    const hash: Record<string, Nodes.Node | string> = {};
    this.eachAttributes((attr, node) => {
      const key =
        attr instanceof Nodes.Attribute
          ? `${String(attr.relation.name)}.${attr.name}`
          : String(attr);
      hash[key] = node;
    });
    return hash;
  }
}

/** @internal */
function invertPredicate(node: Nodes.Node | string | null | undefined): Nodes.Node {
  if (node == null) {
    throw new ArgumentError("Invalid argument for .where.not(), got nil.");
  }
  if (typeof node === "string") {
    return new Nodes.Not(new Nodes.SqlLiteral(node));
  }
  return node.invert();
}

function subtractNodes(
  a: (Nodes.Node | string)[],
  b: (Nodes.Node | string)[],
): (Nodes.Node | string)[] {
  const result: (Nodes.Node | string)[] = [];
  for (const node of a) {
    if (!b.some((other) => rbEqual(typeof node === "string" ? sql(node) : node, other))) {
      result.push(node);
    }
  }
  return result;
}

function predicationLeft(node: Nodes.Node | string): Nodes.Node | null {
  const isEquality = typeof (node as any).isEquality === "function" && (node as any).isEquality();
  if (!isEquality) return null;
  const left = (node as any).left;
  if (left instanceof Nodes.Node && !(left instanceof Nodes.Attribute)) return left;
  return null;
}

/** @internal */
function equalities(predicates: (Nodes.Node | string)[], equalityOnly: boolean): Nodes.Node[] {
  const result: Nodes.Node[] = [];
  for (const node of predicates) {
    const matches = equalityOnly ? node instanceof Nodes.Equality : isEqualityNode(node);
    if (matches) {
      result.push(node as Nodes.Node);
    } else if (node instanceof Nodes.And) {
      result.push(...equalities((node as any).children, equalityOnly));
    }
  }
  return result;
}

/** @internal */
function extractNodeValue(node: unknown): unknown {
  if (node instanceof ModelAttribute) return node.valueBeforeTypeCast;
  if (node instanceof Nodes.Quoted) return node.value;
  if (node instanceof Nodes.Casted) return node.valueBeforeTypeCast();
  if (node instanceof Nodes.BindParam) {
    const val = node.value;
    if (val && typeof val === "object" && "value" in val) {
      return (val as { value: unknown }).value;
    }
    return val;
  }
  if (Array.isArray(node)) return node.map((v) => extractNodeValue(v));
  return node;
}

function unionNodes(
  a: (Nodes.Node | string)[],
  b: (Nodes.Node | string)[],
): (Nodes.Node | string)[] {
  const result: (Nodes.Node | string)[] = [...a];
  for (const node of b) {
    if (
      !result.some((existing) =>
        rbEqual(typeof existing === "string" ? sql(existing) : existing, node),
      )
    ) {
      result.push(node);
    }
  }
  return result;
}

/** @internal */
function predicates(wc: WhereClause): (Nodes.Node | string)[] {
  return wc.predicates;
}

/** @internal */
function wrapSqlLiteral(node: Nodes.SqlLiteral | string): Nodes.Node {
  if (typeof node === "string") {
    node = sql(node);
  }
  return new Nodes.Grouping(node);
}

/** @internal */
function extractAttribute(node: Nodes.Node | string): Nodes.Attribute | null {
  let attrNode: Nodes.Attribute | null = null;
  fetchAttribute(node, (attr: Nodes.Node): boolean => {
    if (!(attr instanceof Nodes.Attribute)) return true;
    if (attrNode !== null && !rbEqual(attrNode, attr)) {
      attrNode = null;
      return false;
    }
    attrNode = attr;
    return true;
  });
  return attrNode;
}

/** @internal */
function isEqualityNode(node: Nodes.Node | string): boolean {
  if (typeof node === "string") return false;
  if (node instanceof Nodes.Equality) return true;
  if (typeof (node as any).isEquality === "function") return (node as any).isEquality();
  return false;
}
