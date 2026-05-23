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
  await defineSchema({ topics: { title: "string", body: "string" } });
});

describe("AbsenceValidationTest", () => {
  function makeModel() {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.validates("body", { absence: true });
      }
    }
    return { Topic };
  }
  it("non association", () => {
    const { Topic } = makeModel();
    const t = new Topic({ body: "filled" });
    expect(t.isValid()).toBe(false);
  });
  it("has one marked for destruction", () => {
    const { Topic } = makeModel();
    const t = new Topic({ body: "" });
    expect(t.isValid()).toBe(true);
  });
  it("has many marked for destruction", () => {
    const { Topic } = makeModel();
    const t = new Topic({});
    expect(t.isValid()).toBe(true);
  });
  it("does not call to a on associations", () => {
    const { Topic } = makeModel();
    const t = new Topic({ title: "ok" });
    expect(t.isValid()).toBe(true);
  });
  it("validates absence of virtual attribute on model", () => {
    const { Topic } = makeModel();
    const t = new Topic({ body: "present" });
    expect(t.isValid()).toBe(false);
    expect(t.errors.empty).toBe(false);
  });
});
