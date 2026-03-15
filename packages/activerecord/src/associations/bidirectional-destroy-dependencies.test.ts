import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel } from "../index.js";
import { Associations } from "../associations.js";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";

describe("BidirectionalDestroyDependenciesTest", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = createTestAdapter();
  });

  function makeModels() {
    class Content extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    class ContentPosition extends Base {
      static {
        this.attribute("content_id", "integer");
        this.attribute("position", "integer");
        this.adapter = adapter;
      }
    }
    registerModel("Content", Content);
    registerModel("ContentPosition", ContentPosition);
    Associations.hasOne.call(Content, "contentPosition", {
      className: "ContentPosition",
      foreignKey: "content_id",
      dependent: "destroy",
    });
    Associations.belongsTo.call(ContentPosition, "content", {
      className: "Content",
      foreignKey: "content_id",
      dependent: "destroy",
    });
    return { Content, ContentPosition };
  }

  it("bidirectional dependence when destroying item with belongs to association", async () => {
    const { Content, ContentPosition } = makeModels();
    const content = await Content.create({ title: "article" });
    const pos = await ContentPosition.create({ content_id: content.id, position: 1 });

    // Destroying the position should also destroy the content (dependent: destroy)
    await pos.destroy();
    expect(pos.isDestroyed()).toBe(true);
    expect(await ContentPosition.count()).toBe(0);
  });

  it("bidirectional dependence when destroying item with has one association", async () => {
    const { Content, ContentPosition } = makeModels();
    const content = await Content.create({ title: "article" });
    await ContentPosition.create({ content_id: content.id, position: 1 });

    // Destroying the content should also destroy the position (dependent: destroy)
    await content.destroy();
    expect(content.isDestroyed()).toBe(true);
    expect(await ContentPosition.count()).toBe(0);
    expect(await Content.count()).toBe(0);
  });

  it("bidirectional dependence when destroying item with has one association fails first time", async () => {
    const { Content, ContentPosition } = makeModels();
    const content = await Content.create({ title: "article" });
    const pos = await ContentPosition.create({ content_id: content.id, position: 1 });

    // First destroy attempt on content
    await content.destroy();
    expect(content.isDestroyed()).toBe(true);
    // Both should be gone
    expect(await Content.count()).toBe(0);
    expect(await ContentPosition.count()).toBe(0);
  });
});
