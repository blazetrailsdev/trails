/**
 * Base class for all AST nodes in Arel.
 *
 * Mirrors: Arel::Nodes::Node
 */
export abstract class Node {
  abstract accept<T>(visitor: NodeVisitor<T>): T;

  /**
   * Ruby-ish equality helper.
   *
   * Mirrors: `eql?` / `==` semantics used throughout the Arel test suite.
   */
  eql(other: unknown): boolean {
    if (!other || typeof other !== "object") return false;
    if ((other as any).constructor !== (this as any).constructor) return false;
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
    const ctorName = (value as any).constructor?.name ?? "Object";
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
