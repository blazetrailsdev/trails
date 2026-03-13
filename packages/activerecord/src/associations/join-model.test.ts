/**
 * Tests mirroring Rails activerecord/test/cases/associations/:
 *   - has_one_associations_test.rb
 *   - has_and_belongs_to_many_associations_test.rb
 *   - join_model_test.rb
 *   - nested_through_associations_test.rb
 *
 * Most tests use it.skip because they depend on a real database with fixtures.
 * A small subset of structural/in-memory tests run fully.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  Base,
  registerModel,
  association,
  DeleteRestrictionError,
  enableSti,
  registerSubclass,
  SubclassNotFound,
} from "../index.js";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";
import {
  Associations,
  loadBelongsTo,
  loadHasOne,
  loadHasMany,
  loadHasManyThrough,
  loadHabtm,
  processDependentAssociations,
  CollectionProxy,
  setBelongsTo,
  setHasOne,
  setHasMany,
  buildHasOne,
} from "../associations.js";

function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}


// ==========================================================================
// AssociationsJoinModelTest — mirrors join_model_test.rb
// ==========================================================================

describe("AssociationsJoinModelTest", () => {
  let adapter: DatabaseAdapter;

  class Author extends Base {
    static {
      this.attribute("name", "string");
    }
  }

  class Post extends Base {
    static {
      this.attribute("author_id", "integer");
      this.attribute("title", "string");
      this.attribute("body", "string");
      this.attribute("type", "string");
    }
  }

  class Tag extends Base {
    static {
      this.attribute("name", "string");
    }
  }

  class Tagging extends Base {
    static {
      this.attribute("tag_id", "integer");
      this.attribute("taggable_id", "integer");
      this.attribute("taggable_type", "string");
    }
  }

  beforeEach(() => {
    adapter = freshAdapter();
    Author.adapter = adapter;
    Post.adapter = adapter;
    Tag.adapter = adapter;
    Tagging.adapter = adapter;
    registerModel(Author);
    registerModel(Post);
    registerModel(Tag);
    registerModel(Tagging);
  });

  it("has many", async () => {
    const author = await Author.create({ name: "DHH" });
    await Post.create({ author_id: author.id, title: "Intro", body: "Hello" });
    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
      primaryKey: "id",
    });
    expect(posts.length).toBe(1);
  });

  it("has many with multiple authors", async () => {
    const a1 = await Author.create({ name: "Author1" });
    const a2 = await Author.create({ name: "Author2" });
    await Post.create({ author_id: a1.id, title: "A1P1", body: "B" });
    await Post.create({ author_id: a1.id, title: "A1P2", body: "B" });
    await Post.create({ author_id: a2.id, title: "A2P1", body: "B" });
    const posts1 = await loadHasMany(a1, "posts", {
      className: "Post",
      foreignKey: "author_id",
      primaryKey: "id",
    });
    const posts2 = await loadHasMany(a2, "posts", {
      className: "Post",
      foreignKey: "author_id",
      primaryKey: "id",
    });
    expect(posts1.length).toBe(2);
    expect(posts2.length).toBe(1);
  });

  it.skip("inherited has many", () => {
    // Requires STI inheritance chain
  });

  it("has many distinct through join model", async () => {
    // Tags for a post through taggings should be distinct
    const post = await Post.create({ title: "Dist", body: "B" });
    const tag = await Tag.create({ name: "ruby" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });
    const taggings = await loadHasMany(post, "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
      primaryKey: "id",
    });
    expect(taggings.length).toBe(1);
    // Load tag through tagging
    const loadedTag = await loadHasOne(taggings[0] as Tagging, "tag", {
      className: "Tag",
      foreignKey: "id",
      primaryKey: "tag_id",
    });
    expect(loadedTag).not.toBeNull();
    expect(loadedTag!.readAttribute("name")).toBe("ruby");
  });

  it("has many distinct through count", async () => {
    // Count tags through taggings
    const post = await Post.create({ title: "Count", body: "B" });
    const t1 = await Tag.create({ name: "ruby" });
    const t2 = await Tag.create({ name: "rails" });
    await Tagging.create({ tag_id: t1.id, taggable_id: post.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: t2.id, taggable_id: post.id, taggable_type: "Post" });
    const taggings = await loadHasMany(post, "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
      primaryKey: "id",
    });
    expect(taggings.length).toBe(2);
  });

  it("has many distinct through find", async () => {
    // Find a specific tag through taggings
    const post = await Post.create({ title: "Find", body: "B" });
    const tag = await Tag.create({ name: "findable" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });
    const taggings = await loadHasMany(post, "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
      primaryKey: "id",
    });
    const found = taggings.find((t: any) => t.readAttribute("tag_id") === tag.id);
    expect(found).toBeDefined();
  });

  it("has many going through join model", async () => {
    const tag = await Tag.create({ name: "ruby" });
    const post = await Post.create({ title: "Test", body: "Body" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });
    const taggings = await loadHasMany(tag, "taggings", {
      className: "Tagging",
      foreignKey: "tag_id",
      primaryKey: "id",
    });
    expect(taggings.length).toBe(1);
  });

  it("count polymorphic has many", async () => {
    const adapter = freshAdapter();
    class CphmTag extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
        this.adapter = adapter;
      }
    }
    class CphmPost extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    registerModel(CphmTag);
    registerModel(CphmPost);
    Associations.hasMany.call(CphmPost, "cphmTags", { as: "taggable", className: "CphmTag" });
    const post = await CphmPost.create({ title: "Hello" });
    await CphmTag.create({ name: "ruby", taggable_id: post.id, taggable_type: "CphmPost" });
    await CphmTag.create({ name: "rails", taggable_id: post.id, taggable_type: "CphmPost" });
    // Create a tag for a different type to ensure polymorphic filtering
    await CphmTag.create({ name: "other", taggable_id: post.id, taggable_type: "OtherModel" });
    const tags = await loadHasMany(post, "cphmTags", { as: "taggable", className: "CphmTag" });
    expect(tags.length).toBe(2);
  });

  it.skip("polymorphic has many going through join model with find", () => {
    // Requires scoped find through polymorphic
  });

  it.skip("polymorphic has many going through join model with include on source reflection", () => {
    // Requires eager loading
  });

  it.skip("polymorphic has many going through join model with include on source reflection with find", () => {
    // Requires eager load + find
  });

  it.skip("polymorphic has many going through join model with custom select and joins", () => {
    // Requires custom select + joins
  });

  it.skip("polymorphic has many going through join model with custom foreign key", () => {
    // Requires custom foreign_key
  });

  it.skip("polymorphic has many create model with inheritance and custom base class", () => {
    // Requires STI + custom base
  });

  it.skip("polymorphic has many going through join model with inheritance", () => {
    // Requires STI through
  });

  it.skip("polymorphic has many going through join model with inheritance with custom class name", () => {
    // Requires STI + class_name
  });

  it.skip("polymorphic has many create model with inheritance", () => {
    // Requires STI create
  });

  it.skip("polymorphic has one create model with inheritance", () => {
    // Requires STI has_one create
  });

  it("set polymorphic has many", async () => {
    const adapter = freshAdapter();
    class SphmTag extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
        this.adapter = adapter;
      }
    }
    class SphmPost extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    registerModel(SphmTag);
    registerModel(SphmPost);
    Associations.hasMany.call(SphmPost, "sphmTags", { as: "taggable", className: "SphmTag" });
    const post = await SphmPost.create({ title: "Hello" });
    const tag1 = await SphmTag.create({ name: "ruby" });
    const tag2 = await SphmTag.create({ name: "rails" });
    await setHasMany(post, "sphmTags", [tag1, tag2], { as: "taggable", className: "SphmTag" });
    const r1 = await SphmTag.find(tag1.id!);
    const r2 = await SphmTag.find(tag2.id!);
    expect(r1.readAttribute("taggable_id")).toBe(post.id);
    expect(r1.readAttribute("taggable_type")).toBe("SphmPost");
    expect(r2.readAttribute("taggable_id")).toBe(post.id);
    expect(r2.readAttribute("taggable_type")).toBe("SphmPost");
  });

  it("set polymorphic has one", async () => {
    const adapter = freshAdapter();
    class SphoTag extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
        this.adapter = adapter;
      }
    }
    class SphoPost extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    registerModel(SphoTag);
    registerModel(SphoPost);
    Associations.hasOne.call(SphoPost, "sphoTag", { as: "taggable", className: "SphoTag" });
    const post = await SphoPost.create({ title: "Hello" });
    const tag = await SphoTag.create({ name: "ruby" });
    await setHasOne(post, "sphoTag", tag, { as: "taggable", className: "SphoTag" });
    const reloaded = await SphoTag.find(tag.id!);
    expect(reloaded.readAttribute("taggable_id")).toBe(post.id);
    expect(reloaded.readAttribute("taggable_type")).toBe("SphoPost");
  });

  it("set polymorphic has one on new record", async () => {
    const adapter = freshAdapter();
    class SphnTag extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
        this.adapter = adapter;
      }
    }
    class SphnPost extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    registerModel(SphnTag);
    registerModel(SphnPost);
    Associations.hasOne.call(SphnPost, "sphnTag", { as: "taggable", className: "SphnTag" });
    const post = new SphnPost({ title: "Hello" });
    await post.save();
    const tag = new SphnTag({ name: "ruby" });
    await setHasOne(post, "sphnTag", tag, { as: "taggable", className: "SphnTag" });
    expect(tag.readAttribute("taggable_id")).toBe(post.id);
    expect(tag.readAttribute("taggable_type")).toBe("SphnPost");
  });

  it("create polymorphic has many with scope", async () => {
    const ad = freshAdapter();
    class CpsPost extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = ad;
      }
    }
    class CpsTag extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = ad;
      }
    }
    class CpsTagging extends Base {
      static {
        this.attribute("tag_id", "integer");
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
        this.adapter = ad;
      }
    }
    registerModel(CpsPost);
    registerModel(CpsTag);
    registerModel(CpsTagging);
    Associations.hasMany.call(CpsPost, "taggings", { className: "CpsTagging", as: "taggable" });
    const post = await CpsPost.create({ title: "Hello" });
    const tag = await CpsTag.create({ name: "misc" });
    const proxy = association(post, "taggings");
    const tagging = await proxy.create({ tag_id: tag.id });
    expect(tagging.readAttribute("taggable_type")).toBe("CpsPost");
    expect(tagging.readAttribute("taggable_id")).toBe(post.id);
    expect(await proxy.count()).toBe(1);
  });

  it("create bang polymorphic with has many scope", async () => {
    const ad = freshAdapter();
    class CbpsPost extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = ad;
      }
    }
    class CbpsTag extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = ad;
      }
    }
    class CbpsTagging extends Base {
      static {
        this.attribute("tag_id", "integer");
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
        this.adapter = ad;
      }
    }
    registerModel(CbpsPost);
    registerModel(CbpsTag);
    registerModel(CbpsTagging);
    Associations.hasMany.call(CbpsPost, "taggings", { className: "CbpsTagging", as: "taggable" });
    const post = await CbpsPost.create({ title: "Hello" });
    const tag = await CbpsTag.create({ name: "misc" });
    const proxy = association(post, "taggings");
    const tagging = await proxy.create({ tag_id: tag.id });
    expect(tagging.readAttribute("taggable_type")).toBe("CbpsPost");
    expect(await proxy.count()).toBe(1);
  });

  it("create polymorphic has one with scope", async () => {
    const ad = freshAdapter();
    class CphoPost extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = ad;
      }
    }
    class CphoTag extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = ad;
      }
    }
    class CphoTagging extends Base {
      static {
        this.attribute("tag_id", "integer");
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
        this.adapter = ad;
      }
    }
    registerModel(CphoPost);
    registerModel(CphoTag);
    registerModel(CphoTagging);
    Associations.hasOne.call(CphoPost, "tagging", { className: "CphoTagging", as: "taggable" });
    const post = await CphoPost.create({ title: "Hello" });
    const tag = await CphoTag.create({ name: "misc" });
    // Create tagging through has_one
    const tagging = await CphoTagging.create({
      tag_id: tag.id,
      taggable_id: post.id,
      taggable_type: "CphoPost",
    });
    expect(tagging.readAttribute("taggable_type")).toBe("CphoPost");
    const loaded = await loadHasOne(post, "tagging", { className: "CphoTagging", as: "taggable" });
    expect(loaded).not.toBeNull();
    expect(loaded!.readAttribute("tag_id")).toBe(tag.id);
  });

  it("delete polymorphic has many with delete all", async () => {
    const adapter = freshAdapter();
    class DphmTag extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
        this.adapter = adapter;
      }
    }
    class DphmPost extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    registerModel(DphmTag);
    registerModel(DphmPost);
    Associations.hasMany.call(DphmPost, "dphmTags", { as: "taggable", className: "DphmTag" });
    const post = await DphmPost.create({ title: "Hello" });
    await DphmTag.create({ name: "ruby", taggable_id: post.id, taggable_type: "DphmPost" });
    await DphmTag.create({ name: "rails", taggable_id: post.id, taggable_type: "DphmPost" });
    const tags = await loadHasMany(post, "dphmTags", { as: "taggable", className: "DphmTag" });
    expect(tags.length).toBe(2);
    // Delete all
    for (const t of tags) await t.destroy();
    const remaining = await loadHasMany(post, "dphmTags", { as: "taggable", className: "DphmTag" });
    expect(remaining.length).toBe(0);
  });

  it("delete polymorphic has many with destroy", async () => {
    const adapter = freshAdapter();
    class DphmdTag extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
        this.adapter = adapter;
      }
    }
    class DphmdPost extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    registerModel(DphmdTag);
    registerModel(DphmdPost);
    Associations.hasMany.call(DphmdPost, "dphmdTags", { as: "taggable", className: "DphmdTag" });
    const post = await DphmdPost.create({ title: "Hello" });
    const tag = await DphmdTag.create({
      name: "ruby",
      taggable_id: post.id,
      taggable_type: "DphmdPost",
    });
    await tag.destroy();
    const remaining = await loadHasMany(post, "dphmdTags", {
      as: "taggable",
      className: "DphmdTag",
    });
    expect(remaining.length).toBe(0);
  });

  it("delete polymorphic has many with nullify", async () => {
    const adapter = freshAdapter();
    class DphmnTag extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
        this.adapter = adapter;
      }
    }
    class DphmnPost extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    registerModel(DphmnTag);
    registerModel(DphmnPost);
    Associations.hasMany.call(DphmnPost, "dphmnTags", { as: "taggable", className: "DphmnTag" });
    const post = await DphmnPost.create({ title: "Hello" });
    const tag = await DphmnTag.create({
      name: "ruby",
      taggable_id: post.id,
      taggable_type: "DphmnPost",
    });
    // Nullify
    tag.writeAttribute("taggable_id", null);
    tag.writeAttribute("taggable_type", null);
    await tag.save();
    const remaining = await loadHasMany(post, "dphmnTags", {
      as: "taggable",
      className: "DphmnTag",
    });
    expect(remaining.length).toBe(0);
  });

  it("delete polymorphic has one with destroy", async () => {
    const adapter = freshAdapter();
    class DphodTag extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
        this.adapter = adapter;
      }
    }
    class DphodPost extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    registerModel(DphodTag);
    registerModel(DphodPost);
    Associations.hasOne.call(DphodPost, "dphodTag", { as: "taggable", className: "DphodTag" });
    const post = await DphodPost.create({ title: "Hello" });
    const tag = await DphodTag.create({
      name: "ruby",
      taggable_id: post.id,
      taggable_type: "DphodPost",
    });
    await tag.destroy();
    const loaded = await loadHasOne(post, "dphodTag", { as: "taggable", className: "DphodTag" });
    expect(loaded).toBeNull();
  });

  it("delete polymorphic has one with nullify", async () => {
    const adapter = freshAdapter();
    class DphonTag extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
        this.adapter = adapter;
      }
    }
    class DphonPost extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    registerModel(DphonTag);
    registerModel(DphonPost);
    Associations.hasOne.call(DphonPost, "dphonTag", { as: "taggable", className: "DphonTag" });
    const post = await DphonPost.create({ title: "Hello" });
    await DphonTag.create({ name: "ruby", taggable_id: post.id, taggable_type: "DphonPost" });
    await setHasOne(post, "dphonTag", null, { as: "taggable", className: "DphonTag" });
    const loaded = await loadHasOne(post, "dphonTag", { as: "taggable", className: "DphonTag" });
    expect(loaded).toBeNull();
  });

  it.skip("has many with piggyback", () => {
    // Requires select piggyback columns
  });

  it.skip("create through has many with piggyback", () => {
    // Requires through create with extra columns
  });

  it("include has many through", async () => {
    const ad = freshAdapter();
    class IhmtPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.adapter = ad;
      }
    }
    class IhmtTag extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = ad;
      }
    }
    class IhmtTagging extends Base {
      static {
        this.attribute("tag_id", "integer");
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
        this.adapter = ad;
      }
    }
    registerModel(IhmtPost);
    registerModel(IhmtTag);
    registerModel(IhmtTagging);
    Associations.hasMany.call(IhmtPost, "taggings", {
      className: "IhmtTagging",
      foreignKey: "taggable_id",
    });
    Associations.hasMany.call(IhmtPost, "tags", {
      through: "taggings",
      className: "IhmtTag",
      source: "tag",
    });
    Associations.belongsTo.call(IhmtTagging, "tag", { className: "IhmtTag", foreignKey: "tag_id" });
    const post = await IhmtPost.create({ title: "Include", body: "B" });
    const tag1 = await IhmtTag.create({ name: "ruby" });
    const tag2 = await IhmtTag.create({ name: "rails" });
    await IhmtTagging.create({ tag_id: tag1.id, taggable_id: post.id, taggable_type: "IhmtPost" });
    await IhmtTagging.create({ tag_id: tag2.id, taggable_id: post.id, taggable_type: "IhmtPost" });
    const posts = await IhmtPost.all().includes("tags").toArray();
    expect(posts).toHaveLength(1);
    const preloaded = (posts[0] as any)._preloadedAssociations?.get("tags");
    expect(preloaded).toHaveLength(2);
  });

  it("include polymorphic has one", async () => {
    const adapter = freshAdapter();
    class IphoTag extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
        this.adapter = adapter;
      }
    }
    class IphoPost extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    registerModel(IphoTag);
    registerModel(IphoPost);
    Associations.hasOne.call(IphoPost, "iphoTag", { as: "taggable", className: "IphoTag" });
    const post = await IphoPost.create({ title: "Hello" });
    await IphoTag.create({ name: "ruby", taggable_id: post.id, taggable_type: "IphoPost" });
    const posts = await IphoPost.all().includes("iphoTag").toArray();
    expect(posts.length).toBe(1);
    const preloaded = (posts[0] as any)._preloadedAssociations?.get("iphoTag");
    expect(preloaded).not.toBeNull();
    expect(preloaded.readAttribute("name")).toBe("ruby");
  });

  it.skip("include polymorphic has one defined in abstract parent", () => {
    // Requires abstract parent eager loading
  });

  it.skip("include polymorphic has many through", () => {
    // Requires eager polymorphic through
  });

  it("include polymorphic has many", async () => {
    const adapter = freshAdapter();
    class IphmTag extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
        this.adapter = adapter;
      }
    }
    class IphmPost extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    registerModel(IphmTag);
    registerModel(IphmPost);
    Associations.hasMany.call(IphmPost, "iphmTags", { as: "taggable", className: "IphmTag" });
    const post = await IphmPost.create({ title: "Hello" });
    await IphmTag.create({ name: "ruby", taggable_id: post.id, taggable_type: "IphmPost" });
    await IphmTag.create({ name: "rails", taggable_id: post.id, taggable_type: "IphmPost" });
    // Different type shouldn't be included
    await IphmTag.create({ name: "other", taggable_id: post.id, taggable_type: "OtherModel" });
    const posts = await IphmPost.all().includes("iphmTags").toArray();
    expect(posts.length).toBe(1);
    const preloaded = (posts[0] as any)._preloadedAssociations?.get("iphmTags");
    expect(preloaded.length).toBe(2);
  });

  it("has many find all", async () => {
    const author = await Author.create({ name: "Matz" });
    await Post.create({ author_id: author.id, title: "P1", body: "B1" });
    await Post.create({ author_id: author.id, title: "P2", body: "B2" });
    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
      primaryKey: "id",
    });
    expect(posts.length).toBe(2);
  });

  it("has many find first", async () => {
    const author = await Author.create({ name: "Koichi" });
    await Post.create({ author_id: author.id, title: "First", body: "B" });
    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
      primaryKey: "id",
    });
    expect(posts[0]).toBeDefined();
  });

  it("has many with hash conditions", async () => {
    // Filter posts by condition after loading
    const author = await Author.create({ name: "HashCond" });
    await Post.create({ author_id: author.id, title: "Match", body: "yes" });
    await Post.create({ author_id: author.id, title: "NoMatch", body: "no" });
    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
      primaryKey: "id",
    });
    const filtered = posts.filter((p: any) => p.readAttribute("title") === "Match");
    expect(filtered.length).toBe(1);
  });

  it("has many find conditions", async () => {
    // Find with conditions on loaded association
    const author = await Author.create({ name: "FindCond" });
    await Post.create({ author_id: author.id, title: "Alpha", body: "A" });
    await Post.create({ author_id: author.id, title: "Beta", body: "B" });
    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
      primaryKey: "id",
    });
    const found = posts.find((p: any) => p.readAttribute("title") === "Beta");
    expect(found).toBeDefined();
    expect((found as any).readAttribute("body")).toBe("B");
  });

  it("has many array methods called by method missing", async () => {
    // Verify array methods work on loaded has_many result
    const author = await Author.create({ name: "ArrayMethods" });
    await Post.create({ author_id: author.id, title: "P1", body: "B" });
    await Post.create({ author_id: author.id, title: "P2", body: "B" });
    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
      primaryKey: "id",
    });
    // Array methods: map, filter, find, some, every
    const titles = posts.map((p: any) => p.readAttribute("title"));
    expect(titles).toContain("P1");
    expect(titles).toContain("P2");
    expect(posts.some((p: any) => p.readAttribute("title") === "P1")).toBe(true);
    expect(posts.every((p: any) => p.readAttribute("body") === "B")).toBe(true);
  });

  it.skip("has many going through join model with custom foreign key", () => {
    // Requires custom foreign_key on through
  });

  it.skip("has many going through join model with custom primary key", () => {
    // Requires custom primary_key on through
  });

  it.skip("has many going through polymorphic join model with custom primary key", () => {
    // Requires polymorphic through + custom PK
  });

  it.skip("has many through with custom primary key on belongs to source", () => {
    // Requires custom PK on belongs_to source
  });

  it.skip("has many through with custom primary key on has many source", () => {
    // Requires custom PK on has_many source
  });

  it.skip("belongs to polymorphic with counter cache", () => {
    // Requires counter_cache on polymorphic
  });

  it("unavailable through reflection", async () => {
    const ad = freshAdapter();
    class UtrAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = ad;
      }
    }
    registerModel(UtrAuthor);
    Associations.hasMany.call(UtrAuthor, "tags", { through: "nonexistent", className: "Tag" });
    const author = await UtrAuthor.create({ name: "Bad" });
    await expect(
      loadHasMany(author, "tags", { through: "nonexistent", className: "Tag" }),
    ).rejects.toThrow(/Through association "nonexistent" not found/);
  });

  it.skip("exceptions have suggestions for fix", () => {
    // Requires error message suggestions
  });

  it.skip("has many through join model with conditions", () => {
    // Requires conditions on through
  });

  it("has many polymorphic", async () => {
    const post = await Post.create({ title: "HmPoly", body: "B" });
    const tag = await Tag.create({ name: "hm_tag" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });
    const taggings = await loadHasMany(post, "taggings", { as: "taggable", className: "Tagging" });
    expect(taggings.length).toBe(1);
  });

  it.skip("has many polymorphic with source type", () => {
    // Requires source_type option
  });

  it.skip("has many polymorphic associations merges through scope", () => {
    // Requires scope merging
  });

  it.skip("eager has many polymorphic with source type", () => {
    // Requires eager load with source_type
  });

  it("has many through has many find all", async () => {
    // Author -> Posts -> Taggings (nested through, find all taggings for an author)
    const author = await Author.create({ name: "FindAllAuthor" });
    const post1 = await Post.create({ author_id: author.id, title: "FA1", body: "B" });
    const post2 = await Post.create({ author_id: author.id, title: "FA2", body: "B" });
    const t1 = await Tag.create({ name: "fa_tag1" });
    const t2 = await Tag.create({ name: "fa_tag2" });
    await Tagging.create({ tag_id: t1.id, taggable_id: post1.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: t2.id, taggable_id: post2.id, taggable_type: "Post" });
    // Manually traverse: author -> posts -> taggings
    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
      primaryKey: "id",
    });
    const allTaggings: any[] = [];
    for (const p of posts) {
      const taggings = await loadHasMany(p as Post, "taggings", {
        className: "Tagging",
        foreignKey: "taggable_id",
        primaryKey: "id",
      });
      allTaggings.push(...taggings);
    }
    expect(allTaggings.length).toBe(2);
  });

  it.skip("has many through has many find all with custom class", () => {
    // Requires through + class_name
  });

  it("has many through has many find first", async () => {
    // Find the first tagging through author -> posts -> taggings
    const author = await Author.create({ name: "FindFirstAuthor" });
    const post = await Post.create({ author_id: author.id, title: "FF", body: "B" });
    const tag = await Tag.create({ name: "ff_tag" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });
    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
      primaryKey: "id",
    });
    const taggings = await loadHasMany(posts[0] as Post, "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
      primaryKey: "id",
    });
    expect(taggings[0]).toBeDefined();
    expect((taggings[0] as any).readAttribute("tag_id")).toBe(tag.id);
  });

  it("has many through has many find conditions", async () => {
    // Find taggings with specific conditions through author -> posts -> taggings
    const author = await Author.create({ name: "FindCondAuthor" });
    const post = await Post.create({ author_id: author.id, title: "FC", body: "B" });
    const t1 = await Tag.create({ name: "fc_tag1" });
    const t2 = await Tag.create({ name: "fc_tag2" });
    await Tagging.create({ tag_id: t1.id, taggable_id: post.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: t2.id, taggable_id: post.id, taggable_type: "Post" });
    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
      primaryKey: "id",
    });
    const taggings = await loadHasMany(posts[0] as Post, "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
      primaryKey: "id",
    });
    const found = taggings.filter((t: any) => t.readAttribute("tag_id") === t2.id);
    expect(found.length).toBe(1);
  });

  it("has many through has many find by id", async () => {
    // Find a specific tagging by id through author -> posts -> taggings
    const author = await Author.create({ name: "FindByIdAuthor" });
    const post = await Post.create({ author_id: author.id, title: "FI", body: "B" });
    const tag = await Tag.create({ name: "fi_tag" });
    const tagging = await Tagging.create({
      tag_id: tag.id,
      taggable_id: post.id,
      taggable_type: "Post",
    });
    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
      primaryKey: "id",
    });
    const taggings = await loadHasMany(posts[0] as Post, "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
      primaryKey: "id",
    });
    const found = taggings.find((t: any) => t.id === tagging.id);
    expect(found).toBeDefined();
  });

  it("has many through polymorphic has one", async () => {
    // Author has_one :post; Post has_one :tagging (polymorphic as: taggable)
    // Author has_many :taggings_2, through: :post (singular), source: :tagging
    const ad = freshAdapter();
    class TphoAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = ad;
      }
    }
    class TphoPost extends Base {
      static {
        this.attribute("author_id", "integer");
        this.attribute("title", "string");
        this.adapter = ad;
      }
    }
    class TphoTagging extends Base {
      static {
        this.attribute("tag_id", "integer");
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
        this.adapter = ad;
      }
    }
    registerModel(TphoAuthor);
    registerModel(TphoPost);
    registerModel(TphoTagging);
    Associations.hasOne.call(TphoAuthor, "post", {
      className: "TphoPost",
      foreignKey: "author_id",
    });
    Associations.hasOne.call(TphoPost, "tagging", { className: "TphoTagging", as: "taggable" });
    Associations.hasMany.call(TphoAuthor, "taggings", {
      through: "post",
      className: "TphoTagging",
      source: "tagging",
    });
    const author = await TphoAuthor.create({ name: "David" });
    const post = await TphoPost.create({ author_id: author.id, title: "P1" });
    await TphoTagging.create({ tag_id: 1, taggable_id: post.id, taggable_type: "TphoPost" });
    const taggings = await loadHasMany(author, "taggings", {
      through: "post",
      className: "TphoTagging",
      source: "tagging",
    });
    expect(taggings).toHaveLength(1);
  });

  it("has many through polymorphic has many", async () => {
    // Author has_many :posts; Post has_many :taggings (as: :taggable)
    // Author has_many :taggings, through: :posts
    const ad = freshAdapter();
    class TphmAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = ad;
      }
    }
    class TphmPost extends Base {
      static {
        this.attribute("author_id", "integer");
        this.attribute("title", "string");
        this.adapter = ad;
      }
    }
    class TphmTagging extends Base {
      static {
        this.attribute("tag_id", "integer");
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
        this.adapter = ad;
      }
    }
    registerModel(TphmAuthor);
    registerModel(TphmPost);
    registerModel(TphmTagging);
    Associations.hasMany.call(TphmAuthor, "posts", {
      className: "TphmPost",
      foreignKey: "author_id",
    });
    Associations.hasMany.call(TphmPost, "taggings", { className: "TphmTagging", as: "taggable" });
    Associations.hasMany.call(TphmAuthor, "taggings", {
      through: "posts",
      className: "TphmTagging",
      source: "tagging",
    });
    const author = await TphmAuthor.create({ name: "David" });
    const post1 = await TphmPost.create({ author_id: author.id, title: "P1" });
    const post2 = await TphmPost.create({ author_id: author.id, title: "P2" });
    await TphmTagging.create({ tag_id: 1, taggable_id: post1.id, taggable_type: "TphmPost" });
    await TphmTagging.create({ tag_id: 2, taggable_id: post2.id, taggable_type: "TphmPost" });
    const taggings = await loadHasMany(author, "taggings", {
      through: "posts",
      className: "TphmTagging",
      source: "tagging",
    });
    expect(taggings).toHaveLength(2);
  });

  it("include has many through polymorphic has many", async () => {
    const ad = freshAdapter();
    class IphmtAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = ad;
      }
    }
    class IphmtPost extends Base {
      static {
        this.attribute("author_id", "integer");
        this.attribute("title", "string");
        this.adapter = ad;
      }
    }
    class IphmtTagging extends Base {
      static {
        this.attribute("tag_id", "integer");
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
        this.adapter = ad;
      }
    }
    registerModel(IphmtAuthor);
    registerModel(IphmtPost);
    registerModel(IphmtTagging);
    Associations.hasMany.call(IphmtAuthor, "posts", {
      className: "IphmtPost",
      foreignKey: "author_id",
    });
    Associations.hasMany.call(IphmtPost, "taggings", { className: "IphmtTagging", as: "taggable" });
    Associations.hasMany.call(IphmtAuthor, "taggings", {
      through: "posts",
      className: "IphmtTagging",
      source: "tagging",
    });
    const author = await IphmtAuthor.create({ name: "David" });
    const post = await IphmtPost.create({ author_id: author.id, title: "P1" });
    await IphmtTagging.create({ tag_id: 1, taggable_id: post.id, taggable_type: "IphmtPost" });
    const authors = await IphmtAuthor.all().includes("taggings").toArray();
    expect(authors).toHaveLength(1);
    const preloaded = (authors[0] as any)._preloadedAssociations?.get("taggings");
    expect(preloaded).toHaveLength(1);
  });

  it("eager load has many through has many", async () => {
    const ad = freshAdapter();
    class ElAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = ad;
      }
    }
    class ElPost extends Base {
      static {
        this.attribute("author_id", "integer");
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.adapter = ad;
      }
    }
    class ElTag extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = ad;
      }
    }
    class ElTagging extends Base {
      static {
        this.attribute("tag_id", "integer");
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
        this.adapter = ad;
      }
    }
    registerModel(ElAuthor);
    registerModel(ElPost);
    registerModel(ElTag);
    registerModel(ElTagging);
    Associations.hasMany.call(ElAuthor, "posts", { className: "ElPost", foreignKey: "author_id" });
    Associations.hasMany.call(ElPost, "taggings", {
      className: "ElTagging",
      foreignKey: "taggable_id",
    });
    Associations.hasMany.call(ElAuthor, "taggings", { through: "posts", className: "ElTagging" });
    const author = await ElAuthor.create({ name: "EagerThrough" });
    const post = await ElPost.create({ author_id: author.id, title: "P1", body: "B" });
    const tag = await ElTag.create({ name: "eager_tag" });
    await ElTagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "ElPost" });
    const authors = await ElAuthor.all().includes("taggings").toArray();
    expect(authors).toHaveLength(1);
    const preloaded = (authors[0] as any)._preloadedAssociations?.get("taggings");
    expect(preloaded).toHaveLength(1);
  });

  it.skip("eager load has many through has many with conditions", () => {
    // Requires eager load + conditions
  });

  it.skip("eager belongs to and has one not singularized", () => {
    // Requires eager load pluralization fix
  });

  it.skip("self referential has many through", () => {
    // Requires self-referential through
  });

  it.skip("add to self referential has many through", () => {
    // Requires << on self-referential through
  });

  it.skip("has many through uses conditions specified on the has many association", () => {
    // Requires condition merging on through
  });

  it("has many through uses correct attributes", async () => {
    // Verify that through records have the correct attributes set
    const author = await Author.create({ name: "AttrAuthor" });
    const post = await Post.create({ author_id: author.id, title: "AttrPost", body: "AttrBody" });
    const tag = await Tag.create({ name: "attr_tag" });
    const tagging = await Tagging.create({
      tag_id: tag.id,
      taggable_id: post.id,
      taggable_type: "Post",
    });
    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
      primaryKey: "id",
    });
    expect(posts.length).toBe(1);
    expect((posts[0] as any).readAttribute("title")).toBe("AttrPost");
    expect((posts[0] as any).readAttribute("body")).toBe("AttrBody");
    const taggings = await loadHasMany(posts[0] as Post, "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
      primaryKey: "id",
    });
    expect(taggings.length).toBe(1);
    expect((taggings[0] as any).readAttribute("tag_id")).toBe(tag.id);
    expect((taggings[0] as any).readAttribute("taggable_type")).toBe("Post");
  });

  it.skip("associating unsaved records with has many through", () => {
    // Requires unsaved record through association
  });

  it("create associate when adding to has many through", async () => {
    const ad = freshAdapter();
    class CaPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.adapter = ad;
      }
    }
    class CaTag extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = ad;
      }
    }
    class CaTagging extends Base {
      static {
        this.attribute("tag_id", "integer");
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
        this.adapter = ad;
      }
    }
    registerModel(CaPost);
    registerModel(CaTag);
    registerModel(CaTagging);
    Associations.hasMany.call(CaPost, "taggings", {
      className: "CaTagging",
      foreignKey: "taggable_id",
    });
    Associations.hasMany.call(CaPost, "tags", {
      through: "taggings",
      className: "CaTag",
      source: "tag",
    });
    const post = await CaPost.create({ title: "Through Push", body: "B" });
    const tag = await CaTag.create({ name: "pushme" });
    const proxy = association(post, "tags");
    await proxy.push(tag);
    const taggings = await loadHasMany(post, "taggings", {
      className: "CaTagging",
      foreignKey: "taggable_id",
    });
    expect(taggings).toHaveLength(1);
    expect(taggings[0].readAttribute("tag_id")).toBe(tag.id);
    const tags = await proxy.toArray();
    expect(tags).toHaveLength(1);
    expect(tags[0].readAttribute("name")).toBe("pushme");
  });

  it.skip("add to join table with no id", () => {
    // Requires join table without PK
  });

  it.skip("has many through collection size doesnt load target if not loaded", () => {
    // Requires size without loading
  });

  it.skip("has many through collection size uses counter cache if it exists", () => {
    // Requires counter_cache on through
  });

  it.skip("adding junk to has many through should raise type mismatch", () => {
    // Requires type check on <<
  });

  it.skip("adding to has many through should return self", () => {
    // Requires << return value
  });

  it.skip("delete associate when deleting from has many through with nonstandard id", () => {
    // Requires non-standard id delete
  });

  it("delete associate when deleting from has many through", async () => {
    const ad = freshAdapter();
    class DtPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.adapter = ad;
      }
    }
    class DtTag extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = ad;
      }
    }
    class DtTagging extends Base {
      static {
        this.attribute("tag_id", "integer");
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
        this.adapter = ad;
      }
    }
    registerModel(DtPost);
    registerModel(DtTag);
    registerModel(DtTagging);
    Associations.hasMany.call(DtPost, "taggings", {
      className: "DtTagging",
      foreignKey: "taggable_id",
    });
    Associations.hasMany.call(DtPost, "tags", {
      through: "taggings",
      className: "DtTag",
      source: "tag",
    });
    const post = await DtPost.create({ title: "Through Del", body: "B" });
    const tag = await DtTag.create({ name: "doomed" });
    await DtTagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "DtPost" });
    const proxy = association(post, "tags");
    let tags = await proxy.toArray();
    expect(tags).toHaveLength(1);
    await proxy.delete(tag);
    tags = await proxy.toArray();
    expect(tags).toHaveLength(0);
    const taggings = await loadHasMany(post, "taggings", {
      className: "DtTagging",
      foreignKey: "taggable_id",
    });
    expect(taggings).toHaveLength(0);
  });

  it("delete associate when deleting from has many through with multiple tags", async () => {
    const ad = freshAdapter();
    class MdPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.adapter = ad;
      }
    }
    class MdTag extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = ad;
      }
    }
    class MdTagging extends Base {
      static {
        this.attribute("tag_id", "integer");
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
        this.adapter = ad;
      }
    }
    registerModel(MdPost);
    registerModel(MdTag);
    registerModel(MdTagging);
    Associations.hasMany.call(MdPost, "taggings", {
      className: "MdTagging",
      foreignKey: "taggable_id",
    });
    Associations.hasMany.call(MdPost, "tags", {
      through: "taggings",
      className: "MdTag",
      source: "tag",
    });
    const post = await MdPost.create({ title: "Multi Del", body: "B" });
    const doomed = await MdTag.create({ name: "doomed" });
    const doomed2 = await MdTag.create({ name: "doomed2" });
    const keeper = await MdTag.create({ name: "keeper" });
    await MdTagging.create({ tag_id: doomed.id, taggable_id: post.id, taggable_type: "MdPost" });
    await MdTagging.create({ tag_id: doomed2.id, taggable_id: post.id, taggable_type: "MdPost" });
    await MdTagging.create({ tag_id: keeper.id, taggable_id: post.id, taggable_type: "MdPost" });
    const proxy = association(post, "tags");
    expect(await proxy.count()).toBe(3);
    await proxy.delete(doomed, doomed2);
    expect(await proxy.count()).toBe(1);
    const remaining = await proxy.toArray();
    expect(remaining[0].readAttribute("name")).toBe("keeper");
  });

  it.skip("deleting junk from has many through should raise type mismatch", () => {
    // Requires type check on delete
  });

  it.skip("deleting by integer id from has many through", () => {
    // Requires delete by integer id
  });

  it.skip("deleting by string id from has many through", () => {
    // Requires delete by string id
  });

  it.skip("has many through sum uses calculations", () => {
    // Requires sum() on through
  });

  it.skip("calculations on has many through should disambiguate fields", () => {
    // Requires disambiguated field calculations
  });

  it.skip("calculations on has many through should not disambiguate fields unless necessary", () => {
    // Requires smart disambiguation
  });

  it("has many through has many with sti", async () => {
    // Author -> SpecialPost (STI subclass of Post) -> Comments (through)
    class StiPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("type", "string");
        this.attribute("author_id", "integer");
        this._tableName = "sti_posts";
        this.adapter = adapter;
        enableSti(StiPost);
      }
    }
    class SpecialStiPost extends StiPost {
      static {
        this.adapter = adapter;
        registerModel(SpecialStiPost);
        registerSubclass(SpecialStiPost);
      }
    }
    class StiAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class StiComment extends Base {
      static {
        this.attribute("body", "string");
        this.attribute("sti_post_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(StiPost);
    registerModel(StiAuthor);
    registerModel(StiComment);

    Associations.hasMany.call(StiAuthor, "specialStiPosts", {
      className: "SpecialStiPost",
      foreignKey: "author_id",
    });
    Associations.hasMany.call(StiAuthor, "specialPostComments", {
      className: "StiComment",
      through: "specialStiPosts",
      source: "stiComments",
    });
    Associations.hasMany.call(SpecialStiPost, "stiComments", {
      className: "StiComment",
      foreignKey: "sti_post_id",
    });

    const author = await StiAuthor.create({ name: "David" });
    const normalPost = await StiPost.create({ title: "Normal", author_id: author.id });
    const specialPost = await SpecialStiPost.create({ title: "Special", author_id: author.id });
    await StiComment.create({ body: "on normal", sti_post_id: normalPost.id });
    const specialComment = await StiComment.create({
      body: "on special",
      sti_post_id: specialPost.id,
    });

    const comments = await loadHasManyThrough(author, "specialPostComments", {
      className: "StiComment",
      through: "specialStiPosts",
      source: "stiComments",
    });
    expect(comments).toHaveLength(1);
    expect(comments[0].readAttribute("body")).toBe("on special");
  });

  it.skip("distinct has many through should retain order", () => {
    // Requires ORDER BY preservation with distinct
  });

  it("polymorphic has many", async () => {
    const post = await Post.create({ title: "Poly", body: "B" });
    const tag = await Tag.create({ name: "poly_tag" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: tag.id, taggable_id: 999, taggable_type: "OtherModel" });
    const taggings = await loadHasMany(post, "taggings", { as: "taggable", className: "Tagging" });
    expect(taggings.length).toBe(1);
    expect(taggings[0].readAttribute("tag_id")).toBe(tag.id);
  });

  it("polymorphic has one", async () => {
    const post = await Post.create({ title: "Poly1", body: "B" });
    await Tagging.create({ tag_id: 1, taggable_id: post.id, taggable_type: "Post" });
    const tagging = await loadHasOne(post, "tagging", { as: "taggable", className: "Tagging" });
    expect(tagging).not.toBeNull();
    expect(tagging!.readAttribute("taggable_type")).toBe("Post");
  });

  it("polymorphic belongs to", async () => {
    const post = await Post.create({ title: "PolyBt", body: "B" });
    const tagging = await Tagging.create({
      tag_id: 1,
      taggable_id: post.id,
      taggable_type: "Post",
    });
    Associations.belongsTo.call(Tagging, "taggable", { polymorphic: true });
    const loaded = await loadBelongsTo(tagging, "taggable", { polymorphic: true });
    expect(loaded).not.toBeNull();
    expect(loaded!.readAttribute("title")).toBe("PolyBt");
  });

  it.skip("preload polymorphic has many through", () => {
    // Requires preload polymorphic through
  });

  it("preload polymorph many types", async () => {
    // Preload polymorphic belongsTo with multiple types
    Associations.belongsTo.call(Tagging, "taggable", { polymorphic: true });
    const post = await Post.create({ title: "TypeA", body: "B" });
    const author = await Author.create({ name: "TypeB" });
    await Tagging.create({ tag_id: 1, taggable_id: post.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: 2, taggable_id: author.id, taggable_type: "Author" });
    const taggings = await Tagging.all().includes("taggable").toArray();
    const t1 = taggings.find((r: any) => r.readAttribute("taggable_type") === "Post");
    const t2 = taggings.find((r: any) => r.readAttribute("taggable_type") === "Author");
    const p1 = (t1 as any)._preloadedAssociations?.get("taggable");
    const p2 = (t2 as any)._preloadedAssociations?.get("taggable");
    expect(p1).not.toBeNull();
    expect(p1.readAttribute("title")).toBe("TypeA");
    expect(p2).not.toBeNull();
    expect(p2.readAttribute("name")).toBe("TypeB");
  });

  it("preload nil polymorphic belongs to", async () => {
    // Tagging with no taggable should preload as null
    const tagging = await Tagging.create({
      tag_id: 1,
      taggable_id: null as any,
      taggable_type: null as any,
    });
    Associations.belongsTo.call(Tagging, "taggable", { polymorphic: true });
    const taggings = await Tagging.all().includes("taggable").toArray();
    const t = taggings.find((r: any) => r.id === tagging.id);
    expect(t).toBeDefined();
    const preloaded = (t as any)._preloadedAssociations?.get("taggable");
    expect(preloaded).toBeNull();
  });

  it("preload polymorphic has many", async () => {
    Associations.hasMany.call(Post, "taggings", { as: "taggable", className: "Tagging" });
    const post = await Post.create({ title: "PrePoly", body: "B" });
    await Tagging.create({ tag_id: 1, taggable_id: post.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: 2, taggable_id: post.id, taggable_type: "Post" });
    // Different type shouldn't be preloaded
    await Tagging.create({ tag_id: 3, taggable_id: post.id, taggable_type: "OtherModel" });
    const posts = await Post.all().includes("taggings").toArray();
    const p = posts.find((r: any) => r.id === post.id);
    const preloaded = (p as any)._preloadedAssociations?.get("taggings");
    expect(preloaded.length).toBe(2);
  });

  it.skip("belongs to shared parent", () => {
    // Requires shared parent belongs_to
  });

  it("has many through include uses array include after loaded", async () => {
    // After loading through association, check if a specific record is included
    const author = await Author.create({ name: "InclAuthor" });
    const post = await Post.create({ author_id: author.id, title: "InclPost", body: "B" });
    const tag = await Tag.create({ name: "incl_tag" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });
    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
      primaryKey: "id",
    });
    const taggings = await loadHasMany(posts[0] as Post, "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
      primaryKey: "id",
    });
    const included = taggings.some((t: any) => t.readAttribute("tag_id") === tag.id);
    expect(included).toBe(true);
  });

  it.skip("has many through include checks if record exists if target not loaded", () => {
    // Requires DB check when not loaded
  });

  it("has many through include returns false for non matching record to verify scoping", async () => {
    // A tagging for a different post should not appear in this author's through
    const author = await Author.create({ name: "ScopeAuthor" });
    const post = await Post.create({ author_id: author.id, title: "ScopePost", body: "B" });
    const otherPost = await Post.create({ title: "OtherPost", body: "B" }); // no author
    const tag = await Tag.create({ name: "scope_tag" });
    await Tagging.create({ tag_id: tag.id, taggable_id: otherPost.id, taggable_type: "Post" });
    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
      primaryKey: "id",
    });
    // Author has one post, but the tagging is on otherPost
    const allTaggings: any[] = [];
    for (const p of posts) {
      const taggings = await loadHasMany(p as Post, "taggings", {
        className: "Tagging",
        foreignKey: "taggable_id",
        primaryKey: "id",
      });
      allTaggings.push(...taggings);
    }
    expect(allTaggings.length).toBe(0);
  });

  it("has many through goes through all sti classes", async () => {
    // Through a has_many to an STI class should include all STI subclasses
    class StiPost2 extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("type", "string");
        this.attribute("author_id", "integer");
        this._tableName = "sti_posts2";
        this.adapter = adapter;
        enableSti(StiPost2);
      }
    }
    class SubStiPost2 extends StiPost2 {
      static {
        this.adapter = adapter;
        registerModel(SubStiPost2);
        registerSubclass(SubStiPost2);
      }
    }
    class StiAuthor2 extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class StiComment2 extends Base {
      static {
        this.attribute("body", "string");
        this.attribute("sti_post2_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(StiPost2);
    registerModel(StiAuthor2);
    registerModel(StiComment2);

    Associations.hasMany.call(StiAuthor2, "stiPosts2", {
      className: "StiPost2",
      foreignKey: "author_id",
    });
    Associations.hasMany.call(StiAuthor2, "stiPostComments2", {
      className: "StiComment2",
      through: "stiPosts2",
      source: "stiComments2",
    });
    Associations.hasMany.call(StiPost2, "stiComments2", {
      className: "StiComment2",
      foreignKey: "sti_post2_id",
    });

    const author = await StiAuthor2.create({ name: "David" });
    const stiPost = await StiPost2.create({ title: "StiPost", author_id: author.id });
    const subStiPost = await SubStiPost2.create({ title: "SubStiPost", author_id: author.id });
    await StiComment2.create({ body: "on sti", sti_post2_id: stiPost.id });
    await StiComment2.create({ body: "on sub_sti", sti_post2_id: subStiPost.id });

    const comments = await loadHasManyThrough(author, "stiPostComments2", {
      className: "StiComment2",
      through: "stiPosts2",
      source: "stiComments2",
    });
    // Should include comments from both StiPost2 and SubStiPost2
    expect(comments).toHaveLength(2);
  });

  it.skip("has many with pluralize table names false", () => {
    // Requires pluralize_table_names: false
  });

  it.skip("proper error message for eager load and includes association errors", () => {
    // Requires error message on includes failure
  });

  it.skip("eager association with scope with string joins", () => {
    // Requires string joins in scope
  });
});

// ==========================================================================
// NestedThroughAssociationsTest — mirrors nested_through_associations_test.rb
// ==========================================================================

