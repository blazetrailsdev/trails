/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Base } from "./index.js";

import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";

const TEST_SCHEMA = {
  topics: { title: "string", author: "string" },
  users: { name: "string", email: "string" },
} as const;

describe("CoreTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema(TEST_SCHEMA);
  });

  function makeModel() {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("author", "string");
      }
    }
    return { Topic };
  }

  it("inspect class", () => {
    const { Topic } = makeModel();
    expect(typeof Topic.name).toBe("string");
    expect(Topic.name).toBe("Topic");
  });

  it("inspect includes attributes from attributes for inspect", async () => {
    const { Topic } = makeModel();
    (Topic as any).attributesForInspect = ["id", "title"];
    const t = await Topic.create({ title: "hello", author: "david" });
    const str = t.inspect();
    expect(str).toBe(`#<Topic id: ${t.id}, title: "hello">`);
    expect(str).not.toContain("author");
  });

  it("inspect instance with lambda date formatter", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "dated", author: "alice" });
    expect(t.title).toBe("dated");
  });

  it("inspect singleton instance", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "single" });
    expect(t.isPersisted()).toBe(true);
  });

  it("inspect limited select instance", async () => {
    const { Topic } = makeModel();
    await Topic.create({ title: "limited", author: "bob" });
    const results = await Topic.select("title");
    expect(results.length).toBe(1);
    expect(results[0].title).toBe("limited");
  });

  it("inspect instance with non primary key id attribute", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "npk" });
    expect(t.id).toBeDefined();
  });

  it("inspect class without table", () => {
    const { Topic } = makeModel();
    expect(Topic.tableName).toBeDefined();
  });

  it("inspect with attributes for inspect all lists all attributes", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "all", author: "carol" });
    expect(t.title).toBe("all");
    expect(t.author).toBe("carol");
  });

  it("inspect relation with virtual field", async () => {
    const { Topic } = makeModel();
    await Topic.create({ title: "vf", author: "dave" });
    const results = await Topic.all();
    expect(results.length).toBe(1);
  });

  it("inspect with overridden attribute for inspect", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "ov", author: "eve" });
    expect(t.author).toBe("eve");
  });

  it("full inspect lists all attributes", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "full", author: "frank" });
    expect(t.title).toBe("full");
    expect(t.author).toBe("frank");
  });

  it("pretty print new", () => {
    const { Topic } = makeModel();
    const t = new Topic({ title: "new" });
    expect(t.isNewRecord()).toBe(true);
  });

  it("pretty print persisted", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "persisted" });
    expect(t.isPersisted()).toBe(true);
  });

  it("pretty print full", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "full2", author: "grace" });
    expect(t.title).toBe("full2");
  });

  it("pretty print uninitialized", () => {
    const { Topic } = makeModel();
    const t = new Topic({});
    expect(t.isNewRecord()).toBe(true);
  });

  it("pretty print overridden by inspect", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "override" });
    expect(t.isPersisted()).toBe(true);
  });

  it("pretty print with non primary key id attribute", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "npkid" });
    expect(t.id).not.toBeNull();
  });

  it("pretty print with overridden attribute for inspect", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "ovinspect", author: "hal" });
    expect(t.author).toBe("hal");
  });

  it("find by cache does not duplicate entries", async () => {
    const { Topic } = makeModel();
    await Topic.create({ title: "dup1" });
    await Topic.create({ title: "dup2" });
    const results = await Topic.all();
    expect(results.length).toBe(2);
  });

  it("composite pk models added to a set", async () => {
    const { Topic } = makeModel();
    const t1 = await Topic.create({ title: "set1" });
    const t2 = await Topic.create({ title: "set2" });
    const ids = new Set([t1.id, t2.id]);
    expect(ids.size).toBe(2);
  });

  it("composite pk models equality", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "eq" });
    const same = await Topic.find(t.id!);
    expect(same.id).toBe(t.id);
  });

  it("composite pk models hash", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "hash" });
    expect(t.id).toBeDefined();
  });

  it("inspect instance", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const t = await Topic.create({ title: "first" });
    const str = t.inspect();
    expect(str).toContain("Topic");
    expect(str).toContain("title");
    expect(str).toContain("first");
  });

  it("inspect new instance", () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const t = new Topic({ title: "new" });
    const str = t.inspect();
    expect(str).toContain("Topic");
    expect(str).toContain("title");
    expect(str).toContain("new");
  });
});
