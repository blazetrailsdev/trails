import { describe, it, expect, beforeAll } from "vitest";
import { Base } from "./index.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";

setupHandlerSuite();
useHandlerTransactionalFixtures();
beforeAll(async () => {
  await defineSchema({
    parents: { name: "string" },
    children: { name: "string" },
  });
});
describe("InheritedTest", () => {
  it("super before filter attributes", async () => {
    const log: string[] = [];
    class Parent extends Base {
      static {
        this.attribute("name", "string");
        this.beforeCreate(function () {
          log.push("parent_before");
        });
      }
    }
    class Child extends Parent {
      static {
        this.beforeCreate(function () {
          log.push("child_before");
        });
      }
    }
    await Child.create({ name: "test" });
    expect(log).toContain("parent_before");
    expect(log).toContain("child_before");
    expect(log.indexOf("parent_before")).toBeLessThan(log.indexOf("child_before"));
  });

  it("super after filter attributes", async () => {
    const log: string[] = [];
    class Parent extends Base {
      static {
        this.attribute("name", "string");
        this.afterCreate(function () {
          log.push("parent_after");
        });
      }
    }
    class Child extends Parent {
      static {
        this.afterCreate(function () {
          log.push("child_after");
        });
      }
    }
    await Child.create({ name: "test" });
    expect(log).toContain("parent_after");
    expect(log).toContain("child_after");
  });
});
