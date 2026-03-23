import { describe, it, expect } from "vitest";
import { Base, serialize } from "../index.js";
import { createTestAdapter } from "../test-adapter.js";

describe("JSONTest", () => {
  it("returns nil if empty string given", async () => {
    const adapter = createTestAdapter();
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
    const adapter = createTestAdapter();
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
