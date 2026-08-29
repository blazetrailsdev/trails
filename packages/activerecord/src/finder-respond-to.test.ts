import { describe, it, expect, beforeEach } from "vitest";
import { Base, RecordNotFound } from "./index.js";
import { fixtures } from "./test-fixtures.js";

let Topic: typeof Base;
fixtures([]);

beforeEach(() => {
  Topic = class extends Base {
    static {
      this.attribute("title", "string");
      this.attribute("author_name", "string");
    }
  };
});

describe("FinderRespondToTest", () => {
  it("should preserve normal respond to behavior on base", () => {
    expect(typeof Base.create).toBe("function");
    expect(typeof Base.find).toBe("function");
    expect(Base.respondToMissing("findBySomething")).toBe(false);
  });

  it("should preserve normal respond to behavior and respond to newly added method", () => {
    (Topic as unknown as Record<string, unknown>).methodAddedForFinderRespondToTest = () => {};
    expect(Topic.respondToMissing("methodAddedForFinderRespondToTest")).toBe(false);
    expect(
      typeof (Topic as unknown as Record<string, unknown>).methodAddedForFinderRespondToTest,
    ).toBe("function");
  });

  it("should preserve normal respond to behavior and respond to standard object method", () => {
    expect(typeof Base.name).toBe("string");
    expect(typeof Base.toString).toBe("function");
  });

  it("should respond to find by one attribute before caching", () => {
    expect(Topic.respondToMissing("findByTitle")).toBe(true);
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

  it("should respond to find all by an aliased attribute", () => {
    Topic.aliasAttribute("heading", "title");
    expect(Topic.respondToMissing("findByHeading")).toBe(true);
  });

  it("should not respond to find by one missing attribute", () => {
    expect(Topic.respondToMissing("findByNonexistent")).toBe(false);
  });

  it("should not respond to find by invalid method syntax", () => {
    expect(Topic.respondToMissing("")).toBe(false);
    expect(Topic.respondToMissing("not_a_finder")).toBe(false);
    expect(Topic.respondToMissing("findBy")).toBe(false);
  });
});
