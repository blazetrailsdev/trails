import { extractBang, rbEqual } from "@blazetrails/activesupport";
import { first, isEmpty, isModuleIncluded, rbObjRespondTo } from "@blazetrails/ruby-compat";

import * as Arel from "@blazetrails/arel";
import { Nodes, Predications, fetchAttribute, sql } from "@blazetrails/arel";
import { ArgumentError, Attribute as ModelAttribute } from "@blazetrails/activemodel";

export class WhereClause {
  private _predicates: (Nodes.Node | Nodes.SqlLiteral | string)[];

  /** @internal */
  get predicates(): (Nodes.Node | Nodes.SqlLiteral | string)[] {
    return this._predicates;
  }

  /** @internal */
  set predicates(value: (Nodes.Node | Nodes.SqlLiteral | string)[]) {
    this._predicates = value;
  }

  constructor(predicates: (Nodes.Node | Nodes.SqlLiteral | string)[] = []) {
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

  /** @missingRailsCall size — CONVERGEABLE call-gate-proves-where-clause-predicates-an-array-for-size */
  invert(): WhereClause {
    let invertedPredicates: (Nodes.Node | Nodes.SqlLiteral | string)[];
    if (this.predicates.length === 1) {
      invertedPredicates = [invertPredicate(first(this.predicates))];
    } else {
      invertedPredicates = [new Nodes.Not(this.ast)];
    }

    return new WhereClause(invertedPredicates);
  }

  except(...columns: unknown[]): WhereClause {
    return new WhereClause(this.exceptPredicates(columns));
  }

  or(other: WhereClause): WhereClause {
    const leftClause = this.minus(other);
    const common = this.minus(leftClause);
    const rightClause = other.minus(common);

    if (leftClause.isEmpty() || rightClause.isEmpty()) {
      return common;
    } else {
      let left: Arel.ArelNode = leftClause.ast;
      if (left instanceof Nodes.Grouping && Arel.arelNode(left.expr)) left = left.expr;

      let right: Arel.ArelNode = rightClause.ast;
      if (right instanceof Nodes.Grouping && Arel.arelNode(right.expr)) right = right.expr;

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

  isContradiction(): boolean {
    return this.predicates.some((x) => {
      if (x instanceof Nodes.In) {
        return Array.isArray(x.right) && isEmpty(x.right);
      } else if (x instanceof Nodes.Equality) {
        return rbObjRespondTo(x.right, "isUnboundable") && (x.right as any).isUnboundable();
      }
      return false;
    });
  }

  extractAttributes(): (string | Arel.Attribute | Nodes.Node)[] {
    const attrs: (string | Arel.Attribute | Nodes.Node)[] = [];
    this.eachAttributes((attr) => attrs.push(attr));
    return attrs;
  }

  toH(tableName?: string | null, opts: { equalityOnly?: boolean } = {}): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const node of equalities(this.predicates, opts.equalityOnly ?? false)) {
      const attr = extractAttribute(node);
      if (attr === null) continue;
      if (tableName != null && String(attr.relation.name) !== tableName) continue;
      result[String(attr.name)] = extractNodeValue((node as any).right);
    }
    return result;
  }

  /** @internal */
  private exceptPredicates(columns: unknown[]): (Nodes.Node | Nodes.SqlLiteral | string)[] {
    const attrs = extractBang(columns, (node) => node instanceof Arel.Attribute);
    const nonAttrs = extractBang(
      columns,
      (node) => node != null && isModuleIncluded((node as object).constructor, Predications),
    );

    return this.predicates.filter(
      (node) =>
        !(
          (nonAttrs.length !== 0 &&
          isEqualityNode(node) &&
          (node as any).left != null &&
          isModuleIncluded((node as any).left.constructor, Predications)
            ? nonAttrs.some((nonAttr) => rbEqual(nonAttr, (node as any).left))
            : undefined) ||
          fetchAttribute(
            node,
            (attr) => attrs.some((a) => rbEqual(a, attr)) || columns.includes(String(attr.name)),
          )
        ),
    );
  }

  /** @internal */
  predicatesWithWrappedSqlLiterals(): Nodes.Node[] {
    return this.nonEmptyPredicates().map((node) => {
      if (node instanceof Nodes.SqlLiteral || typeof node === "string") return wrapSqlLiteral(node);
      return node;
    });
  }

  /** @internal */
  private nonEmptyPredicates(): (Nodes.Node | Nodes.SqlLiteral | string)[] {
    return this.predicates.filter(
      (n) => n !== "" && !(n instanceof Nodes.SqlLiteral && n.toString() === ""),
    );
  }

  /** @internal */
  private eachAttributes(
    fn: (attr: Arel.Attribute | Nodes.Node, node: Nodes.Node | Nodes.SqlLiteral | string) => void,
  ): void {
    for (const node of this.predicates) {
      let attr: Arel.Attribute | Nodes.Node | null = extractAttribute(node);
      if (!attr && isEqualityNode(node)) {
        const left = (node as any).left;
        if (left != null && isModuleIncluded(left.constructor, Predications)) attr = left;
      }
      if (attr) fn(attr, node);
    }
  }

  /** @internal */
  protected referencedColumns(): Record<string, Nodes.Node | Nodes.SqlLiteral | string> {
    const hash: Record<string, Nodes.Node | Nodes.SqlLiteral | string> = {};
    this.eachAttributes((attr, node) => {
      const key =
        attr instanceof Arel.Attribute
          ? `${String(attr.relation.name)}.${attr.name}`
          : String(attr);
      hash[key] = node;
    });
    return hash;
  }
}

/** @internal */
function invertPredicate(
  node: Nodes.Node | Nodes.SqlLiteral | string | null | undefined,
): Nodes.Node {
  if (node == null) {
    throw new ArgumentError("Invalid argument for .where.not(), got nil.");
  }
  if (typeof node === "string" || node instanceof Nodes.SqlLiteral) {
    return new Nodes.Not(new Nodes.SqlLiteral(node));
  }
  return node.invert();
}

function subtractNodes(
  a: (Nodes.Node | Nodes.SqlLiteral | string)[],
  b: (Nodes.Node | Nodes.SqlLiteral | string)[],
): (Nodes.Node | Nodes.SqlLiteral | string)[] {
  const result: (Nodes.Node | Nodes.SqlLiteral | string)[] = [];
  for (const node of a) {
    if (!b.some((other) => rbEqual(typeof node === "string" ? sql(node) : node, other))) {
      result.push(node);
    }
  }
  return result;
}

/** @internal */
function equalities(
  predicates: (Nodes.Node | Nodes.SqlLiteral | string)[],
  equalityOnly: boolean,
): Nodes.Node[] {
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
    if (val instanceof ModelAttribute) return val.value();
    if (val && typeof val === "object" && "value" in val) {
      return (val as { value: unknown }).value;
    }
    return val;
  }
  if (Array.isArray(node)) return node.map((v) => extractNodeValue(v));
  return node;
}

function unionNodes(
  a: (Nodes.Node | Nodes.SqlLiteral | string)[],
  b: (Nodes.Node | Nodes.SqlLiteral | string)[],
): (Nodes.Node | Nodes.SqlLiteral | string)[] {
  const result: (Nodes.Node | Nodes.SqlLiteral | string)[] = [...a];
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
function predicates(wc: WhereClause): (Nodes.Node | Nodes.SqlLiteral | string)[] {
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
function extractAttribute(node: Nodes.Node | Nodes.SqlLiteral | string): Arel.Attribute | null {
  let attrNode: Arel.Attribute | null = null;
  fetchAttribute(node, (attr: Arel.Attribute): boolean => {
    if (!(attr instanceof Arel.Attribute)) return true;
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
function isEqualityNode(node: Nodes.Node | Nodes.SqlLiteral | string): boolean {
  if (typeof node === "string") return false;
  if (node instanceof Nodes.Equality) return true;
  if (typeof (node as any).isEquality === "function") return (node as any).isEquality();
  return false;
}
