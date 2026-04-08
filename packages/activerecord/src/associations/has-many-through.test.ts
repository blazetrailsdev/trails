/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect } from "vitest";
import { Base, registerModel } from "../index.js";
import { Associations, loadHasManyThrough } from "../associations.js";

import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

// ==========================================================================
// HasManyThroughTest — targets has_many_through_associations_test.rb
// ==========================================================================
describe("HasManyThroughTest", () => {
  function makeModels() {
    const adapter = freshAdapter();
    class HmtTag extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class HmtTagging extends Base {
      static {
        this.attribute("post_id", "integer");
        this.attribute("tag_id", "integer");
        this.adapter = adapter;
      }
    }
    class HmtPost extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    Associations.hasMany.call(HmtPost, "hmtTaggings", {
      className: "HmtTagging",
      foreignKey: "post_id",
    });

    Associations.hasMany.call(HmtPost, "hmtTags", {
      through: "hmtTaggings",
      className: "HmtTag",
      source: "tag",
    });
    registerModel("HmtTag", HmtTag);
    registerModel("HmtTagging", HmtTagging);
    registerModel("HmtPost", HmtPost);
    return { Tag: HmtTag, Tagging: HmtTagging, Post: HmtPost, adapter };
  }

  it("get ids", async () => {
    const { Tag, Tagging, Post } = makeModels();
    const post = await Post.create({ title: "Post" });
    const t1 = await Tag.create({ name: "a" });
    const t2 = await Tag.create({ name: "b" });
    await Tagging.create({ post_id: post.id, tag_id: t1.id });
    await Tagging.create({ post_id: post.id, tag_id: t2.id });
    const tags = await loadHasManyThrough(post, "hmtTags", {
      through: "hmtTaggings",
      className: "HmtTag",
      source: "tag",
    });
    const ids = tags.map((t) => t.id);
    expect(ids).toContain(t1.id);
    expect(ids).toContain(t2.id);
  });
});

describe("Associations: has_many through", () => {
  it("loads through a join model", async () => {
    const adapter = freshAdapter();

    class Tag extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    class Tagging extends Base {
      static {
        this.attribute("post_id", "integer");
        this.attribute("tag_id", "integer");
        this.adapter = adapter;
      }
    }

    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    Associations.hasMany.call(Post, "taggings", { className: "Tagging" });

    Associations.hasMany.call(Post, "tags", {
      through: "taggings",
      className: "Tag",
      source: "tag",
    });

    registerModel(Post);
    registerModel(Tagging);
    registerModel(Tag);

    const post = await Post.create({ title: "Hello" });
    const tag1 = await Tag.create({ name: "ruby" });
    const tag2 = await Tag.create({ name: "rails" });
    await Tagging.create({ post_id: post.id, tag_id: tag1.id });
    await Tagging.create({ post_id: post.id, tag_id: tag2.id });

    const tags = await loadHasManyThrough(post, "tags", {
      through: "taggings",
      className: "Tag",
      source: "tag",
    });
    expect(tags).toHaveLength(2);
    const names = tags.map((t) => t.name);
    expect(names).toContain("ruby");
    expect(names).toContain("rails");
  });
});
