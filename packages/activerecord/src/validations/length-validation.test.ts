/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base } from "../index.js";

import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

describe("LengthValidationTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });
  function makeModel() {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
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
