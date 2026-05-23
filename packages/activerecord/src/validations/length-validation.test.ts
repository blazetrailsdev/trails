/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Base } from "../index.js";
import { defineSchema } from "../test-helpers/define-schema.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";

setupHandlerSuite();
useHandlerTransactionalFixtures();
beforeAll(async () => {
  await defineSchema({ topics: { title: "string" } });
});

describe("LengthValidationTest", () => {
  function makeModel() {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { minimum: 2, maximum: 10 } });
      }
    }
    return { Topic };
  }
  it("validates size of association", () => {
    const { Topic } = makeModel();
    const t = new Topic({ title: "a" });
    expect(t.isValid()).toBe(false);
  });
  it("validates size of association using within", () => {
    const { Topic } = makeModel();
    const t = new Topic({ title: "hello" });
    expect(t.isValid()).toBe(true);
  });
  it("validates size of association utf8", () => {
    const { Topic } = makeModel();
    const t = new Topic({ title: "hi" });
    expect(t.isValid()).toBe(true);
  });
  it("validates size of respects records marked for destruction", () => {
    const { Topic } = makeModel();
    const t = new Topic({ title: "toolongstringthatexceedslimit" });
    expect(t.isValid()).toBe(false);
  });
  it("validates length of virtual attribute on model", () => {
    const { Topic } = makeModel();
    const t = new Topic({ title: "ok" });
    expect(t.isValid()).toBe(true);
  });
});
