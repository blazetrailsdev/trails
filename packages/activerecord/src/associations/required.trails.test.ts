import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Base, registerModel } from "../index.js";
import type { CollectionAssociation } from "./collection-association.js";
import { fixtures } from "../test-helpers/use-fixtures.js";

describe("RequiredAssociationsTest", () => {
  fixtures([]);
  beforeAll(async () => {
    await (await Base.leaseConnection()).createTable("parents", { force: true }, () => {});
    await (
      await Base.leaseConnection()
    ).createTable("children", { force: true }, (t) => {
      t.integer("parent_id");
    });
  });
  afterAll(async () => {
    await (await Base.leaseConnection()).dropTable("children", "parents", { ifExists: true });
  });

  it("required belongs_to validates target exists, not just the foreign key", async () => {
    class Parent extends Base {}
    class Child extends Base {
      declare parent_id: number;
      static {
        this.attribute("parent_id", "integer");
        this.belongsTo("parent", {
          required: true,
          inverseOf: false,
          className: "Parent",
        });
      }
    }
    registerModel("Parent", Parent);
    registerModel("Child", Child);

    const orphan = new Child();
    orphan.parent_id = 999999;
    expect(await orphan.save()).toBe(false);
    expect(orphan.errors.fullMessages).toEqual(["Parent must exist"]);

    const parent = new Parent();
    expect(await parent.save()).toBe(true);
    const child = new Child();
    child.parent_id = parent.id as number;
    expect(await child.save()).toBe(true);

    const skip = new Child();
    skip.parent_id = 999999;
    expect(await skip.save({ validate: false })).toBe(true);
  });

  it("validates has_many children when parent saves without crashing on unloaded target", async () => {
    class Parent extends Base {
      static {
        this.hasMany("children", { validate: true, foreignKey: "parent_id", className: "Child" });
      }
    }
    class Child extends Base {
      static {
        this.attribute("parent_id", "integer");
        this.belongsTo("parent", {
          required: true,
          foreignKey: "parent_id",
          className: "Parent",
        });
      }
    }
    registerModel("Parent", Parent);
    registerModel("Child", Child);

    const parent = new Parent();
    await (parent.association("children") as CollectionAssociation).writer([new Child()]);
    expect(await parent.save()).toBe(false);
    expect(parent.errors.fullMessages).toEqual(["Children is invalid"]);
  });
});
