import { describe, it, expect, vi } from "vitest";

import { Base } from "../base.js";
import { registerModel } from "../associations.js";
import * as associationsModule from "../associations.js";
import { CompositePrimaryKeyMismatchError } from "./errors.js";

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
    const parent = new CompositePkParent({ id: [1, 2] });

    expect(() => child.association("compositePkParent").setTarget(parent)).not.toThrow();

    const holder = child.association("compositePkParent");
    expect(holder.isLoaded()).toBe(true);
    expect(holder.target).toBe(parent);
  });

  it("reads the target PK from the held instance, not the registry", () => {
    const child = new CpkSeedChild();
    const parent = new CompositePkParent({ id: [1, 2] });

    const holder = child.association("compositePkParent");

    const spy = vi.spyOn(associationsModule, "autoloadModel");
    try {
      holder.setTarget(parent);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("scalar FK + composite-PK target collapses to id component on assignment", () => {
    const child = new CpkSeedChild();
    const parent = new CompositePkParent({ id: [7, 42] });

    (child.association("compositePkParent") as unknown as { writer(target: unknown): void }).writer(
      parent,
    );

    expect((child as unknown as Record<string, unknown>).composite_pk_parent_id).toBe(42);
  });

  it("infers id as the association primary key for a [tenant_key, id]-PK target", () => {
    const child = new CpkSeedChild();
    const parent = new CompositePkParent({ id: [7, 42] });

    const holder = child.association("compositePkParent") as unknown as {
      associationPrimaryKeys(klass: unknown): string[];
    };
    expect(holder.associationPrimaryKeys(parent.constructor)).toEqual(["id"]);
  });
});

describe("belongs_to to a composite-PK target without an id column", () => {
  registerModel(TenantPkParent);
  registerModel(CpkTenantChild);

  it("raises a composite-PK/FK length mismatch at first association access", () => {
    const child = new CpkTenantChild();

    expect(() => child.association("tenantPkParent")).toThrow(CompositePrimaryKeyMismatchError);
  });
});
