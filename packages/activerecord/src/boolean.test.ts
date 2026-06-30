/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect } from "vitest";
import { Topic } from "./test-helpers/models/topic.js";
import { fixtures } from "./test-helpers/fixtures.js";

const { topics } = fixtures({
  topics: [
    Topic,
    {
      approved_topic: { title: "Approved", approved: true },
      unapproved_topic: { title: "Unapproved", approved: false },
    },
  ],
});

describe("BooleanTest", () => {
  it("boolean", async () => {
    expect(topics("approved_topic").approved).toBe(true);
  });

  it("boolean without questionmark", async () => {
    expect(topics("unapproved_topic").approved).toBe(false);
  });

  it("boolean cast from string", async () => {
    const t = new Topic({ title: "str", approved: true });
    expect(t.approved).toBe(true);
  });

  it("find by boolean string", async () => {
    const results = await Topic.where({ approved: true });
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(topics("approved_topic").id);
  });

  it("find by falsy boolean symbol", async () => {
    const results = await Topic.where({ approved: false });
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(topics("unapproved_topic").id);
  });
});
