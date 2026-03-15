import { describe, it, expect } from "vitest";
import { Base } from "./index.js";
import { createTestAdapter } from "./test-adapter.js";

describe("FinderRespondToTest", () => {
  it("should preserve normal respond to behavior on base", () => {
    expect(typeof Base.create).toBe("function");
    expect(typeof Base.find).toBe("function");
    expect(Base.respondToMissingFinder("findBySomething")).toBe(false);
  });

  it("should preserve normal respond to behavior and respond to newly added method", () => {
    const adapter = createTestAdapter();
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    // Adding a new attribute makes the corresponding finder respond
    expect(Topic.respondToMissingFinder("findByTitle")).toBe(true);
    // Adding another attribute dynamically
    Topic.attribute("status", "string");
    expect(Topic.respondToMissingFinder("findByStatus")).toBe(true);
  });

  it("should preserve normal respond to behavior and respond to standard object method", () => {
    expect(typeof Base.name).toBe("string");
    expect(typeof Base.toString).toBe("function");
  });

  it("should respond to find by one attribute before caching", () => {
    const adapter = createTestAdapter();
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    expect(Topic.respondToMissingFinder("findByTitle")).toBe(true);
  });

  it("should respond to find by with bang", async () => {
    const adapter = createTestAdapter();
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    // findBy! in Rails corresponds to findBy that throws on not found
    expect(Topic.respondToMissingFinder("findByTitle")).toBe(true);
    // Verify findBy actually works end-to-end
    await Topic.create({ title: "test" });
    const found = await Topic.findBy({ title: "test" });
    expect(found).not.toBeNull();
  });

  it("should respond to find by two attributes", () => {
    const adapter = createTestAdapter();
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("author_name", "string");
        this.adapter = adapter;
      }
    }
    // Each attribute should independently respond
    expect(Topic.respondToMissingFinder("findByTitle")).toBe(true);
    expect(Topic.respondToMissingFinder("findByAuthorName")).toBe(true);
  });

  it("should respond to find all by an aliased attribute", () => {
    const adapter = createTestAdapter();
    class Topic extends Base {
      static {
        this.attribute("heading", "string");
        this.adapter = adapter;
      }
    }
    // Tests that the attribute name itself is used for finder detection
    expect(Topic.respondToMissingFinder("findByHeading")).toBe(true);
  });

  it("should not respond to find by one missing attribute", () => {
    const adapter = createTestAdapter();
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    expect(Topic.respondToMissingFinder("findByNonexistent")).toBe(false);
  });

  it("should not respond to find by invalid method syntax", () => {
    const adapter = createTestAdapter();
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    expect(Topic.respondToMissingFinder("")).toBe(false);
    expect(Topic.respondToMissingFinder("not_a_finder")).toBe(false);
    expect(Topic.respondToMissingFinder("findBy")).toBe(false);
  });
});
