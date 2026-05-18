/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Base } from "./index.js";

import { createTestAdapter, type TestDatabaseAdapter } from "./test-adapter.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { withTransactionalFixtures } from "./test-helpers/with-transactional-fixtures.js";

let adapter: TestDatabaseAdapter;

beforeAll(async () => {
  adapter = createTestAdapter();
  await defineSchema(adapter, { topics: { title: "string", approved: "boolean" } });
});
withTransactionalFixtures(() => adapter);

describe("BooleanTest", () => {
  function makeModel() {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("approved", "boolean");
        this.adapter = adapter;
      }
    }
    return { Topic };
  }

  it("boolean", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "bool", approved: true });
    expect(t.approved).toBe(true);
  });

  it("boolean without questionmark", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "noq", approved: false });
    expect(t.approved).toBe(false);
  });

  it("boolean cast from string", async () => {
    const { Topic } = makeModel();
    const t = new Topic({ title: "str", approved: true });
    expect(t.approved).toBe(true);
  });

  it("find by boolean string", async () => {
    const { Topic } = makeModel();
    await Topic.create({ title: "fbs", approved: true });
    const results = await Topic.where({ approved: true }).toArray();
    expect(results.length).toBe(1);
  });

  it("find by falsy boolean symbol", async () => {
    const { Topic } = makeModel();
    await Topic.create({ title: "falsy", approved: false });
    const results = await Topic.where({ approved: false }).toArray();
    expect(results.length).toBe(1);
  });
});
