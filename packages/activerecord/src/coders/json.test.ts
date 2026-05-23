import { describe, it, expect, beforeAll } from "vitest";
import { Base, serialize } from "../index.js";
import { defineSchema } from "../test-helpers/define-schema.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";

setupHandlerSuite();
useHandlerTransactionalFixtures();
beforeAll(async () => {
  await defineSchema({ topics: { content: "string" } });
});
describe("JSONTest", () => {
  it("returns nil if empty string given", async () => {
    class Topic extends Base {
      static {
        this.attribute("content", "string");
      }
    }
    serialize(Topic, "content");
    const t = await Topic.create({ content: "" });
    const reloaded = await Topic.find(t.id);
    expect(reloaded.content).toBeNull();
  });

  it("returns nil if nil given", async () => {
    class Topic extends Base {
      static {
        this.attribute("content", "string");
      }
    }
    serialize(Topic, "content");
    const t = await Topic.create({ content: null });
    const reloaded = await Topic.find(t.id);
    expect(reloaded.content).toBeNull();
  });
});
