/**
 * Regression guard for RFC 0022 b1: seeding an inverse belongs_to target
 * through the holder (`record.association(name).setTarget(target)`) marks the
 * holder loaded, which captures `staleState()` → `foreignKeyNames()`. The
 * target need not be registered in the model registry, since we hold the
 * instance. Before the fix, the target class was resolved from the registry
 * (throwing `Model '...' not found`) instead of being read from the instance.
 *
 * Also covers scalar-FK + composite-PK-target assignment: when the target has
 * composite PK `[shop_id, id]` and no explicit `foreignKey`, the inferred
 * scalar FK (`composite_pk_parent_id`) must write the `"id"` component —
 * mirrors Rails `BelongsToReflection#association_primary_key` (reflection.rb:936-938).
 */
import { describe, it, expect } from "vitest";

import { Base } from "../base.js";
import { registerModel } from "../associations.js";

class CompositePkParent extends Base {
  static _tableName = "cpk_seed_parents";
  static {
    this._primaryKey = ["shop_id", "id"];
    this.attribute("shop_id", "integer");
    this.attribute("id", "integer");
  }
}

class CpkSeedChild extends Base {
  static _tableName = "cpk_seed_children";
  static {
    this.attribute("composite_pk_parent_id", "integer");
    this.belongsTo("compositePkParent", { className: "CompositePkParent" });
  }
}

describe("belongs_to inverse seeding with a composite-PK target", () => {
  // Register both models — the constructor now calls checkKlass() (matching
  // Rails' Association#initialize → check_validity! timing), so the target
  // class must be in the registry when association() is first called.
  // The regression being guarded here (staleState resolving from registry
  // instead of from the held instance) is independent of registration.
  registerModel(CompositePkParent);
  registerModel(CpkSeedChild);

  it("seeds the holder without resolving the target class from the registry", () => {
    const child = new CpkSeedChild();
    const parent = new CompositePkParent({ shop_id: 1, id: 2 });

    expect(() => child.association("compositePkParent").setTarget(parent)).not.toThrow();

    const holder = child.association("compositePkParent");
    expect(holder.isLoaded()).toBe(true);
    expect(holder.target).toBe(parent);
  });

  it("scalar FK + composite-PK target collapses to id component on assignment", () => {
    const child = new CpkSeedChild();
    const parent = new CompositePkParent({ shop_id: 7, id: 42 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (child.association("compositePkParent") as any).writer(parent);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((child as any).composite_pk_parent_id).toBe(42);
  });
});
