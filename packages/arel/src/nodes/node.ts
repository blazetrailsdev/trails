/**
 * The `engine` `Node#toSql()` / `TreeManager#toSql()` compile through — Rails'
 * `ActiveRecord::Base`, duck-typed here so arel does not import activerecord.
 */
export interface ArelEngine {
  connection: { visitor: { compile(node: Node): string } };
}

/** Backing store for `Arel::Table.engine`. It lives here, not in table.ts,
 *  because `Table extends Node` — a static `import { Table }` from this module
 *  would make table.ts evaluate against a half-initialised node.ts. `Table`
 *  exposes it as the Rails-named `Table.engine` accessor. */
export const _engine: { current: ArelEngine | null } = { current: null };

/**
 * Base class for all AST nodes in Arel.
 *
 * Mirrors: Arel::Nodes::Node — which `include`s Arel::FactoryMethods.
 * Runtime mixin wiring lives in ../index.ts to avoid a module-load cycle
 * (factory-methods.ts imports concrete node subclasses).
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
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

  /**
   * Mirrors: Arel::Nodes::Node#to_sql (arel/nodes/node.rb:148-153).
   *
   * Rails writes `engine.with_connection { |c| c.visitor.accept(self, ...) }`.
   * trails' `withConnection` is async (per-checkout `verifyBang` is awaited —
   * see ConnectionPool#checkout), and `to_sql` is synchronous in Rails and at
   * all 600+ call sites here, so this uses the synchronous `engine.connection`
   * lease instead. Same visitor, same connection; it just skips the async
   * per-checkout verify. Tracked with the other sync-lease residuals by
   * `connection-pool-pinned-sync-checkout-per-checkout-verify`.
   */
  toSql(engine: ArelEngine | null = _engine.current): string {
    if (!engine) {
      throw new TypeError(
        "undefined method `connection' for nil — Arel::Table.engine is unset. " +
          "Set it to your ActiveRecord base class, or pass an engine to toSql().",
      );
    }
    return engine.connection.visitor.compile(this);
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
    if (other === this) return true;
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
  /** @internal */
  visit(node: Node): T;
}

interface NodeRegistry {
  Not?: new (expr: Node) => Node;
  Grouping?: new (expr: Node) => Node;
  Or?: new (children: Node[]) => Node;
  And?: new (children: Node[]) => Node;
}

// Registry for breaking circular dependencies.
// Populated by the index module after all classes are loaded.
const _registry: NodeRegistry = {};

function assertRegistered(name: keyof NodeRegistry): void {
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
}): void {
  _registry.Not = deps.Not;
  _registry.Grouping = deps.Grouping;
  _registry.Or = deps.Or;
  _registry.And = deps.And;
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

  // boundary: Arel inspect output recognizes legacy Date values.
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

// Methods supplied by the FactoryMethods mixin (runtime wiring in ../index.ts).
// The aliased import keeps this type-only — pulling factory-methods.ts into
// the static import graph here would create a module-load cycle, since it
// imports concrete Node subclasses. The explicit `FactoryMethodsModule`
// interface (vs. `Included<typeof FactoryMethods>`) is required: under
// composite/declaration emit, the cycle Node ↔ FactoryMethods would force
// tsc to fall back to a structural shape with a string index signature.
type _FactoryMethodsModule = import("../factory-methods.js").FactoryMethodsModule;

/* eslint-disable-next-line @typescript-eslint/no-empty-object-type,
   @typescript-eslint/no-unsafe-declaration-merging */
export interface Node extends _FactoryMethodsModule {}
