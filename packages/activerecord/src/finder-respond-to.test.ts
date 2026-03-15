import { describe, it, expect, beforeEach } from "vitest";
import { Base, RecordNotFound } from "./index.js";
import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";

describe("FinderRespondToTest", () => {
  let adapter: DatabaseAdapter;
  let Topic: typeof Base;

  beforeEach(() => {
    adapter = createTestAdapter();
    Topic = class extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("author_name", "string");
        this.adapter = adapter;
      }
    };
  });

  it("should preserve normal respond to behavior on base", () => {
    expect(typeof Base.create).toBe("function");
    expect(typeof Base.find).toBe("function");
    expect(Base.respondToMissingFinder("findBySomething")).toBe(false);
  });

  it("should preserve normal respond to behavior and respond to newly added method", () => {
    expect(Topic.respondToMissingFinder("findByTitle")).toBe(true);
    Topic.attribute("status", "string");
    expect(Topic.respondToMissingFinder("findByStatus")).toBe(true);
  });

  it("should preserve normal respond to behavior and respond to standard object method", () => {
    expect(typeof Base.name).toBe("string");
    expect(typeof Base.toString).toBe("function");
  });

  it("should respond to find by one attribute before caching", () => {
    expect(Topic.respondToMissingFinder("findByTitle")).toBe(true);
  });

  it("should respond to find by with bang", async () => {
    await Topic.create({ title: "exists" });
    const found = await Topic.findByBang({ title: "exists" });
    expect(found).not.toBeNull();
    await expect(Topic.findByBang({ title: "missing" })).rejects.toThrow(RecordNotFound);
  });

  it("should respond to find by two attributes", async () => {
    await Topic.create({ title: "Hello", author_name: "Alice" });
    const byBoth = await Topic.findBy({ title: "Hello", author_name: "Alice" });
    expect(byBoth).not.toBeNull();
  });

  it.skip("should respond to find all by an aliased attribute", () => {
    /* needs aliasAttribute implementation */
  });

  it("should not respond to find by one missing attribute", () => {
    expect(Topic.respondToMissingFinder("findByNonexistent")).toBe(false);
  });

  it("should not respond to find by invalid method syntax", () => {
    expect(Topic.respondToMissingFinder("")).toBe(false);
    expect(Topic.respondToMissingFinder("not_a_finder")).toBe(false);
    expect(Topic.respondToMissingFinder("findBy")).toBe(false);
  });
});
