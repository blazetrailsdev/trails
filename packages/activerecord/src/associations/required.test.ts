/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Base, registerModel } from "../index.js";
import { Associations } from "../associations.js";
import { MigrationContext } from "../migration.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";

describe("RequiredAssociationsTest", () => {
  setupHandlerSuite();
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
    await ctx.dropTable("children", { ifExists: true });
    await ctx.dropTable("parents", { ifExists: true });
  });

  it("belongs_to associations can be optional by default", async () => {
    class Parent extends Base {}
    class Child extends Base {
      static {
        this.attribute("parent_id", "integer");
      }
    }
    Associations.belongsTo.call(Child, "parent", {
      optional: true,
      inverseOf: false,
      className: "Parent",
    });
    registerModel("Parent", Parent);
    registerModel("Child", Child);

    expect(await new Child().save()).toBe(true);
    const parent = await Parent.create({});
    expect(await new Child({ parent_id: parent.id }).save()).toBe(true);
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

    const parent = await Parent.create({});
    record.writeAttribute("parent_id", parent.id);
    expect(await record.save()).toBe(true);
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

      const parent = await Parent.create({});
      record.writeAttribute("parent_id", parent.id);
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
    const parent = await Parent.create({});
    expect(await new Child({ parent_id: parent.id }).save()).toBe(true);
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
});

describe("belongs_to required option", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  let ctx: MigrationContext;
  beforeAll(async () => {
    ctx = new MigrationContext(Base.connection);
    await ctx.createTable("r_authors", { force: true }, (t) => {
      t.string("name");
    });
    await ctx.createTable("r_books", { force: true }, (t) => {
      t.string("title");
      t.integer("author_id");
    });
    await ctx.createTable("r_writers", { force: true }, (t) => {
      t.string("name");
    });
    await ctx.createTable("r_novels", { force: true }, (t) => {
      t.string("title");
      t.integer("writer_id");
    });
    await ctx.createTable("rg_parents", { force: true }, (t) => {
      t.string("name");
    });
    await ctx.createTable("rg_children", { force: true }, (t) => {
      t.string("title");
      t.integer("rg_parent_id");
    });
  });
  afterAll(async () => {
    await ctx.dropTable("r_authors", { ifExists: true });
    await ctx.dropTable("r_books", { ifExists: true });
    await ctx.dropTable("r_writers", { ifExists: true });
    await ctx.dropTable("r_novels", { ifExists: true });
    await ctx.dropTable("rg_parents", { ifExists: true });
    await ctx.dropTable("rg_children", { ifExists: true });
  });

  it("validates presence of foreign key when required: true", async () => {
    class RAuthor extends Base {
      static _tableName = "r_authors";
    }
    RAuthor.attribute("name", "string");

    class RBook extends Base {
      static _tableName = "r_books";
    }
    RBook.attribute("author_id", "integer");
    RBook.attribute("title", "string");

    registerModel("RAuthor", RAuthor);
    registerModel("RBook", RBook);
    Associations.belongsTo.call(RBook, "author", { required: true, className: "RAuthor" });

    const book = new RBook({ title: "No Author" });
    expect(await book.save()).toBe(false);
    expect(book.errors.fullMessages.some((m: string) => m.toLowerCase().includes("author"))).toBe(
      true,
    );
  });

  it("passes validation when foreign key is present", async () => {
    class RWriter extends Base {
      static _tableName = "r_writers";
    }
    RWriter.attribute("name", "string");

    class RNovel extends Base {
      static _tableName = "r_novels";
    }
    RNovel.attribute("writer_id", "integer");
    RNovel.attribute("title", "string");

    registerModel("RWriter", RWriter);
    registerModel("RNovel", RNovel);
    Associations.belongsTo.call(RNovel, "writer", { required: true, className: "RWriter" });

    const writer = await RWriter.create({ name: "Tolkien" });
    const novel = new RNovel({ title: "LotR", writer_id: writer.id });
    expect(await novel.save()).toBe(true);
  });

  // Pins the `assoc.target != null` guard in readAttributeForValidation: an unloaded
  // belongs_to with target === null must not crash validators when has_many validate: true
  // triggers child validation on parent save.
  it("validates has_many children when parent saves without crashing on unloaded target", async () => {
    class RGChild extends Base {
      static _tableName = "rg_children";
    }
    RGChild.attribute("title", "string");
    RGChild.attribute("rg_parent_id", "integer");

    class RGParent extends Base {
      static _tableName = "rg_parents";
    }
    RGParent.attribute("name", "string");

    registerModel("RGParent", RGParent);
    registerModel("RGChild", RGChild);
    Associations.belongsTo.call(RGChild, "rgParent", {
      required: true,
      foreignKey: "rg_parent_id",
      className: "RGParent",
    });
    Associations.hasMany.call(RGParent, "rgChildren", {
      validate: true,
      foreignKey: "rg_parent_id",
      className: "RGChild",
    });

    const parent = new RGParent({ name: "p1" });
    expect(await parent.save()).toBe(true);
    expect(parent.id).toBeTruthy();
  });
});
