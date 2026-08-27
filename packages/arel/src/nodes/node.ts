import { _And, _Grouping, _Not, _Or } from "../node-slots.js";
import { SQLString } from "../collectors/sql-string.js";
import { ArelError } from "../errors.js";

export interface ArelEngine {
  connection: { visitor: { accept(node: Node, collector: SQLString): SQLString } };
}

export const _engine: { current: ArelEngine | null } = { current: null };

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

  toSql(engine: ArelEngine | null = _engine.current): string {
    if (!engine) {
      // eslint-disable-next-line blazetrails/rails-error-parity -- Ruby raises NoMethodError/TypeError here; TypeError is its JS analogue, not a missing ported class.
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
    throw new ArelError(
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
