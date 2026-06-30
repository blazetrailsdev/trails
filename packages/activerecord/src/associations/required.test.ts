/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Base, registerModel } from "../index.js";
import { Associations } from "../associations.js";
import { MigrationContext } from "../migration.js";
import { setupFixtures } from "../test-helpers/fixtures.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";

describe("RequiredAssociationsTest", () => {
  setupFixtures();
  useHandlerTransactionalFixtures();
  let ctx: MigrationContext;
  beforeAll(async () => {
    ctx = new MigrationContext(Base.connection);
    await ctx.createTable("parents", { force: true }, () => {});
    await ctx.createTable("children", { force: true }, (t) => {
      t.integer("parent_id");
    });
  });
  afterAll(async () => {
    await ctx.dropTable("children", "parents", { ifExists: true });
  });

  it("belongs_to associations can be optional by default", async () => {
    const prev = (Base as any).belongsToRequiredByDefault;
    try {
      (Base as any).belongsToRequiredByDefault = false;
      class Parent extends Base {}
      class Child extends Base {
        static {
          this.attribute("parent_id", "integer");
        }
      }
      Associations.belongsTo.call(Child, "parent", {
        inverseOf: false,
        className: "Parent",
      });
      registerModel("Parent", Parent);
      registerModel("Child", Child);

      expect(await new Child().save()).toBe(true);
      expect(await new Child({ parent: new Parent() }).save()).toBe(true);
    } finally {
      if (prev === undefined) {
        delete (Base as any).belongsToRequiredByDefault;
      } else {
        (Base as any).belongsToRequiredByDefault = prev;
      }
    }
  });

  it("required belongs_to associations have presence validated", async () => {
    class Parent extends Base {}
    class Child extends Base {
      static {
        this.attribute("parent_id", "integer");
      }
    }
    Associations.belongsTo.call(Child, "parent", {
      required: true,
      inverseOf: false,
      className: "Parent",
    });
    registerModel("Parent", Parent);
    registerModel("Child", Child);

    const record = new Child();
    expect(await record.save()).toBe(false);
    expect(record.errors.fullMessages).toEqual(["Parent must exist"]);

    record.parent = new Parent();
    expect(await record.save()).toBe(true);
  });

  it("required belongs_to validates target exists, not just the foreign key", async () => {
    class Parent extends Base {}
    class Child extends Base {
      static {
        this.attribute("parent_id", "integer");
      }
    }
    Associations.belongsTo.call(Child, "parent", {
      required: true,
      inverseOf: false,
      className: "Parent",
    });
    registerModel("Parent", Parent);
    registerModel("Child", Child);

    // A FK that points at a row that does not exist must fail "must exist",
    // matching Rails reading the association (loading nil) during validation.
    const orphan = new Child();
    (orphan as any).parent_id = 999999;
    expect(await orphan.save()).toBe(false);
    expect(orphan.errors.fullMessages).toEqual(["Parent must exist"]);

    // A FK that points at a row that does exist still saves.
    const parent = new Parent();
    expect(await parent.save()).toBe(true);
    const child = new Child();
    (child as any).parent_id = (parent as any).id;
    expect(await child.save()).toBe(true);

    // save(validate: false) bypasses the existence check, like Rails' valid?.
    const skip = new Child();
    (skip as any).parent_id = 999999;
    expect(await skip.save({ validate: false })).toBe(true);
  });

  it("belongs_to associations can be required by default", async () => {
    const prev = (Base as any).belongsToRequiredByDefault;
    try {
      (Base as any).belongsToRequiredByDefault = true;
      class Parent extends Base {}
      class Child extends Base {
        static {
          this.attribute("parent_id", "integer");
        }
      }
      Associations.belongsTo.call(Child, "parent", {
        inverseOf: false,
        className: "Parent",
      });
      registerModel("Parent", Parent);
      registerModel("Child", Child);

      const record = new Child();
      expect(await record.save()).toBe(false);
      expect(record.errors.fullMessages).toEqual(["Parent must exist"]);

      record.parent = new Parent();
      expect(await record.save()).toBe(true);
    } finally {
      if (prev === undefined) {
        delete (Base as any).belongsToRequiredByDefault;
      } else {
        (Base as any).belongsToRequiredByDefault = prev;
      }
    }
  });

  it("has_one associations are not required by default", async () => {
    class Parent extends Base {}
    class Child extends Base {
      static {
        this.attribute("parent_id", "integer");
      }
    }
    Associations.hasOne.call(Parent, "child", {
      inverseOf: false,
      className: "Child",
      foreignKey: "parent_id",
    });
    registerModel("Parent", Parent);
    registerModel("Child", Child);

    expect(await new Parent().save()).toBe(true);
    expect(await new Parent({ child: new Child() }).save()).toBe(true);
  });

  it("required has_one associations have presence validated", async () => {
    class Parent extends Base {}
    class Child extends Base {
      static {
        this.attribute("parent_id", "integer");
      }
    }
    Associations.hasOne.call(Parent, "child", {
      required: true,
      inverseOf: false,
      className: "Child",
      foreignKey: "parent_id",
    });
    registerModel("Parent", Parent);
    registerModel("Child", Child);

    const record = new Parent();
    expect(await record.save()).toBe(false);
    expect(record.errors.fullMessages).toEqual(["Child must exist"]);

    (record as any).child = new Child();
    expect(await record.save()).toBe(true);
  });

  it("required has_one associations have a correct error message", async () => {
    class Parent extends Base {}
    class Child extends Base {
      static {
        this.attribute("parent_id", "integer");
      }
    }
    Associations.hasOne.call(Parent, "child", {
      required: true,
      inverseOf: false,
      className: "Child",
      foreignKey: "parent_id",
    });
    registerModel("Parent", Parent);
    registerModel("Child", Child);

    const record = new Parent();
    await record.save();
    expect(record.errors.fullMessages).toEqual(["Child must exist"]);
  });

  it("required belongs_to associations have a correct error message", async () => {
    class Parent extends Base {}
    class Child extends Base {
      static {
        this.attribute("parent_id", "integer");
      }
    }
    Associations.belongsTo.call(Child, "parent", {
      required: true,
      inverseOf: false,
      className: "Parent",
    });
    registerModel("Parent", Parent);
    registerModel("Child", Child);

    const record = new Child();
    await record.save();
    expect(record.errors.fullMessages).toEqual(["Parent must exist"]);
  });

  // Trails-internal: no Rails counterpart. Pins the `assoc.target != null` guard in
  // readAttributeForValidation — when has_many validate: true validates a child whose
  // required belongs_to `parent` target is unloaded (null), the validator must read the
  // target without crashing. The child has no foreign key, so it is invalid and the parent
  // save fails cleanly (rather than throwing) — that no-crash outcome is what is pinned.
  it("validates has_many children when parent saves without crashing on unloaded target", async () => {
    class Parent extends Base {
      static {
        this.hasMany("children", { validate: true, foreignKey: "parent_id", className: "Child" });
      }
    }
    class Child extends Base {
      static {
        this.attribute("parent_id", "integer");
      }
    }
    Associations.belongsTo.call(Child, "parent", {
      required: true,
      foreignKey: "parent_id",
      className: "Parent",
    });
    registerModel("Parent", Parent);
    registerModel("Child", Child);

    const parent = new Parent();
    (parent as any).children = [new Child()];
    expect(await parent.save()).toBe(false);
    expect(parent.errors.fullMessages).toEqual(["Children is invalid"]);
  });
});
