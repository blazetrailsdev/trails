import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Base, registerModel } from "../index.js";
import { Associations } from "../associations.js";
import { fixtures } from "../test-fixtures.js";

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

  it("belongs_to associations can be optional by default", async () => {
    const prev = (Base as any).belongsToRequiredByDefault;
    try {
      (Base as any).belongsToRequiredByDefault = false;
      class Parent extends Base {}
      class Child extends Base {
        declare parent: any;
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

      expect(await new Child().save()).toBeTruthy();
      expect(await new Child({ parent: new Parent() }).save()).toBeTruthy();
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
      declare parent: any;
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
    expect(await record.save()).toBeFalsy();
    expect(record.errors.fullMessages).toEqual(["Parent must exist"]);

    record.parent = new Parent();
    expect(await record.save()).toBeTruthy();
  });

  it("belongs_to associations can be required by default", async () => {
    const prev = (Base as any).belongsToRequiredByDefault;
    try {
      (Base as any).belongsToRequiredByDefault = true;
      class Parent extends Base {}
      class Child extends Base {
        declare parent: any;
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
      expect(await record.save()).toBeFalsy();
      expect(record.errors.fullMessages).toEqual(["Parent must exist"]);

      record.parent = new Parent();
      expect(await record.save()).toBeTruthy();
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
      declare parent: any;
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

    expect(await new Parent().save()).toBeTruthy();
    expect(await new Parent({ child: new Child() }).save()).toBeTruthy();
  });

  it("required has_one associations have presence validated", async () => {
    class Parent extends Base {}
    class Child extends Base {
      declare parent: any;
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
    expect(await record.save()).toBeFalsy();
    expect(record.errors.fullMessages).toEqual(["Child must exist"]);

    await (record as any).setChild(new Child());
    expect(await record.save()).toBeTruthy();
  });

  it("required has_one associations have a correct error message", async () => {
    class Parent extends Base {}
    class Child extends Base {
      declare parent: any;
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
      declare parent: any;
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
