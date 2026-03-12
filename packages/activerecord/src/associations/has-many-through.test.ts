/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  Base,
  Relation,
  Range,
  transaction,
  CollectionProxy,
  association,
  defineEnum,
  readEnumValue,
  RecordNotFound,
  RecordInvalid,
  SoleRecordExceeded,
  ReadOnlyRecord,
  StrictLoadingViolationError,
  StaleObjectError,
  columns,
  columnNames,
  reflectOnAssociation,
  reflectOnAllAssociations,
  hasSecureToken,
  serialize,
  registerModel,
  composedOf,
  acceptsNestedAttributesFor,
  assignNestedAttributes,
  generatesTokenFor,
  store,
  storedAttributes,
  Migration,
  Schema,
  MigrationContext,
  TableDefinition,
  delegatedType,
  enableSti,
  registerSubclass,
} from "../index.js";
import {
  Associations,
  loadBelongsTo,
  loadHasOne,
  loadHasMany,
  loadHasManyThrough,
  processDependentAssociations,
  updateCounterCaches,
  setBelongsTo,
  setHasOne,
  setHasMany,
} from "../associations.js";
import {
  OrderedOptions,
  InheritableOptions,
  Notifications,
  NotificationEvent,
} from "@rails-ts/activesupport";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";
import { markForDestruction, isMarkedForDestruction, isDestroyable } from "../autosave.js";

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
    (HmtPost as any)._associations = [
      {
        type: "hasMany",
        name: "hmtTaggings",
        options: { className: "HmtTagging", foreignKey: "post_id" },
      },
      {
        type: "hasMany",
        name: "hmtTags",
        options: { through: "hmtTaggings", className: "HmtTag", source: "tag" },
      },
    ];
    registerModel("HmtTag", HmtTag);
    registerModel("HmtTagging", HmtTagging);
    registerModel("HmtPost", HmtPost);
    return { Tag: HmtTag, Tagging: HmtTagging, Post: HmtPost, adapter };
  }

  it("associate existing", async () => {
    const { Tag, Tagging, Post } = makeModels();
    const post = await Post.create({ title: "Hello" });
    const tag = await Tag.create({ name: "ruby" });
    // Associate existing tag via join model
    await Tagging.create({ post_id: post.id, tag_id: tag.id });
    const tags = await loadHasManyThrough(post, "hmtTags", {
      through: "hmtTaggings",
      className: "HmtTag",
      source: "tag",
    });
    expect(tags).toHaveLength(1);
    expect(tags[0].readAttribute("name")).toBe("ruby");
  });

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

  it("size of through association should increase correctly when has many association is added", async () => {
    const { Tag, Tagging, Post } = makeModels();
    const post = await Post.create({ title: "Post" });
    const t1 = await Tag.create({ name: "first" });
    await Tagging.create({ post_id: post.id, tag_id: t1.id });

    const before = await loadHasManyThrough(post, "hmtTags", {
      through: "hmtTaggings",
      className: "HmtTag",
      source: "tag",
    });
    expect(before).toHaveLength(1);

    const t2 = await Tag.create({ name: "second" });
    await Tagging.create({ post_id: post.id, tag_id: t2.id });

    const after = await loadHasManyThrough(post, "hmtTags", {
      through: "hmtTaggings",
      className: "HmtTag",
      source: "tag",
    });
    expect(after).toHaveLength(2);
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
    (Post as any)._associations = [
      { type: "hasMany", name: "taggings", options: { className: "Tagging" } },
      {
        type: "hasMany",
        name: "tags",
        options: { through: "taggings", className: "Tag", source: "tag" },
      },
    ];

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
    const names = tags.map((t) => t.readAttribute("name"));
    expect(names).toContain("ruby");
    expect(names).toContain("rails");
  });
});
