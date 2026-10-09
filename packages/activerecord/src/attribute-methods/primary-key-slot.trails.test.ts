import { describe, it, expect, vi } from "vitest";
import { Base } from "../base.js";
import { adapterDouble, establishConnectionTo } from "../test-helpers/adapter-double.js";

describe("per-instance @primary_key slot", () => {
  it("seats the record's primary key from the class at init_internals", async () => {
    class SeatedToy extends Base {
      static override tableName = "toys";
      static {
        this.primaryKey = "toy_id";
      }
    }

    const record = new SeatedToy();

    expect((record as unknown as { _primaryKey?: string })._primaryKey).toBe("toy_id");

    SeatedToy.primaryKey = "id";
    const spy = vi.spyOn(
      record as unknown as { _readAttribute(n: string): unknown },
      "_readAttribute",
    );
    void record.id;

    expect(spy).toHaveBeenCalledWith("toy_id");
  });

  it("keeps the seat the class answered at construction", async () => {
    class ColdToy extends Base {
      static override tableName = "toys";
    }

    const record = new ColdToy();

    expect((record as unknown as { _primaryKey?: string })._primaryKey).toBe("id");

    await establishConnectionTo(
      ColdToy,
      adapterDouble({
        schemaCache: { getCachedPrimaryKeys: () => "toy_id" },
      }) as never,
    );
    await ColdToy.leaseConnection();
    const spy = vi.spyOn(
      record as unknown as { _readAttribute(n: string): unknown },
      "_readAttribute",
    );
    void record.id;

    expect(spy).toHaveBeenCalledWith("id");

    const warm = new ColdToy();
    expect((warm as unknown as { _primaryKey?: string })._primaryKey).toBe("toy_id");
  });

  it("primary_key= records composite_primary_key? and freezes the key", () => {
    class Keyed extends Base {
      static override tableName = "cpk_books";
    }

    Keyed.primaryKey = ["author_id", "id"];
    expect(Keyed.compositePrimaryKey).toBe(true);
    expect(Object.isFrozen(Keyed.primaryKey)).toBe(true);

    Keyed.primaryKey = "id";
    expect(Keyed.compositePrimaryKey).toBe(false);
  });

  it("composite_primary_key? answers the ivar, not the shape of the key", () => {
    class Stale extends Base {
      static override tableName = "cpk_books";
    }

    Stale.primaryKey = "id";
    (Stale as unknown as { _primaryKey: string[] })._primaryKey = ["author_id", "id"];
    expect(Stale.compositePrimaryKey).toBe(false);
  });

  it("a subclass that never assigns primary_key answers its parent's composite_primary_key?", () => {
    class Parent extends Base {
      static override tableName = "cpk_books";
    }
    Parent.primaryKey = ["author_id", "id"];
    class Child extends Parent {}

    expect(Child.primaryKey).toEqual(["author_id", "id"]);
    expect(Child.compositePrimaryKey).toBe(true);

    Child.resetPrimaryKey();
    expect(Object.prototype.hasOwnProperty.call(Child, "_compositePrimaryKey")).toBe(true);
    expect(Child.compositePrimaryKey).toBe(true);

    Child.primaryKey = "id";
    expect(Child.compositePrimaryKey).toBe(false);
    expect(Parent.compositePrimaryKey).toBe(true);
  });
});
