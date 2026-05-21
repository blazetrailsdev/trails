import { describe, it, expect, beforeAll } from "vitest";
import { Base, serialize } from "../index.js";
import { createSidecarTestAdapter, type SidecarAdapter } from "../test-adapter.js";
import { defineSchema } from "../test-helpers/define-schema.js";
import { withTransactionalFixtures } from "../test-helpers/with-transactional-fixtures.js";

let adapter: SidecarAdapter;

beforeAll(async () => {
  ({ adapter } = createSidecarTestAdapter());
  await defineSchema(adapter, { topics: { content: "string" } });
});
withTransactionalFixtures(() => adapter);

describe("JSONTest", () => {
  it("returns nil if empty string given", async () => {
    class Topic extends Base {
      static {
        this.attribute("content", "string");
        this.adapter = adapter;
      }
    }
    serialize(Topic, "content");
    const t = await Topic.create({ content: "" });
    const reloaded = await Topic.find(t.id);
    expect(reloaded.content).toBeNull();
  });

  it("returns nil if nil given", async () => {
    class Topic extends Base {
      static {
        this.attribute("content", "string");
        this.adapter = adapter;
      }
    }
    serialize(Topic, "content");
    const t = await Topic.create({ content: null });
    const reloaded = await Topic.find(t.id);
    expect(reloaded.content).toBeNull();
  });
});
