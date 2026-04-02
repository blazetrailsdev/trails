/**
 * Base class for all AST nodes in Arel.
 *
 * Mirrors: Arel::Nodes::Node
 */
export abstract class Node {
  abstract accept<T>(visitor: NodeVisitor<T>): T;

  not(): Node {
    assertRegistered("Not");
    return new _registry.Not!(this);
  }

  or(right: Node): Node {
    assertRegistered("Grouping");
    assertRegistered("Or");
    return new _registry.Grouping!(new _registry.Or!([this, right]));
  }

  and(right: Node): Node {
    assertRegistered("And");
    return new _registry.And!([this, right]);
  }

  invert(): Node {
    assertRegistered("Not");
    return new _registry.Not!(this);
  }

  toSql(): string {
    assertRegistered("ToSql");
    const visitor = new _registry.ToSql!();
    return (visitor as unknown as { compile(node: Node): string }).compile(this);
  }

  fetchAttribute(_block?: (attr: Node) => unknown): unknown {
    return undefined;
  }

  isEquality(): boolean {
    return false;
  }

  /**
   * Ruby-ish equality helper.
   *
   * Mirrors: `eql?` / `==` semantics used throughout the Arel test suite.
   */
  eql(other: unknown): boolean {
    if (!other || typeof other !== "object") return false;
    if (
      (other as { constructor: unknown }).constructor !==
      (this as { constructor: unknown }).constructor
    )
      return false;
    return stableSerialize(this) === stableSerialize(other);
  }

  /**
   * Stable hash for use in tests / maps.
   *
   * Mirrors: `hash` in Ruby Arel nodes.
   */
  hash(): number {
    return fnv1a32(stableSerialize(this));
  }
}

/**
 * Visitor interface for the Node hierarchy.
 */
export interface NodeVisitor<T> {
  visit(node: Node): T;
}

// Registry for breaking circular dependencies.
// Populated by the index module after all classes are loaded.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _registry: Record<string, (new (...args: any[]) => any) | undefined> = {};

function assertRegistered(name: string): void {
  if (!_registry[name]) {
    throw new Error(
      `Node.${name} requires the arel registry. Import from "@blazetrails/arel" instead of deep-importing node classes.`,
    );
  }
}

export function registerNodeDeps(deps: {
  Not: new (expr: Node) => Node;
  Grouping: new (expr: Node) => Node;
  Or: new (children: Node[]) => Node;
  And: new (children: Node[]) => Node;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ToSql: new (...args: any[]) => { compile(node: Node): string };
}): void {
  _registry.Not = deps.Not;
  _registry.Grouping = deps.Grouping;
  _registry.Or = deps.Or;
  _registry.And = deps.And;
  _registry.ToSql = deps.ToSql;
}

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Force unsigned 32-bit.
  return hash >>> 0;
}

function stableSerialize(value: unknown, seen: WeakSet<object> = new WeakSet()): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  const t = typeof value;
  if (t === "string") return JSON.stringify(value);
  if (t === "number" || t === "boolean" || t === "bigint") return String(value);
  if (t === "symbol") return "symbol";
  if (t === "function") return "function";

  if (value instanceof Date) return `Date(${value.toISOString()})`;

  if (typeof value === "object") {
    // Use recursion-stack cycle detection (not global "seen"), so repeated/shared references
    // serialize consistently rather than being misclassified as circular.
    if (seen.has(value)) return "[Circular]";
    seen.add(value);

    if (Array.isArray(value)) {
      try {
        return `[${value.map((v) => stableSerialize(v, seen)).join(",")}]`;
      } finally {
        seen.delete(value);
      }
    }

    const obj = value as Record<string, unknown>;
    const ctorName = (value as { constructor?: { name?: string } }).constructor?.name ?? "Object";
    const keys = Object.keys(obj).sort();
    try {
      const body = keys
        .map((k) => `${JSON.stringify(k)}:${stableSerialize(obj[k], seen)}`)
        .join(",");
      return `${ctorName}{${body}}`;
    } finally {
      seen.delete(value);
    }
  }

  return String(value);
}
