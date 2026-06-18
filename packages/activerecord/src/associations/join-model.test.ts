/**
 * Mirrors Rails activerecord/test/cases/associations/join_model_test.rb
 *
 * Wave 1 of the canonical-schema conversion (RFC 0019): the read-only
 * has_many :through / polymorphic-through tests that drive the canonical
 * Tag / Tagging / Post / Author / Category / Categorization join models on
 * the canonical fixtures. Remaining waves (mutating, eager-load, STI, and
 * self-referential groups) are tracked as sibling stories.
 */
import { describe, it, expect } from "vitest";
import { registerModel } from "../index.js";
import { Base } from "../base.js";
import { setHasOne, loadBelongsTo } from "../associations.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { Author } from "../test-helpers/models/author.js";
import { Post, SpecialPost, SubAbstractStiPost } from "../test-helpers/models/post.js";
import { Tag } from "../test-helpers/models/tag.js";
import { Tagging } from "../test-helpers/models/tagging.js";
import { Category } from "../test-helpers/models/category.js";
import { Categorization } from "../test-helpers/models/categorization.js";

// Mirrors the dynamic subclasses built by Rails' `find_post_with_dependency`
// helper: `Class.new(ActiveRecord::Base)` on the `posts` table carrying a
// `has_many`/`has_one :as => :taggable` with the requested `:dependent`. Each
// is its own base class, so its polymorphic_name is the class name itself.
class PostWithHasManyDeleteAll extends Base {
  static {
    this._tableName = "posts";
    this.hasMany("taggings", { as: "taggable", dependent: "delete" });
  }
}
class PostWithHasManyDestroy extends Base {
  static {
    this._tableName = "posts";
    this.hasMany("taggings", { as: "taggable", dependent: "destroy" });
  }
}
class PostWithHasManyNullify extends Base {
  static {
    this._tableName = "posts";
    this.hasMany("taggings", { as: "taggable", dependent: "nullify" });
  }
}
class PostWithHasOneDestroy extends Base {
  static {
    this._tableName = "posts";
    this.hasOne("tagging", { as: "taggable", dependent: "destroy" });
  }
}
class PostWithHasOneNullify extends Base {
  static {
    this._tableName = "posts";
    this.hasOne("tagging", { as: "taggable", dependent: "nullify" });
  }
}

describe("AssociationsJoinModelTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  const { authors, posts, categories, tags, taggings } = useHandlerFixtures([
    "authors",
    "posts",
    "categories",
    "categorizations",
    "tags",
    "taggings",
  ]);
  registerModel(Author);
  registerModel(Post);
  registerModel(Tag);
  registerModel(Tagging);
  registerModel(Category);
  registerModel(Categorization);
  registerModel(SpecialPost);
  registerModel(SubAbstractStiPost);
  registerModel(PostWithHasManyDeleteAll);
  registerModel(PostWithHasManyDestroy);
  registerModel(PostWithHasManyNullify);
  registerModel(PostWithHasOneDestroy);
  registerModel(PostWithHasOneNullify);

  // Mirrors Rails' `find_post_with_dependency(post_id, ...)`: set the post's
  // `type` to the dependent-variant class name, then reload through it.
  async function findPostWithDependency(postId: number, klass: typeof Base): Promise<Base> {
    const post = (await Post.find(postId)) as Post;
    await (post as any).updateColumns({ type: klass.name });
    return (await (klass as any).find(postId)) as Base;
  }

  it("has many", async () => {
    const david = (await Author.find(authors("david").id)) as Author;
    const cats = (await (david as any).categories.toArray()) as Base[];
    expect(cats.map((c) => c.id)).toContain(categories("general").id);
  });

  it("has many inherited", async () => {
    const mary = (await Author.find(authors("mary").id)) as Author;
    const cats = (await (mary as any).categories.toArray()) as Base[];
    expect(cats.map((c) => c.id)).toContain(categories("sti_test").id);
  });

  it("inherited has many", async () => {
    const stiTest = (await Category.find(categories("sti_test").id)) as Category;
    const stiAuthors = (await (stiTest as any).authors.toArray()) as Base[];
    expect(stiAuthors.map((a) => a.id)).toContain(authors("mary").id);
  });

  it("has many distinct through join model", async () => {
    const mary = (await Author.find(authors("mary").id)) as Author;
    expect((await (mary as any).categorizedPosts.toArray()).length).toBe(2);
    expect((await (mary as any).uniqueCategorizedPosts.toArray()).length).toBe(1);
  });

  it("has many distinct through find", async () => {
    const mary = (await Author.find(authors("mary").id)) as Author;
    expect((await (mary as any).uniqueCategorizedPosts.toArray()).length).toBe(1);
  });

  it("count polymorphic has many", async () => {
    const welcome = (await Post.find(posts("welcome").id)) as Post;
    expect(await (welcome as any).taggings.count()).toBe(1);
    expect(await (welcome as any).tags.count()).toBe(1);
  });

  it("has many find all", async () => {
    const david = (await Author.find(authors("david").id)) as Author;
    const cats = (await (david as any).categories.toArray()) as Base[];
    expect(cats.map((c) => c.id)).toEqual([categories("general").id]);
  });

  it("has many find first", async () => {
    const david = (await Author.find(authors("david").id)) as Author;
    const cat = (await (david as any).categories.first()) as Base;
    expect(cat.id).toBe(categories("general").id);
  });

  it("has many with hash conditions", async () => {
    const david = (await Author.find(authors("david").id)) as Author;
    const cat = (await (david as any).categoriesLikeGeneral.first()) as Base;
    expect(cat.id).toBe(categories("general").id);
  });

  it("has many find conditions", async () => {
    const david = (await Author.find(authors("david").id)) as Author;
    const general = (await (david as any).categories
      .where("categories.name = 'General'")
      .first()) as Base | null;
    expect(general?.id).toBe(categories("general").id);
    const technology = (await (david as any).categories
      .where("categories.name = 'Technology'")
      .first()) as Base | null;
    expect(technology).toBeNull();
  });

  it("has many array methods called by method missing", async () => {
    const david = (await Author.find(authors("david").id)) as Author;
    // Rails routes Array methods (`any?`, `sort`) through the collection
    // proxy's method_missing → `records` (delegation.rb `delegate ... to:
    // :records`). `any(fn)` drives CollectionProxy#any; `sort` is delegated
    // to the loaded target. JS has no blocking IO, so we hydrate the proxy's
    // target via `load()` (Rails' `any?`-with-block loads it implicitly)
    // before the synchronous `sort`.
    const categories = (david as any).categories;
    expect(await categories.any((category: Base) => (category as any).name === "General")).toBe(
      true,
    );
    await categories.load();
    expect(() => categories.sort()).not.toThrow();
  });

  it("polymorphic has many create model with inheritance and custom base class", async () => {
    const post = await SubAbstractStiPost.create({
      title: "SubAbstractStiPost",
      body: "SubAbstractStiPost body",
    });
    expect(post).toBeInstanceOf(SubAbstractStiPost);

    const misc = (await Tag.find(tags("misc").id)) as Tag;
    const tagging = await (misc as any).taggings.create({ taggable: post });
    expect(tagging.taggable_type).toBe("SubAbstractStiPost");
  });

  it("polymorphic has many create model with inheritance", async () => {
    const post = (await Post.find(posts("thinking").id)) as Post;
    expect(post).toBeInstanceOf(SpecialPost);

    const misc = (await Tag.find(tags("misc").id)) as Tag;
    const tagging = await (misc as any).taggings.create({ taggable: post });
    expect(tagging.taggable_type).toBe("Post");
  });

  it("polymorphic has one create model with inheritance", async () => {
    const misc = (await Tag.find(tags("misc").id)) as Tag;
    const thinking = (await Post.find(posts("thinking").id)) as Post;
    const tagging = await (misc as any).createTagging({ taggable: thinking });
    expect(tagging.taggable_type).toBe("Post");
  });

  it("set polymorphic has many", async () => {
    const misc = (await Tag.find(tags("misc").id)) as Tag;
    const tagging = await (misc as any).taggings.create();
    const thinking = (await Post.find(posts("thinking").id)) as Post;
    await (thinking as any).taggings.push(tagging);
    expect(tagging.taggable_type).toBe("Post");
  });

  it("set polymorphic has one", async () => {
    const misc = (await Tag.find(tags("misc").id)) as Tag;
    const tagging = await (misc as any).taggings.create();
    const thinking = (await Post.find(posts("thinking").id)) as Post;
    await setHasOne(thinking, "tagging", tagging, { as: "taggable", className: "Tagging" });

    expect(tagging.taggable_type).toBe("Post");
    expect(tagging.taggable_id).toBe(thinking.id);
    const taggable = (await loadBelongsTo(tagging, "taggable", { polymorphic: true })) as Base;
    expect(taggable.id).toBe(thinking.id);
  });

  it("set polymorphic has one on new record", async () => {
    const misc = (await Tag.find(tags("misc").id)) as Tag;
    const tagging = await (misc as any).taggings.create();
    const post = Post.new({ title: "foo", body: "bar" }) as Post;
    await (post as any).association("tagging").replace(tagging);
    await post.save();

    expect(tagging.taggable_type).toBe("Post");
    expect(tagging.taggable_id).toBe(post.id);
    const taggable = (await loadBelongsTo(tagging, "taggable", { polymorphic: true })) as Base;
    expect(taggable.id).toBe(post.id);
  });

  it("create polymorphic has many with scope", async () => {
    const welcome = (await Post.find(posts("welcome").id)) as Post;
    const oldCount = await (welcome as any).taggings.count();
    const misc = (await Tag.find(tags("misc").id)) as Tag;
    const tagging = await (welcome as any).taggings.create({ tag: misc });
    expect(tagging.taggable_type).toBe("Post");
    expect(await (welcome as any).taggings.count()).toBe(oldCount + 1);
  });

  it("create bang polymorphic with has many scope", async () => {
    const welcome = (await Post.find(posts("welcome").id)) as Post;
    const oldCount = await (welcome as any).taggings.count();
    const misc = (await Tag.find(tags("misc").id)) as Tag;
    const tagging = await (welcome as any).taggings.createBang({ tag: misc });
    expect(tagging.taggable_type).toBe("Post");
    expect(await (welcome as any).taggings.count()).toBe(oldCount + 1);
  });

  it("create polymorphic has one with scope", async () => {
    const welcome = (await Post.find(posts("welcome").id)) as Post;
    const oldCount = Number(await Tagging.count());
    const misc = (await Tag.find(tags("misc").id)) as Tag;
    const tagging = await (welcome as any).createTagging({ tag: misc });
    expect(tagging.taggable_type).toBe("Post");
    expect(await Tagging.count()).toBe(oldCount + 1);
  });

  it("delete polymorphic has many with delete all", async () => {
    const welcome = (await Post.find(posts("welcome").id)) as Post;
    expect(await (welcome as any).taggings.count()).toBe(1);
    const firstTagging = (await (welcome as any).taggings.first()) as Tagging;
    await (firstTagging as any).updateColumns({ taggable_type: "PostWithHasManyDeleteAll" });
    const post = await findPostWithDependency(welcome.id as number, PostWithHasManyDeleteAll);

    const oldCount = Number(await Tagging.count());
    await (post as any).destroy();
    expect(await Tagging.count()).toBe(oldCount - 1);
    expect(await (welcome as any).taggings.count()).toBe(0);
  });

  it("delete polymorphic has many with destroy", async () => {
    const welcome = (await Post.find(posts("welcome").id)) as Post;
    expect(await (welcome as any).taggings.count()).toBe(1);
    const firstTagging = (await (welcome as any).taggings.first()) as Tagging;
    await (firstTagging as any).updateColumns({ taggable_type: "PostWithHasManyDestroy" });
    const post = await findPostWithDependency(welcome.id as number, PostWithHasManyDestroy);

    const oldCount = Number(await Tagging.count());
    await (post as any).destroy();
    expect(await Tagging.count()).toBe(oldCount - 1);
    expect(await (welcome as any).taggings.count()).toBe(0);
  });

  it("delete polymorphic has many with nullify", async () => {
    const welcome = (await Post.find(posts("welcome").id)) as Post;
    expect(await (welcome as any).taggings.count()).toBe(1);
    const firstTagging = (await (welcome as any).taggings.first()) as Tagging;
    await (firstTagging as any).updateColumns({ taggable_type: "PostWithHasManyNullify" });
    const post = await findPostWithDependency(welcome.id as number, PostWithHasManyNullify);

    const oldCount = Number(await Tagging.count());
    await (post as any).destroy();
    expect(await Tagging.count()).toBe(oldCount);
    expect(await (welcome as any).taggings.count()).toBe(0);
  });

  it("delete polymorphic has one with destroy", async () => {
    const welcome = (await Post.find(posts("welcome").id)) as Post;
    const tagging = (await (welcome as any).association("tagging").loadTarget()) as Tagging;
    expect(tagging).toBeTruthy();
    await (tagging as any).updateColumns({ taggable_type: "PostWithHasOneDestroy" });
    const post = await findPostWithDependency(welcome.id as number, PostWithHasOneDestroy);

    const oldCount = Number(await Tagging.count());
    await (post as any).destroy();
    expect(await Tagging.count()).toBe(oldCount - 1);
    await (welcome as any).association("tagging").reload();
    expect((welcome as any).association("tagging").target).toBeNull();
  });

  it("delete polymorphic has one with nullify", async () => {
    const welcome = (await Post.find(posts("welcome").id)) as Post;
    const tagging = (await (welcome as any).association("tagging").loadTarget()) as Tagging;
    expect(tagging).toBeTruthy();
    await (tagging as any).updateColumns({ taggable_type: "PostWithHasOneNullify" });
    const post = await findPostWithDependency(welcome.id as number, PostWithHasOneNullify);

    const oldCount = Number(await Tagging.count());
    await (post as any).destroy();
    expect(await Tagging.count()).toBe(oldCount);
    await (welcome as any).association("tagging").reload();
    expect((welcome as any).association("tagging").target).toBeNull();
  });

  it("belongs to polymorphic with counter cache", async () => {
    const welcome = (await Post.find(posts("welcome").id)) as Post;
    expect((welcome as any).tags_count).toBe(1);
    const general = (await Tag.find(tags("general").id)) as Tag;
    const tagging = await (welcome as any).taggings.create({ tag: general });
    expect(((await Post.find(posts("welcome").id)) as any).tags_count).toBe(2);
    await (tagging as any).destroy();
    expect(((await Post.find(posts("welcome").id)) as any).tags_count).toBe(1);
  });
});
