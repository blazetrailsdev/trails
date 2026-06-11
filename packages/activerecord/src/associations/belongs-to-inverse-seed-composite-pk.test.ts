/**
 * Regression guard for RFC 0022 b1: seeding an inverse belongs_to target
 * through the holder (`record.association(name).setTarget(target)`) marks the
 * holder loaded, which captures `staleState()` → `foreignKeyNames()`. For a
 * composite-PK target with no explicit `foreignKey`, that path detects the
 * composite shape via `associationPrimaryKeys`. It must read the PK off the
 * already-loaded target instance rather than resolving the target class from
 * the model registry — the target need not be registered, since we hold the
 * instance. Before the fix, `associationPrimaryKeys(null)` forced a registry
 * resolve and threw `Model '...' not found in registry`.
 */
import { describe, it, expect } from "vitest";

import { Base } from "../base.js";
import { registerModel } from "../associations.js";

class CompositePkParent extends Base {
  static _tableName = "cpk_seed_parents";
  static {
    this._primaryKey = ["shop_id", "id"];
  }
}

class CpkSeedChild extends Base {
  static _tableName = "cpk_seed_children";
  static {
    this.belongsTo("compositePkParent", { className: "CompositePkParent" });
  }
}

describe("belongs_to inverse seeding with a composite-PK target", () => {
  // Register only the child — the parent is deliberately left out of the
  // registry to prove the seed path does not resolve the target class.
  registerModel(CpkSeedChild);

  it("seeds the holder without resolving the target class from the registry", () => {
    const child = new CpkSeedChild();
    const parent = new CompositePkParent({ shop_id: 1, id: 2 });

    expect(() => child.association("compositePkParent").setTarget(parent)).not.toThrow();

    const holder = child.association("compositePkParent");
    expect(holder.isLoaded()).toBe(true);
    expect(holder.target).toBe(parent);
  });
});
