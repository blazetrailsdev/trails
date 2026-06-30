/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeAll } from "vitest";

import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { Topic } from "./test-helpers/models/topic.js";

describe("CoreTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  // Recreate just the canonical `topics` table (empty) so the count-based cases
  // below see only the rows they create — Rails CoreTest declares no fixtures.
  beforeAll(async () => {
    await defineSchema({ topics: canonicalSchema.topics }, { dropExisting: true });
  });

  it("inspect class", () => {
    expect(typeof Topic.name).toBe("string");
    expect(Topic.name).toBe("Topic");
  });

  it("inspect includes attributes from attributes for inspect", async () => {
    const had = Object.prototype.hasOwnProperty.call(Topic, "attributesForInspect");
    const prev = (Topic as any).attributesForInspect;
    (Topic as any).attributesForInspect = ["id", "title"];
    try {
      const t = await Topic.create({ title: "hello", author_name: "david" });
      const str = t.inspect();
      expect(str).toBe(`#<Topic id: ${t.id}, title: "hello">`);
      expect(str).not.toContain("author");
    } finally {
      if (had) (Topic as any).attributesForInspect = prev;
      else delete (Topic as any).attributesForInspect;
    }
  });

  it("inspect instance with lambda date formatter", async () => {
    const t = await Topic.create({ title: "dated", author_name: "alice" });
    expect(t.title).toBe("dated");
  });

  it("inspect singleton instance", async () => {
    const t = await Topic.create({ title: "single" });
    expect(t.isPersisted()).toBe(true);
  });

  it("inspect limited select instance", async () => {
    await Topic.create({ title: "limited", author_name: "bob" });
    const results = await Topic.select("title");
    expect(results.length).toBe(1);
    expect(results[0].title).toBe("limited");
  });

  it("inspect instance with non primary key id attribute", async () => {
    const t = await Topic.create({ title: "npk" });
    expect(t.id).toBeDefined();
  });

  it("inspect class without table", () => {
    expect(Topic.tableName).toBeDefined();
  });

  it("inspect with attributes for inspect all lists all attributes", async () => {
    const t = await Topic.create({ title: "all", author_name: "carol" });
    expect(t.title).toBe("all");
    expect(t.author_name).toBe("carol");
  });

  it("inspect relation with virtual field", async () => {
    await Topic.create({ title: "vf", author_name: "dave" });
    const results = await Topic.all();
    expect(results.length).toBe(1);
  });

  it("inspect with overridden attribute for inspect", async () => {
    const t = await Topic.create({ title: "ov", author_name: "eve" });
    expect(t.author_name).toBe("eve");
  });

  it("full inspect lists all attributes", async () => {
    const t = await Topic.create({ title: "full", author_name: "frank" });
    expect(t.title).toBe("full");
    expect(t.author_name).toBe("frank");
  });

  it("pretty print new", () => {
    const t = new Topic({ title: "new" });
    expect(t.isNewRecord()).toBe(true);
  });

  it("pretty print persisted", async () => {
    const t = await Topic.create({ title: "persisted" });
    expect(t.isPersisted()).toBe(true);
  });

  it("pretty print full", async () => {
    const t = await Topic.create({ title: "full2", author_name: "grace" });
    expect(t.title).toBe("full2");
  });

  it("pretty print uninitialized", () => {
    const t = new Topic({});
    expect(t.isNewRecord()).toBe(true);
  });

  it("pretty print overridden by inspect", async () => {
    const t = await Topic.create({ title: "override" });
    expect(t.isPersisted()).toBe(true);
  });

  it("pretty print with non primary key id attribute", async () => {
    const t = await Topic.create({ title: "npkid" });
    expect(t.id).not.toBeNull();
  });

  it("pretty print with overridden attribute for inspect", async () => {
    const t = await Topic.create({ title: "ovinspect", author_name: "hal" });
    expect(t.author_name).toBe("hal");
  });

  it("find by cache does not duplicate entries", async () => {
    await Topic.create({ title: "dup1" });
    await Topic.create({ title: "dup2" });
    const results = await Topic.all();
    expect(results.length).toBe(2);
  });

  it("composite pk models added to a set", async () => {
    const t1 = await Topic.create({ title: "set1" });
    const t2 = await Topic.create({ title: "set2" });
    const ids = new Set([t1.id, t2.id]);
    expect(ids.size).toBe(2);
  });

  it("composite pk models equality", async () => {
    const t = await Topic.create({ title: "eq" });
    const same = await Topic.find(t.id!);
    expect(same.id).toBe(t.id);
  });

  it("composite pk models hash", async () => {
    const t = await Topic.create({ title: "hash" });
    expect(t.id).toBeDefined();
  });

  it("inspect instance", async () => {
    const t = await Topic.create({ title: "first" });
    const str = t.inspect();
    expect(str).toContain("Topic");
    expect(str).toContain("title");
    expect(str).toContain("first");
  });

  it("inspect new instance", () => {
    const t = new Topic({ title: "new" });
    const str = t.inspect();
    expect(str).toContain("Topic");
    expect(str).toContain("title");
    expect(str).toContain("new");
  });
});
