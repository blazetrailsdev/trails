/**
 * WhereClause — manages WHERE predicates on a Relation.
 *
 * Stores a single array of Arel nodes, matching Rails' WhereClause which
 * holds a flat `predicates` array. All condition types (hash, raw SQL,
 * NOT, Arel nodes) are converted to nodes at insertion time.
 *
 * Mirrors: ActiveRecord::Relation::WhereClause
 */

import { Visitors, Nodes } from "@blazetrails/arel";

export class WhereClause {
  private _predicates: Nodes.Node[];

  get predicates(): Nodes.Node[] {
    return this._predicates;
  }

  set predicates(value: Nodes.Node[]) {
    this._predicates = value;
  }

  constructor(predicates: Nodes.Node[] = []) {
    this._predicates = predicates;
  }

  static empty(): WhereClause {
    return new WhereClause();
  }

  isEmpty(): boolean {
    return this.predicates.length === 0;
  }

  merge(other: WhereClause): WhereClause {
    // Rails: remove predicates from self that conflict with other's attributes,
    // then union with other's predicates (other wins on conflict)
    const filtered = exceptPredicates(this.predicates, other.extractAttributes());
    return new WhereClause(unionNodes(filtered, other.predicates));
  }

  invert(): WhereClause {
    if (this.predicates.length === 0) return this.clone();
    if (this.predicates.length === 1) {
      return new WhereClause([invertPredicate(this.predicates[0])]);
    }
    return new WhereClause([new Nodes.Not(this.ast)]);
  }

  except(...columns: (string | Nodes.Attribute)[]): WhereClause {
    return new WhereClause(exceptPredicates(this.predicates, columns));
  }

  clear(): void {
    this.predicates.length = 0;
  }

  clone(): WhereClause {
    return new WhereClause([...this.predicates]);
  }

  or(other: WhereClause): WhereClause {
    if (this.isEmpty()) return other.clone();
    if (other.isEmpty()) return this.clone();

    const selfPreds = this.predicates;
    const otherPreds = other.predicates;

    const leftOnly = subtractNodes(selfPreds, otherPreds);
    const common = subtractNodes(selfPreds, leftOnly);
    const rightOnly = subtractNodes(otherPreds, common);

    if (leftOnly.length === 0 || rightOnly.length === 0) {
      return new WhereClause([...common]);
    }

    let leftAst: Nodes.Node = leftOnly.length === 1 ? leftOnly[0] : new Nodes.And(leftOnly);
    if (leftAst instanceof Nodes.Grouping && leftAst.expr instanceof Nodes.Node)
      leftAst = leftAst.expr;

    let rightAst: Nodes.Node = rightOnly.length === 1 ? rightOnly[0] : new Nodes.And(rightOnly);
    if (rightAst instanceof Nodes.Grouping && rightAst.expr instanceof Nodes.Node)
      rightAst = rightAst.expr;

    const orNode =
      leftAst instanceof Nodes.Or
        ? new Nodes.Or([...leftAst.children, rightAst])
        : new Nodes.Or([leftAst, rightAst]);

    return new WhereClause([...common, new Nodes.Grouping(orNode)]);
  }

  get ast(): Nodes.Node {
    const wrapped = predicatesWithWrappedSqlLiterals(this.predicates);
    return wrapped.length === 1 ? wrapped[0] : new Nodes.And(wrapped);
  }

  toSql(): string {
    const wrapped = predicatesWithWrappedSqlLiterals(this.predicates);
    if (wrapped.length === 0) return "";
    const node = wrapped.length === 1 ? wrapped[0] : new Nodes.And(wrapped);
    return visitor.compile(node);
  }

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

  extractAttributes(): (string | Nodes.Attribute)[] {
    const attrs: (string | Nodes.Attribute)[] = [];
    for (const node of this.predicates) {
      const attr = fetchAttributeNode(node);
      if (attr !== null) attrs.push(attr);
    }
    return attrs;
  }

  toH(tableName?: string, opts: { equalityOnly?: boolean } = {}): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const node of equalities(this.predicates, opts.equalityOnly ?? false)) {
      const attr = fetchAttributeNode(node);
      if (attr === null) continue;
      if (tableName !== undefined && attr.relation.name !== tableName) continue;
      result[attr.name] = extractNodeValue((node as any).right);
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function invertPredicate(node: Nodes.Node): Nodes.Node {
  return node.invert();
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

function fetchAttributeNode(node: Nodes.Node): Nodes.Attribute | null {
  let found: Nodes.Attribute | null = null;
  node.fetchAttribute?.((attr: Nodes.Node) => {
    if (attr instanceof Nodes.Attribute) {
      if (found !== null && !found.eql(attr)) {
        // Multiple different attributes — return null like Rails
        found = null;
        return false;
      }
      found = attr;
    }
    return true;
  });
  if (found) return found;
  if (node instanceof Nodes.Not) {
    return fetchAttributeNode((node as any).expr);
  }
  return null;
}

function equalities(predicates: Nodes.Node[], equalityOnly: boolean): Nodes.Node[] {
  const result: Nodes.Node[] = [];
  for (const node of predicates) {
    const matches = equalityOnly
      ? node instanceof Nodes.Equality
      : typeof (node as any).isEquality === "function" && (node as any).isEquality();
    if (matches) {
      result.push(node);
    } else if (node instanceof Nodes.And) {
      result.push(...equalities((node as any).children, equalityOnly));
    }
  }
  return result;
}

function extractNodeValue(node: unknown): unknown {
  if (node instanceof Nodes.Quoted) return node.value;
  if (node instanceof Nodes.Casted) return node.valueForDatabase();
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

function exceptPredicates(
  predicates: Nodes.Node[],
  columns: (string | Nodes.Attribute | Nodes.Node)[],
): Nodes.Node[] {
  // Rails: separate Attribute objects from string column names.
  // Attributes compared via eql() (table-qualified), strings by name only.
  const attrNodes: Nodes.Attribute[] = [];
  const colStrings = new Set<string>();
  for (const c of columns) {
    if (typeof c === "string") colStrings.add(c);
    else if (c instanceof Nodes.Attribute) attrNodes.push(c);
  }
  return predicates.filter((node) => {
    const attr = fetchAttributeNode(node);
    if (attr === null) return true;
    if (attrNodes.some((a) => a.eql(attr))) return false;
    if (colStrings.has(attr.name)) return false;
    // Match qualified "table.column" strings against the attribute's relation + name
    const qualified = `${attr.relation.name}.${attr.name}`;
    if (colStrings.has(qualified)) return false;
    return true;
  });
}

function unionNodes(a: Nodes.Node[], b: Nodes.Node[]): Nodes.Node[] {
  const result = [...a];
  for (const node of b) {
    if (!result.some((existing) => existing.eql(node))) {
      result.push(node);
    }
  }
  return result;
}

function predicatesWithWrappedSqlLiterals(predicates: Nodes.Node[]): Nodes.Node[] {
  return nonEmptyPredicates(predicates).map((node) => {
    if (node instanceof Nodes.SqlLiteral) return wrapSqlLiteral(node);
    return node;
  });
}

export { predicatesWithWrappedSqlLiterals as getWrappedSqlPredicates };

function predicates(wc: WhereClause): Nodes.Node[] {
  return wc.predicates;
}

function nonEmptyPredicates(predicates: Nodes.Node[]): Nodes.Node[] {
  return predicates.filter((n) => !(n instanceof Nodes.SqlLiteral && n.value === ""));
}

function wrapSqlLiteral(node: Nodes.SqlLiteral): Nodes.Node {
  return new Nodes.Grouping(node);
}

function extractAttribute(node: Nodes.Node): Nodes.Attribute | null {
  let attrNode: Nodes.Attribute | null = null;
  const fetcher = node as { fetchAttribute?: (cb: (a: Nodes.Node) => boolean) => void };
  fetcher.fetchAttribute?.((attr: Nodes.Node) => {
    if (!(attr instanceof Nodes.Attribute)) return true; // not an attribute — keep traversing
    if (attrNode !== null && !attrNode.eql(attr)) {
      attrNode = null;
      return false; // conflict: multiple different attributes — stop
    }
    attrNode = attr;
    return true; // found a match — keep traversing (Nary may have more children)
  });
  return attrNode;
}

function eachAttributes(
  predicates: Nodes.Node[],
  fn: (attr: Nodes.Attribute | Nodes.Node, node: Nodes.Node) => void,
): void {
  for (const node of predicates) {
    let attr: Nodes.Attribute | Nodes.Node | null = extractAttribute(node);
    if (!attr && isEqualityNode(node)) {
      const left = (node as any).left;
      if (left && typeof (left as any).fetchAttribute === "function") attr = left;
    }
    if (attr) fn(attr, node);
  }
}

function referencedColumns(predicates: Nodes.Node[]): Record<string, Nodes.Node> {
  const hash: Record<string, Nodes.Node> = {};
  eachAttributes(predicates, (attr, node) => {
    const key =
      attr instanceof Nodes.Attribute ? `${attr.relation.name}.${attr.name}` : String(attr);
    hash[key] = node;
  });
  return hash;
}

function isEqualityNode(node: Nodes.Node): boolean {
  if (node instanceof Nodes.Equality) return true;
  if (typeof (node as any).isEquality === "function") return (node as any).isEquality();
  return false;
}

const visitor = new Visitors.ToSql();
