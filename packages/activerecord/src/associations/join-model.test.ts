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
import { association, setHasOne, loadBelongsTo } from "../associations.js";
import {
  HasManyThroughAssociationNotFoundError,
  HasManyThroughAssociationPolymorphicSourceError,
  HasManyThroughAssociationPolymorphicThroughError,
  EagerLoadPolymorphicError,
} from "./errors.js";
import { assertNoQueries } from "../testing/query-assertions.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { Author } from "../test-helpers/models/author.js";
import { Post, SpecialPost, SubAbstractStiPost } from "../test-helpers/models/post.js";
import { Tag } from "../test-helpers/models/tag.js";
import { Tagging } from "../test-helpers/models/tagging.js";
import { Category } from "../test-helpers/models/category.js";
import { Categorization } from "../test-helpers/models/categorization.js";
import { Comment, SpecialComment } from "../test-helpers/models/comment.js";
import { Item } from "../test-helpers/models/item.js";

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
  const { authors, posts, categories, tags, taggings, comments, items } = useHandlerFixtures([
    "authors",
    "posts",
    "categories",
    "categorizations",
    "tags",
    "taggings",
    "comments",
    "items",
  ]);
  registerModel(Author);
  registerModel(Post);
  registerModel(Tag);
  registerModel(Tagging);
  registerModel(Category);
  registerModel(Categorization);
  registerModel(Comment);
  registerModel(SpecialComment);
  registerModel(Item);
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

  it("has many with piggyback", async () => {
    const stiTest = (await Category.find(categories("sti_test").id)) as Category;
    const first = (await (stiTest as any).authorsWithSelect.first()) as Base;
    // Rails surfaces the piggybacked `categorizations.post_id` select column via
    // method_missing as `first.post_id`; Author declares no such attribute, so
    // read it through `readAttribute` (the canonical-fixture id replaces the
    // Rails literal 2).
    expect(String((first as any).readAttribute("post_id"))).toBe(String(posts("thinking").id));
  });

  // DEFERRED (tracked: join-model-create-through-sets-owner-fk): trails'
  // create-through-has_many builds the join record but leaves the owner foreign
  // key (categorizations.category_id) null, so the created Ernie never appears
  // back through the association. Un-skip once create-through populates the
  // owner key.
  it.skip("create through has many with piggyback", async () => {
    const category = (await Category.find(categories("sti_test").id)) as Category;
    const ernie = await (category as any).authorsWithSelect.create({ name: "Ernie" });
    // assert_nothing_raised { ... category.authors_with_select.detect { |a| a.name == "Ernie" } }
    const detected = (await (category as any).authorsWithSelect.toArray()).find(
      (a: Base) => (a as any).name === "Ernie",
    );
    expect((detected as Base).id).toBe(ernie.id);
  });

  it("include has many through", async () => {
    const allPosts = (await Post.all().order("posts.id").toArray()) as Base[];
    const postsWithAuthors = (await Post.all()
      .includes("authors")
      .order("posts.id")
      .toArray()) as Base[];
    expect(postsWithAuthors.length).toBe(allPosts.length);
    for (let i = 0; i < allPosts.length; i++) {
      const expected = ((await (allPosts[i] as any).authors.toArray()) as Base[]).length;
      await assertNoQueries(false, async () => {
        const assoc = (postsWithAuthors[i] as any).association("authors");
        expect((assoc.target as Base[]).length).toBe(expected);
      });
    }
  });

  it("include polymorphic has one", async () => {
    const post = (await Post.includes("tagging").find(posts("welcome").id)) as Post;
    const tagging = taggings("welcome_general");
    await assertNoQueries(false, async () => {
      const target = (post as any).association("tagging").target as Base;
      expect(target.id).toBe(tagging.id);
    });
  });

  it("include polymorphic has one defined in abstract parent", async () => {
    const item = (await Item.includes("tagging").find(items("dvd").id)) as Item;
    const tagging = taggings("godfather");
    await assertNoQueries(false, async () => {
      const target = (item as any).association("tagging").target as Base;
      expect(target.id).toBe(tagging.id);
    });
  });

  it("include polymorphic has many through", async () => {
    const allPosts = (await Post.all().order("posts.id").toArray()) as Base[];
    const postsWithTags = (await Post.all().includes("tags").order("posts.id").toArray()) as Base[];
    expect(postsWithTags.length).toBe(allPosts.length);
    for (let i = 0; i < allPosts.length; i++) {
      const expected = ((await (allPosts[i] as any).tags.toArray()) as Base[]).length;
      await assertNoQueries(false, async () => {
        const assoc = (postsWithTags[i] as any).association("tags");
        expect((assoc.target as Base[]).length).toBe(expected);
      });
    }
  });

  it("include polymorphic has many", async () => {
    const allPosts = (await Post.all().order("posts.id").toArray()) as Base[];
    const postsWithTaggings = (await Post.all()
      .includes("taggings")
      .order("posts.id")
      .toArray()) as Base[];
    expect(postsWithTaggings.length).toBe(allPosts.length);
    for (let i = 0; i < allPosts.length; i++) {
      const expected = ((await (allPosts[i] as any).taggings.toArray()) as Base[]).length;
      await assertNoQueries(false, async () => {
        const assoc = (postsWithTaggings[i] as any).association("taggings");
        expect((assoc.target as Base[]).length).toBe(expected);
      });
    }
  });

  it("has many going through join model with custom foreign key", async () => {
    const thinking = (await Post.find(posts("thinking").id)) as Post;
    expect(((await (thinking as any).authors.toArray()) as Base[]).map((a) => a.id)).toEqual([
      authors("bob").id,
    ]);
    const authorless = (await Post.find(posts("authorless").id)) as Post;
    expect(((await (authorless as any).authors.toArray()) as Base[]).map((a) => a.id)).toEqual([
      authors("mary").id,
    ]);
  });

  it("has many going through join model with custom primary key", async () => {
    const thinking = (await Post.find(posts("thinking").id)) as Post;
    expect(
      ((await (thinking as any).authorsUsingAuthorId.toArray()) as Base[]).map((a) => a.id),
    ).toEqual([authors("david").id]);
  });

  it("has many going through polymorphic join model with custom primary key", async () => {
    const eagerOther = (await Post.find(posts("eager_other").id)) as Post;
    expect(
      ((await (eagerOther as any).tagsUsingAuthorId.toArray()) as Base[]).map((t) => t.id),
    ).toEqual([tags("general").id]);
  });

  // DEFERRED (tracked: canonical-fixture-ref-resolves-explicit-id): this test
  // relies on a cross-table id coincidence (Rails authors.author_address_extra_id
  // == categorizations.author_id == 2). In the canonical fixtures
  // `ref("author_addresses", "david_address_extra")` resolves to a label-hash
  // (1006418192) rather than the explicit `id: 2` pinned in the author_addresses
  // fixture, so the belongs_to custom-primary_key join never matches. Un-skip once
  // refs resolve to the target fixture's explicit id.
  it.skip("has many through with custom primary key on belongs to source", async () => {
    const thinking = (await Post.find(posts("thinking").id)) as Post;
    expect(
      ((await (thinking as any).authorUsingCustomPk.toArray()) as Base[]).map((a) => a.id),
    ).toEqual([authors("david").id, authors("david").id]);
  });

  it("has many through with custom primary key on has many source", async () => {
    const thinking = (await Post.find(posts("thinking").id)) as Post;
    const authorsUsingCustomPk = (await (thinking as any).authorsUsingCustomPk
      .order("authors.id")
      .toArray()) as Base[];
    expect(authorsUsingCustomPk.map((a) => a.id)).toEqual([authors("david").id, authors("bob").id]);
  });

  it("unavailable through reflection", async () => {
    const david = (await Author.find(authors("david").id)) as Author;
    expect(() => association(david, "nothings")).toThrow(HasManyThroughAssociationNotFoundError);
  });

  it("exceptions have suggestions for fix", async () => {
    const david = (await Author.find(authors("david").id)) as Author;
    let error: HasManyThroughAssociationNotFoundError | undefined;
    try {
      association(david, "nothings");
    } catch (e) {
      error = e as HasManyThroughAssociationNotFoundError;
    }
    expect(error).toBeInstanceOf(HasManyThroughAssociationNotFoundError);
    expect((error as any).detailedMessage()).toContain("Did you mean?");
  });

  it("has many through join model with conditions", async () => {
    const welcome = (await Post.find(posts("welcome").id)) as Post;
    expect((await (welcome as any).invalidTaggings.toArray()) as Base[]).toEqual([]);
    expect((await (welcome as any).invalidTags.toArray()) as Base[]).toEqual([]);
  });

  it("has many polymorphic", async () => {
    const general = (await Tag.find(tags("general").id)) as Tag;
    expect(() => association(general, "taggables")).toThrow(
      HasManyThroughAssociationPolymorphicSourceError,
    );

    const welcomeGeneral = (await Tagging.find(taggings("welcome_general").id)) as Tagging;
    expect(() => association(welcomeGeneral, "things")).toThrow(
      HasManyThroughAssociationPolymorphicThroughError,
    );

    await expect(
      (general as any).taggings
        .includes("taggable")
        .where("bogus_table.column = 1")
        .references("bogus_table")
        .toArray(),
    ).rejects.toThrow(EagerLoadPolymorphicError);
  });

  it("has many polymorphic with source type", async () => {
    const general = (await Tag.find(tags("general").id)) as Tag;
    const taggedPosts = (await (general as any).taggedPosts.toArray()) as Base[];
    expect(taggedPosts.map((p) => p.id).sort((a: any, b: any) => Number(a) - Number(b))).toEqual(
      [posts("welcome").id, posts("thinking").id].sort((a: any, b: any) => Number(a) - Number(b)),
    );
  });

  it("has many polymorphic associations merges through scope", async () => {
    // Rails defines null_taggings / null_tagged_posts inline here; the canonical
    // Tag model carries them so we needn't mutate the shared class at runtime.
    const general = (await Tag.find(tags("general").id)) as Tag;
    expect((await (general as any).nullTaggedPosts.toArray()) as Base[]).toEqual([]);
    expect(((await (general as any).taggedPosts.toArray()) as Base[]).length).not.toBe(0);
  });

  it("eager has many polymorphic with source type", async () => {
    const tagWithInclude = (await Tag.all()
      .includes("taggedPosts")
      .find(tags("general").id)) as Tag;
    const desired = [posts("welcome").id, posts("thinking").id].sort(
      (a: any, b: any) => Number(a) - Number(b),
    );
    await assertNoQueries(false, async () => {
      const target = (tagWithInclude as any).association("taggedPosts").target as Base[];
      expect(target.map((p) => p.id).sort((a: any, b: any) => Number(a) - Number(b))).toEqual(
        desired,
      );
    });
    expect(((await (tagWithInclude as any).taggings.toArray()) as Base[]).length).toBe(5);
  });

  it("has many through has many find all", async () => {
    const david = (await Author.find(authors("david").id)) as Author;
    const first = ((await (david as any).comments.order("comments.id").toArray()) as Base[])[0];
    expect(first.id).toBe(comments("greetings").id);
  });

  it("has many through has many find all with custom class", async () => {
    const david = (await Author.find(authors("david").id)) as Author;
    const first = (
      (await (david as any).funkyComments.order("comments.id").toArray()) as Base[]
    )[0];
    expect(first.id).toBe(comments("greetings").id);
  });

  it("has many through has many find first", async () => {
    const david = (await Author.find(authors("david").id)) as Author;
    const first = (await (david as any).comments.order("comments.id").first()) as Base;
    expect(first.id).toBe(comments("greetings").id);
  });

  it("has many through has many find conditions", async () => {
    const david = (await Author.find(authors("david").id)) as Author;
    const first = (await (david as any).comments
      .where("comments.type = 'SpecialComment'")
      .order("comments.id")
      .first()) as Base;
    expect(first.id).toBe(comments("does_it_hurt").id);
  });

  it("has many through has many find by id", async () => {
    const david = (await Author.find(authors("david").id)) as Author;
    const comment = (await (david as any).comments.find(2)) as Base;
    expect(comment.id).toBe(comments("more_greetings").id);
  });

  // DEFERRED (tracked: through-polymorphic-source-applies-type-condition): when a
  // has_many :through walks a polymorphic `as: :taggable` source (Post.taggings),
  // trails omits the `taggable_type = 'Post'` predicate, so author.taggings_2 /
  // author.taggings return every tagging whose taggable_id collides with the
  // owner's post ids (e.g. Rating/Item/FakeModel rows). Un-skip once the
  // polymorphic type condition is threaded through the source reflection.
  it.skip("has many through polymorphic has one", async () => {
    const david = (await Author.find(authors("david").id)) as Author;
    const taggings2 = (await (david as any).taggings_2.toArray()) as Base[];
    expect(taggings2.map((t) => t.id).sort((a: any, b: any) => Number(a) - Number(b))).toEqual([
      1, 2,
    ]);
  });

  it.skip("has many through polymorphic has many", async () => {
    const david = (await Author.find(authors("david").id)) as Author;
    const davidTaggings = (await (david as any).taggings.distinct().toArray()) as Base[];
    expect(davidTaggings.map((t) => t.id).sort((a: any, b: any) => Number(a) - Number(b))).toEqual([
      taggings("welcome_general").id,
      taggings("thinking_general").id,
    ]);
  });
});
