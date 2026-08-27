import { _And, _Grouping, _Not, _Or } from "../node-slots.js";
import { SQLString } from "../collectors/sql-string.js";

/**
 * The `engine` `Node#toSql()` / `TreeManager#toSql()` compile through — Rails'
 * `ActiveRecord::Base`, duck-typed here so arel does not import activerecord.
 */
export interface ArelEngine {
  connection: { visitor: { accept(node: Node, collector: SQLString): SQLString } };
}

/** Backing store for `Arel::Table.engine`. It lives here, not in table.ts,
 *  because `Node#toSql` defaults its engine from it, and a static
 *  `import { Table }` from this module would close a cycle back through
 *  table.ts's own node imports. `Table` exposes it as the Rails-named
 *  `Table.engine` accessor. */
export const _engine: { current: ArelEngine | null } = { current: null };

/**
 * Base class for all AST nodes in Arel.
 *
 * Mirrors: Arel::Nodes::Node — which `include`s Arel::FactoryMethods.
 * Runtime mixin wiring lives in ../index.ts to avoid a module-load cycle
 * (factory-methods.ts imports concrete node subclasses).
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Node {
  not(): Node {
    return new (assertRegistered(_Not, "Not"))(this);
  }

  or(right: Node): Node {
    return new (assertRegistered(_Grouping, "Grouping"))(
      new (assertRegistered(_Or, "Or"))([this, right]),
    );
  }

  and(right: Node): Node {
    return new (assertRegistered(_And, "And"))([this, right]);
  }

  invert(): Node {
    return new (assertRegistered(_Not, "Not"))(this);
  }

  /**
   * Mirrors: Arel::Nodes::Node#to_sql (arel/nodes/node.rb:148-153).
   *
   * Deviation: `engine.connection` in place of Rails'
   * `engine.with_connection { |c| ... }`. trails' `withConnection` is async
   * (per-checkout `verifyBang` is awaited — see ConnectionPool#checkout) and
   * `to_sql` is synchronous at all 600+ call sites, so this takes the sync
   * `engine.connection` lease. Same visitor and connection; it skips only the
   * async per-checkout verify, the residual tracked by
   * `converge-sync-connection-lease-per-checkout-verify`.
   */
  toSql(engine: ArelEngine | null = _engine.current): string {
    if (!engine) {
      throw new TypeError(
        "undefined method `connection' for nil — Arel::Table.engine is unset. " +
          "Set it to your ActiveRecord base class, or pass an engine to toSql().",
      );
    }
    const collector = new SQLString();
    return engine.connection.visitor.accept(this, collector).value;
  }

  fetchAttribute(_block?: (attr: Node) => unknown): unknown {
    return undefined;
  }

  isEquality(): boolean {
    return false;
  }
}

function assertRegistered<T>(ctor: T | undefined, name: string): T {
  if (!ctor) {
    throw new Error(
      `Node.${name} requires the arel node slots. Import from "@blazetrails/arel" instead of deep-importing node classes.`,
    );
  }
  return ctor;
}

/**
 * Methods supplied by the FactoryMethods mixin (runtime wiring in ../index.ts).
 * The aliased import keeps this type-only — pulling factory-methods.ts into
 * the static import graph here would create a module-load cycle, since it
 * imports concrete Node subclasses. The explicit `FactoryMethodsModule`
 * interface (vs. `Included<typeof FactoryMethods>`) is required: under
 * composite/declaration emit, the cycle Node ↔ FactoryMethods would force
 * tsc to fall back to a structural shape with a string index signature.
 *
 * @noRailsEquivalent TypeScript-only mixin typing; Ruby `include` needs no type surface.
 */
type _FactoryMethodsModule = import("../factory-methods.js").FactoryMethodsModule;

/* eslint-disable-next-line @typescript-eslint/no-empty-object-type,
   @typescript-eslint/no-unsafe-declaration-merging */
export interface Node extends _FactoryMethodsModule {}
