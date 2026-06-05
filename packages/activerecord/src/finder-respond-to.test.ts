import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { Base, RecordNotFound } from "./index.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";
import { TEST_SCHEMA } from "./test-helpers/test-schema.js";

let Topic: typeof Base;
setupHandlerSuite();
useHandlerTransactionalFixtures();

beforeAll(async () => {
  await defineSchema({ topics: TEST_SCHEMA.topics });
});
// Recreate the model per test so a test that mutates the class (adds an
// attribute, primes a finder cache, etc.) can't leak into later tests.
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
    expect(Base.respondToMissingFinder("findBySomething")).toBe(false);
  });

  it("should preserve normal respond to behavior and respond to newly added method", () => {
    // Rails: `Topic.singleton_class.define_method(:method_added_for_finder_respond_to_test){}`
    // then `assert_respond_to Topic, :method_added_for_finder_respond_to_test`. A normal
    // method added to the class must still be found — the dynamic-finder
    // respond_to_missing? override must not mask it. (Topic is recreated per
    // test, so no cleanup is needed where Rails uses an `ensure` remove_method.)
    (Topic as unknown as Record<string, unknown>).methodAddedForFinderRespondToTest = () => {};
    expect(
      typeof (Topic as unknown as Record<string, unknown>).methodAddedForFinderRespondToTest,
    ).toBe("function");
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

  it("should respond to find all by an aliased attribute", () => {
    Topic.aliasAttribute("heading", "title");
    expect(Topic.respondToMissingFinder("findByHeading")).toBe(true);
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
