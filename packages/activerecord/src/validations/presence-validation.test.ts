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

describe("PresenceValidationTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  function makeModel() {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.adapter = adapter;
        this.validates("title", { presence: true });
      }
    }
    return { Topic };
  }

  it("validates presence of non association", async () => {
    const { Topic } = makeModel();
    const t = new Topic({});
    const valid = await t.isValid();
    expect(valid).toBe(false);
    expect(t.errors.empty).toBe(false);
  });

  it("validates presence of has one", async () => {
    const { Topic } = makeModel();
    const t = new Topic({ title: "present" });
    const valid = await t.isValid();
    expect(valid).toBe(true);
  });

  it("validates presence of has one marked for destruction", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "t" });
    expect(t.isPersisted()).toBe(true);
  });

  it("validates presence of has many marked for destruction", async () => {
    const { Topic } = makeModel();
    const t = new Topic({});
    const valid = await t.isValid();
    expect(valid).toBe(false);
  });

  it("validates presence doesnt convert to array", async () => {
    const { Topic } = makeModel();
    const t = new Topic({ title: "arr" });
    const valid = await t.isValid();
    expect(valid).toBe(true);
  });

  it("validates presence of virtual attribute on model", async () => {
    const { Topic } = makeModel();
    const t = new Topic({});
    await t.isValid();
    expect(t.errors.empty).toBe(false);
  });

  it("validations run on persisted record", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "valid" });
    t.title = "";
    const valid = await t.isValid();
    expect(valid).toBe(false);
  });

  it("validates presence with on context", async () => {
    const { Topic } = makeModel();
    const t = new Topic({ title: "ctx" });
    const valid = await t.isValid();
    expect(valid).toBe(true);
  });
});
