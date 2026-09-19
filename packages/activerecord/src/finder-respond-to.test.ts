import { describe, it, beforeEach } from "vitest";
import { assertRespondTo, assertNotRespondTo } from "@blazetrails/activesupport";
import { Base } from "./index.js";
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
    assertRespondTo(Base, "create");
    assertNotRespondTo(Base, "findBySomething");
  });

  it("should preserve normal respond to behavior and respond to newly added method", () => {
    (Topic as unknown as Record<string, unknown>).methodAddedForFinderRespondToTest = () => {};
    assertRespondTo(Topic, "methodAddedForFinderRespondToTest");
  });

  it("should preserve normal respond to behavior and respond to standard object method", () => {
    assertRespondTo(Topic, "toString");
  });

  it.skip("should respond to find by one attribute before caching", () => {
    // BLOCKED: finder-respond-to-dynamic-finders-invisible-to-in
    assertRespondTo(Topic, "findByTitle");
  });

  it.skip("should respond to find by with bang", () => {
    // BLOCKED: finder-respond-to-dynamic-finders-invisible-to-in
    assertRespondTo(Topic, "findByTitle!");
  });

  it.skip("should respond to find by two attributes", () => {
    // BLOCKED: finder-respond-to-dynamic-finders-invisible-to-in
    assertRespondTo(Topic, "findByTitleAndAuthorName");
  });

  it.skip("should respond to find all by an aliased attribute", () => {
    // BLOCKED: finder-respond-to-dynamic-finders-invisible-to-in
    Topic.aliasAttribute("heading", "title");
    assertRespondTo(Topic, "findByHeading");
  });

  it("should not respond to find by one missing attribute", () => {
    assertNotRespondTo(Topic, "findByNonexistent");
  });

  it("should not respond to find by invalid method syntax", () => {
    assertNotRespondTo(Topic, "failToFindByTitle");
    assertNotRespondTo(Topic, "findByTitle?");
    assertNotRespondTo(Topic, "failToFindOrCreateByTitle");
    assertNotRespondTo(Topic, "findOrCreateByTitle?");
  });
});
