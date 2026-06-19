/**
 * Regression guard for RFC 0022 b1: seeding an inverse belongs_to target
 * through the holder (`record.association(name).setTarget(target)`) marks the
 * holder loaded, which captures `staleState()` → `foreignKeyNames()`. Before
 * the fix, the target class was resolved from the registry (throwing
 * `Model '...' not found`) instead of being read from the instance.
 *
 * Also covers scalar-FK + composite-PK-target assignment: when the target has
 * composite PK `[shop_id, id]` and no explicit `foreignKey`, the inferred
 * scalar FK (`composite_pk_parent_id`) must write the `"id"` component —
 * mirrors Rails `BelongsToReflection#association_primary_key` (reflection.rb:936-938).
 *
 * NOTE: Both models must now be registered because constructor-level
 * `checkKlass()` (matching Rails' `Association#initialize → check_validity!`)
 * requires the target class in the registry before `association()` is called.
 * This weakens the original guard: a future regression where `staleState()`
 * falls back to a registry lookup instead of reading from the held instance
 * would go undetected. Catching that would require a spy on `resolveModel`.
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

// Target whose composite PK has the shape `[tenant_key, tenant_id]` — no `"id"`
// column — so Rails keeps the full composite array as the association PK.
class TenantPkParent extends Base {
  static _tableName = "cpk_tenant_parents";
  static {
    this._primaryKey = ["shop_id", "tenant_id"];
    this.attribute("shop_id", "integer");
    this.attribute("tenant_id", "integer");
  }
}

class CpkTenantChild extends Base {
  static _tableName = "cpk_tenant_children";
  static {
    this.attribute("tenant_pk_parent_id", "integer");
    this.belongsTo("tenantPkParent", { className: "TenantPkParent" });
  }
}

describe("belongs_to inverse seeding with a composite-PK target", () => {
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

  it("infers id as the association primary key for a [tenant_key, id]-PK target", () => {
    const child = new CpkSeedChild();
    const parent = new CompositePkParent({ shop_id: 7, id: 42 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const holder = child.association("compositePkParent") as any;
    expect(holder.associationPrimaryKeys(parent)).toEqual(["id"]);
  });
});

describe("belongs_to to a composite-PK target without an id column", () => {
  registerModel(TenantPkParent);
  registerModel(CpkTenantChild);

  it("keeps the full composite array as the association primary key", () => {
    const child = new CpkTenantChild();
    const parent = new TenantPkParent({ shop_id: 7, tenant_id: 42 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const holder = child.association("tenantPkParent") as any;
    expect(holder.associationPrimaryKeys(parent)).toEqual(["shop_id", "tenant_id"]);
  });
});
