/**
 * WhereClause — manages the collection of WHERE conditions on a Relation.
 *
 * Encapsulates the four parallel condition arrays that Relation uses:
 * object conditions, negated conditions, raw SQL strings, and Arel nodes.
 *
 * Mirrors: ActiveRecord::Relation::WhereClause
 */

import { Visitors, Nodes } from "@blazetrails/arel";
import { quote, quoteTableName } from "../connection-adapters/abstract/quoting.js";

export class WhereClause {
  conditions: Array<Record<string, unknown>>;
  notConditions: Array<Record<string, unknown>>;
  rawClauses: string[];
  arelNodes: Nodes.Node[];

  constructor(
    conditions: Array<Record<string, unknown>> = [],
    notConditions: Array<Record<string, unknown>> = [],
    rawClauses: string[] = [],
    arelNodes: Nodes.Node[] = [],
  ) {
    this.conditions = conditions;
    this.notConditions = notConditions;
    this.rawClauses = rawClauses;
    this.arelNodes = arelNodes;
  }

  static empty(): WhereClause {
    return new WhereClause();
  }

  isEmpty(): boolean {
    return (
      this.conditions.length === 0 &&
      this.notConditions.length === 0 &&
      this.rawClauses.length === 0 &&
      this.arelNodes.length === 0
    );
  }

  merge(other: WhereClause): WhereClause {
    return new WhereClause(
      [...this.conditions, ...other.conditions],
      [...this.notConditions, ...other.notConditions],
      [...this.rawClauses, ...other.rawClauses],
      [...this.arelNodes, ...other.arelNodes],
    );
  }

  invert(): WhereClause {
    const allPredicates = this.predicateNodes();
    if (allPredicates.length === 0) return this.clone();
    if (allPredicates.length === 1) {
      return new WhereClause([], [], [], [invertPredicate(allPredicates[0])]);
    }
    const ast = new Nodes.And(allPredicates);
    return new WhereClause([], [], [], [new Nodes.Not(ast)]);
  }

  except(...columns: string[]): WhereClause {
    const colSet = new Set(columns);
    const filtered = this.conditions
      .map((clause) => {
        const kept: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(clause)) {
          if (!colSet.has(k)) kept[k] = v;
        }
        return kept;
      })
      .filter((clause) => Object.keys(clause).length > 0);
    const filteredNot = this.notConditions
      .map((clause) => {
        const kept: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(clause)) {
          if (!colSet.has(k)) kept[k] = v;
        }
        return kept;
      })
      .filter((clause) => Object.keys(clause).length > 0);
    return new WhereClause(filtered, filteredNot, [...this.rawClauses], [...this.arelNodes]);
  }

  clear(): void {
    this.conditions.length = 0;
    this.notConditions.length = 0;
    this.rawClauses.length = 0;
    this.arelNodes.length = 0;
  }

  clone(): WhereClause {
    return new WhereClause(
      [...this.conditions],
      [...this.notConditions],
      [...this.rawClauses],
      [...this.arelNodes],
    );
  }

  or(other: WhereClause): WhereClause {
    if (this.isEmpty()) return other.clone();
    if (other.isEmpty()) return this.clone();

    // Rails: extract common predicates, OR only the differing ones
    const selfPreds = this.predicateNodes();
    const otherPreds = other.predicateNodes();

    const leftOnly = subtractNodes(selfPreds, otherPreds);
    const common = subtractNodes(selfPreds, leftOnly);
    const rightOnly = subtractNodes(otherPreds, common);

    if (leftOnly.length === 0 || rightOnly.length === 0) {
      return new WhereClause([], [], [], common);
    }

    let leftAst: Nodes.Node = leftOnly.length === 1 ? leftOnly[0] : new Nodes.And(leftOnly);
    if (leftAst instanceof Nodes.Grouping) leftAst = leftAst.expr;

    let rightAst: Nodes.Node = rightOnly.length === 1 ? rightOnly[0] : new Nodes.And(rightOnly);
    if (rightAst instanceof Nodes.Grouping) rightAst = rightAst.expr;

    const orNode =
      leftAst instanceof Nodes.Or
        ? new Nodes.Or([...leftAst.children, rightAst])
        : new Nodes.Or([leftAst, rightAst]);

    return new WhereClause([], [], [], [...common, new Nodes.Grouping(orNode)]);
  }

  get ast(): string {
    return clauseToAstString(this);
  }

  astNode(): Nodes.Node {
    const predicates = this.predicateNodes();
    return predicates.length === 1 ? predicates[0] : new Nodes.And(predicates);
  }

  predicateNodes(): Nodes.Node[] {
    const nodes: Nodes.Node[] = [];
    for (const cond of this.conditions) {
      for (const [k, v] of Object.entries(cond)) {
        nodes.push(conditionToArelNode(k, v, false));
      }
    }
    for (const cond of this.notConditions) {
      for (const [k, v] of Object.entries(cond)) {
        nodes.push(conditionToArelNode(k, v, true));
      }
    }
    for (const raw of this.rawClauses) {
      nodes.push(new Nodes.SqlLiteral(raw));
    }
    nodes.push(...this.arelNodes);
    return nodes;
  }

  isContradiction(): boolean {
    for (const node of this.predicateNodes()) {
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

  extractAttributes(): string[] {
    const attrs: string[] = [];
    for (const cond of this.conditions) {
      attrs.push(...Object.keys(cond));
    }
    for (const cond of this.notConditions) {
      attrs.push(...Object.keys(cond));
    }
    return attrs;
  }

  toH(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const cond of this.conditions) {
      Object.assign(result, cond);
    }
    return result;
  }
}

function subtractNodes(a: Nodes.Node[], b: Nodes.Node[]): Nodes.Node[] {
  const result: Nodes.Node[] = [];
  for (const node of a) {
    if (!b.some((other) => node.eql(other))) {
      result.push(node);
    }
  }
  return result;
}

function conditionToArelNode(key: string, value: unknown, negate: boolean): Nodes.Node {
  const col = new Nodes.SqlLiteral(quoteTableName(key));
  if (value === null || value === undefined) {
    // Wrap null in Quoted so the visitor produces IS NULL / IS NOT NULL
    const eq = new Nodes.Equality(col, new Nodes.Quoted(null));
    return negate ? eq.invert() : eq;
  }
  if (Array.isArray(value)) {
    const quoted = value.map((v) => new Nodes.Quoted(v));
    const node = new Nodes.In(col, quoted as any);
    return negate ? node.invert() : node;
  }
  const eq = new Nodes.Equality(col, new Nodes.Quoted(value));
  return negate ? eq.invert() : eq;
}

function invertPredicate(node: Nodes.Node): Nodes.Node {
  return node.invert();
}

const visitor = new Visitors.ToSql();

function clauseToAstString(clause: WhereClause): string {
  const parts: string[] = [];
  for (const cond of clause.conditions) {
    for (const [k, v] of Object.entries(cond)) {
      const col = quoteTableName(k);
      if (v === null || v === undefined) {
        parts.push(`${col} IS NULL`);
      } else if (Array.isArray(v)) {
        const nonNull = v.filter((x) => x !== null && x !== undefined);
        const hasNull = nonNull.length !== v.length;
        if (nonNull.length === 0 && !hasNull) {
          parts.push("1=0");
        } else {
          const sub: string[] = [];
          if (nonNull.length > 0)
            sub.push(`${col} IN (${nonNull.map((x) => quote(x)).join(", ")})`);
          if (hasNull) sub.push(`${col} IS NULL`);
          parts.push(sub.length === 1 ? sub[0] : `(${sub.join(" OR ")})`);
        }
      } else {
        parts.push(`${col} = ${quote(v)}`);
      }
    }
  }
  for (const cond of clause.notConditions) {
    for (const [k, v] of Object.entries(cond)) {
      const col = quoteTableName(k);
      if (v === null || v === undefined) {
        parts.push(`${col} IS NOT NULL`);
      } else if (Array.isArray(v)) {
        const nonNull = v.filter((x) => x !== null && x !== undefined);
        const hasNull = nonNull.length !== v.length;
        if (nonNull.length === 0 && !hasNull) {
          parts.push("1=1");
        } else {
          if (nonNull.length > 0)
            parts.push(`${col} NOT IN (${nonNull.map((x) => quote(x)).join(", ")})`);
          if (hasNull) parts.push(`${col} IS NOT NULL`);
        }
      } else {
        parts.push(`${col} != ${quote(v)}`);
      }
    }
  }
  parts.push(...clause.rawClauses);
  for (const node of clause.arelNodes) {
    try {
      parts.push(visitor.compile(node));
    } catch {
      parts.push(String(node));
    }
  }
  return parts.length <= 1 ? (parts[0] ?? "") : parts.join(" AND ");
}
