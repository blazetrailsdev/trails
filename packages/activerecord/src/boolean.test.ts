/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Base } from "./index.js";
import { Topic } from "./test-helpers/models/topic.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";
import { useFixtures } from "./test-helpers/use-fixtures.js";
import { TEST_SCHEMA } from "./test-helpers/test-schema.js";

setupHandlerSuite();
useHandlerTransactionalFixtures();
beforeAll(async () => {
  await defineSchema({ topics: TEST_SCHEMA.topics });
  await Topic.loadSchema();
});

const { topics } = useFixtures(
  {
    topics: [
      Topic,
      {
        approved_topic: { title: "Approved", approved: true },
        unapproved_topic: { title: "Unapproved", approved: false },
      },
    ],
  },
  () => Base.connection,
);

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
    const results = await Topic.where({ approved: true }).toArray();
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(topics("approved_topic").id);
  });

  it("find by falsy boolean symbol", async () => {
    const results = await Topic.where({ approved: false }).toArray();
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(topics("unapproved_topic").id);
  });
});
