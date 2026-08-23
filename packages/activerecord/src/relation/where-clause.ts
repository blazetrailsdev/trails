/**
 * WhereClause — manages WHERE predicates on a Relation.
 *
 * Stores a single array of Arel nodes, matching Rails' WhereClause which
 * holds a flat `predicates` array. All condition types (hash, raw SQL,
 * NOT, Arel nodes) are converted to nodes at insertion time.
 *
 * Mirrors: ActiveRecord::Relation::WhereClause
 */

import { Nodes, fetchAttribute, sql } from "@blazetrails/arel";
import { ArgumentError } from "@blazetrails/activemodel";

export class WhereClause {
  // Rails' predicates array holds raw Strings alongside Arel nodes —
  // `build_where_clause`'s sanitize_sql arm stores the bare String
  // (query_methods.rb:1627) and this class handles it at where_clause.rb:160,
  // 167, 190 and 203.
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

  /**
   * Mirrors WhereClause's `delegate :any?, :empty?, to: :predicates`
   * (where_clause.rb:8) — true when any predicate is present.
   */
  any(): boolean {
    return this.predicates.length > 0;
  }

  /** Mirrors: where_clause.rb:14 `def +(other)` — Ruby `Array#+`, a plain concatenation. */
  plus(other: WhereClause): WhereClause {
    return new WhereClause([...this.predicates, ...other.predicates]);
  }

  /** Mirrors: where_clause.rb:18 `def -(other)` — Ruby `Array#-`. */
  minus(other: WhereClause): WhereClause {
    return new WhereClause(subtractNodes(this.predicates, other.predicates));
  }

  /**
   * Mirrors: where_clause.rb:22 `def |(other)` — Ruby `Array#|`, which dedups
   * identical predicates and keeps distinct ones. Named `union` after the Ruby
   * operator's name (`Array#|` is "union"), the spelling
   * `operator-order-spelling.ts` pins for this class.
   */
  union(other: WhereClause): WhereClause {
    return new WhereClause(unionNodes(this.predicates, other.predicates));
  }

  merge(other: WhereClause): WhereClause {
    // Rails: remove predicates from self that conflict with other's attributes,
    // then union with other's predicates (other wins on conflict)
    const filtered = this.exceptPredicates(other.extractAttributes());
    return new WhereClause(unionNodes(filtered, other.predicates));
  }

  /**
   * @missingRailsCall first — PERMANENT: Verified per-site (RFC 0106):
   *   `predicates.first` (where_clause.rb:85) — Ruby `Array#first`, spelled
   *   `predicates[0]` in TS.
   * @missingRailsCall size — PERMANENT: Verified per-site (RFC 0106):
   *   `predicates.size == 1` (where_clause.rb:84) — Ruby `Array#size`, spelled
   *   `.length` in TS.
   */
  invert(): WhereClause {
    if (this.predicates.length === 0) return this.clone();
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

  /** Mirrors: where_clause.rb:75 `def ==(other)`, aliased `eql?`. */
  equals(other: unknown): boolean {
    return (
      other instanceof WhereClause &&
      this.predicates.length === other.predicates.length &&
      this.predicates.every((predicate, i) => {
        const otherPredicate = other.predicates[i];
        return typeof predicate === "string" || typeof otherPredicate === "string"
          ? predicate === otherPredicate
          : predicate.eql(otherPredicate);
      })
    );
  }

  /**
   * @missingRailsCall any? — PERMANENT: Verified per-site (RFC 0106):
   *   `predicates.any? do |x| ... end` (where_clause.rb:100) — Enumerable#any?
   *   with a block on a Ruby Array, spelled `.some(...)` in TS.
   */
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
      result[attr.name] = extractNodeValue((node as any).right);
    }
    return result;
  }

  /** @internal */
  private exceptPredicates(
    columns: (string | Nodes.Attribute | Nodes.Node)[],
  ): (Nodes.Node | string)[] {
    // Rails: separate Attribute objects from string column names.
    // Attributes compared via eql() (table-qualified), strings by name only.
    const attrNodes: Nodes.Attribute[] = [];
    const exprNodes: Nodes.Node[] = [];
    const colStrings = new Set<string>();
    for (const c of columns) {
      if (typeof c === "string") colStrings.add(c);
      else if (c instanceof Nodes.Attribute) {
        attrNodes.push(c);
        colStrings.add(`${String(c.relation.name)}.${c.name}`);
      } else if (c instanceof Nodes.Node) {
        // Non-Attribute expression LHS (e.g. NamedFunction) — Rails' `non_attrs`.
        exprNodes.push(c);
      }
    }
    return this.predicates.filter((node) => {
      const attr = extractAttribute(node);
      if (attr === null) {
        // Mirrors Rails' `non_attrs.include?(node.left)` branch: drop a predicate
        // whose left expression matches one being merged in (last equality wins).
        const left = predicationLeft(node);
        if (left !== null && exprNodes.some((e) => e.eql(left))) return false;
        return true;
      }
      if (attrNodes.some((a) => a.eql(attr))) return false;
      if (colStrings.has(attr.name)) return false;
      const qualified = `${String(attr.relation.name)}.${attr.name}`;
      if (colStrings.has(qualified)) return false;
      return true;
    });
  }

  /** @internal Deviation: Rails keeps this private, but Relation's update/delete
   *  manager paths build their WHERE list from it directly. */
  predicatesWithWrappedSqlLiterals(): Nodes.Node[] {
    return this.nonEmptyPredicates().map((node) => {
      if (node instanceof Nodes.SqlLiteral || typeof node === "string") return wrapSqlLiteral(node);
      return node;
    });
  }

  /**
   * @internal
   * Rails' `predicates - ARRAY_WITH_EMPTY_STRING` (where_clause.rb:197-200)
   * drops a SqlLiteral("") too, because SqlLiteral subclasses String in Ruby.
   */
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
        // Rails' `node.left.is_a?(Arel::Predications)` (where_clause.rb:129): include()
        // leaves no is_a? marker, so membership is tested via Predications#eq
        // (predications.rb:17).
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
    if (
      !b.some((other) =>
        typeof node === "string" || typeof other === "string" ? node === other : node.eql(other),
      )
    ) {
      result.push(node);
    }
  }
  return result;
}

// Mirrors Rails: `node.left if equality_node?(node) && node.left.is_a?(Arel::Predications)`.
// Returns the left-hand expression of an equality predicate when it is a
// non-Attribute Arel node (a NamedFunction, etc.), else null.
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
  // Mirrors Rails where_clause.rb:209-215 `extract_node_value`: prefer
  // `value_before_type_cast` (the raw, un-serialized value). Both Quoted and
  // Casted alias it to their stored value — so a Casted wrapping an
  // AdditionalValue (encryption deterministic queries) or any other rich value
  // is returned intact for scope_for_create, not flattened via
  // `value_for_database`. This matters now that multi-value arrays build
  // `HomogeneousIn`, whose `right` is an array of Casted nodes.
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
        typeof existing === "string" || typeof node === "string"
          ? existing === node
          : existing.eql(node),
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
  fetchAttribute(node, (attr: Nodes.Node) => {
    if (!(attr instanceof Nodes.Attribute)) return true;
    if (attrNode !== null && !attrNode.eql(attr)) {
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
  // Rails' `!node.is_a?(String) && node.equality?` (where_clause.rb:159-161).
  if (typeof node === "string") return false;
  if (node instanceof Nodes.Equality) return true;
  if (typeof (node as any).isEquality === "function") return (node as any).isEquality();
  return false;
}
