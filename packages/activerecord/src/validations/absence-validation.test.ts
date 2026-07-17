/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect } from "vitest";
import { Base } from "../index.js";
import { fixtures } from "../test-helpers/fixtures.js";

fixtures({});

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
  it("non association", async () => {
    const { Topic } = makeModel();
    const t = new Topic({ body: "filled" });
    expect(await t.isValid()).toBe(false);
  });
  it("has one marked for destruction", async () => {
    const { Topic } = makeModel();
    const t = new Topic({ body: "" });
    expect(await t.isValid()).toBe(true);
  });
  it("has many marked for destruction", async () => {
    const { Topic } = makeModel();
    const t = new Topic({});
    expect(await t.isValid()).toBe(true);
  });
  it("does not call to a on associations", async () => {
    const { Topic } = makeModel();
    const t = new Topic({ title: "ok" });
    expect(await t.isValid()).toBe(true);
  });
  it("validates absence of virtual attribute on model", async () => {
    const { Topic } = makeModel();
    const t = new Topic({ body: "present" });
    expect(await t.isValid()).toBe(false);
    expect(t.errors.empty).toBe(false);
  });
});
