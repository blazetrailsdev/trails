import { describe, it, expect, beforeAll } from "vitest";
import { Base, registerModel } from "../index.js";
import { Associations, loadBelongsTo } from "../associations.js";
import { defineSchema } from "../test-helpers/define-schema.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";

describe("BidirectionalDestroyDependenciesTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema({
      contents: { title: "string" },
      content_positions: { content_id: "integer", position: "integer" },
    });
  });

  function makeModels() {
    class Content extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    class ContentPosition extends Base {
      static {
        this.attribute("content_id", "integer");
        this.attribute("position", "integer");
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
    const contentPosition = await ContentPosition.create({ content_id: content.id, position: 1 });

    const loadedContent = await loadBelongsTo(contentPosition, "content", {
      className: "Content",
      foreignKey: "content_id",
    });
    expect(loadedContent).not.toBeNull();

    await contentPosition.destroy();

    expect(await ContentPosition.count()).toBe(0);
    expect(await Content.count()).toBe(0);
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
    await ContentPosition.create({ content_id: content.id, position: 1 });

    // First destroy attempt on content
    await content.destroy();
    expect(content.isDestroyed()).toBe(true);
    // Both should be gone
    expect(await Content.count()).toBe(0);
    expect(await ContentPosition.count()).toBe(0);
  });
});
