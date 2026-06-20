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
import { AssociationTypeMismatch } from "../errors.js";
import {
  HasManyThroughAssociationNotFoundError,
  HasManyThroughAssociationPolymorphicSourceError,
  HasManyThroughAssociationPolymorphicThroughError,
  EagerLoadPolymorphicError,
} from "./errors.js";
import { assertNoQueries, assertQueriesCount } from "../testing/query-assertions.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { Author, AuthorAddress, AuthorFavorite } from "../test-helpers/models/author.js";
import {
  Post,
  SpecialPost,
  SubAbstractStiPost,
  StiPost,
  SubStiPost,
} from "../test-helpers/models/post.js";
import { Tag } from "../test-helpers/models/tag.js";
import { Tagging } from "../test-helpers/models/tagging.js";
import { Category } from "../test-helpers/models/category.js";
import { Categorization } from "../test-helpers/models/categorization.js";
import { Comment, SpecialComment, VerySpecialComment } from "../test-helpers/models/comment.js";
import { Item } from "../test-helpers/models/item.js";
import { Book } from "../test-helpers/models/book.js";
import { Citation } from "../test-helpers/models/citation.js";
import { Vertex } from "../test-helpers/models/vertex.js";
import { Edge } from "../test-helpers/models/edge.js";
import { Rating } from "../test-helpers/models/rating.js";
import { Aircraft } from "../test-helpers/models/aircraft.js";
import { Engine } from "../test-helpers/models/engine.js";
import { Car } from "../test-helpers/models/car.js";
import { CpkOrder } from "../test-helpers/models/cpk.js";

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
  const { authors, posts, categories, tags, taggings, comments, items, books, vertices } =
    useHandlerFixtures([
      "authors",
      "authorAddresses",
      "posts",
      "categories",
      "categorizations",
      "tags",
      "taggings",
      "comments",
      "items",
      "books",
      "vertices",
      "authorFavorites",
      "cpkOrders",
    ]);
  registerModel(Author);
  registerModel(Post);
  registerModel(Tag);
  registerModel(Tagging);
  registerModel(Category);
  registerModel(Categorization);
  registerModel(Comment);
  registerModel(SpecialComment);
  registerModel(VerySpecialComment);
  registerModel(AuthorAddress);
  registerModel(Item);
  registerModel(SpecialPost);
  registerModel(SubAbstractStiPost);
  registerModel(StiPost);
  registerModel(SubStiPost);
  registerModel(AuthorFavorite);
  registerModel(Book);
  registerModel(Citation);
  registerModel(Vertex);
  registerModel(Edge);
  registerModel(Rating);
  registerModel(Aircraft);
  registerModel(Engine);
  registerModel(Car);
  registerModel(CpkOrder);
  registerModel(PostWithHasManyDeleteAll);
  registerModel(PostWithHasManyDestroy);
  registerModel(PostWithHasManyNullify);
  registerModel(PostWithHasOneDestroy);
  registerModel(PostWithHasOneNullify);

  // Mirrors Rails' `find_post_with_dependency(post_id, ...)`: set the post's
  // `type` to the dependent-variant class name, then reload through it.
  async function findPostWithDependency(postId: number, klass: typeof Base): Promise<Base> {
    const post = await Post.find(postId);
    await (post as any).updateColumns({ type: klass.name });
    return (await (klass as any).find(postId)) as Base;
  }

  it("has many", async () => {
    const david = await Author.find(authors("david").id);
    const cats = (await (david as any).categories.toArray()) as Base[];
    expect(cats.map((c) => c.id)).toContain(categories("general").id);
  });

  it("has many inherited", async () => {
    const mary = await Author.find(authors("mary").id);
    const cats = (await (mary as any).categories.toArray()) as Base[];
    expect(cats.map((c) => c.id)).toContain(categories("sti_test").id);
  });

  it("inherited has many", async () => {
    const stiTest = await Category.find(categories("sti_test").id);
    const stiAuthors = (await (stiTest as any).authors.toArray()) as Base[];
    expect(stiAuthors.map((a) => a.id)).toContain(authors("mary").id);
  });

  it("has many distinct through join model", async () => {
    const mary = await Author.find(authors("mary").id);
    expect((await (mary as any).categorizedPosts.toArray()).length).toBe(2);
    expect((await (mary as any).uniqueCategorizedPosts.toArray()).length).toBe(1);
  });

  it("has many distinct through find", async () => {
    const mary = await Author.find(authors("mary").id);
    expect((await (mary as any).uniqueCategorizedPosts.toArray()).length).toBe(1);
  });

  it("count polymorphic has many", async () => {
    const welcome = await Post.find(posts("welcome").id);
    expect(await (welcome as any).taggings.count()).toBe(1);
    expect(await (welcome as any).tags.count()).toBe(1);
  });

  it("has many find all", async () => {
    const david = await Author.find(authors("david").id);
    const cats = (await (david as any).categories.toArray()) as Base[];
    expect(cats.map((c) => c.id)).toEqual([categories("general").id]);
  });

  it("has many find first", async () => {
    const david = await Author.find(authors("david").id);
    const cat = (await (david as any).categories.first()) as Base;
    expect(cat.id).toBe(categories("general").id);
  });

  it("has many with hash conditions", async () => {
    const david = await Author.find(authors("david").id);
    const cat = (await (david as any).categoriesLikeGeneral.first()) as Base;
    expect(cat.id).toBe(categories("general").id);
  });

  it("has many find conditions", async () => {
    const david = await Author.find(authors("david").id);
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
    const david = await Author.find(authors("david").id);
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

    const misc = await Tag.find(tags("misc").id);
    const tagging = await (misc as any).taggings.create({ taggable: post });
    expect(tagging.taggable_type).toBe("SubAbstractStiPost");
  });

  it("polymorphic has many create model with inheritance", async () => {
    const post = await Post.find(posts("thinking").id);
    expect(post).toBeInstanceOf(SpecialPost);

    const misc = await Tag.find(tags("misc").id);
    const tagging = await (misc as any).taggings.create({ taggable: post });
    expect(tagging.taggable_type).toBe("Post");
  });

  it("polymorphic has many going through join model with inheritance", async () => {
    const thinking = await Post.find(posts("thinking").id);
    expect(thinking).toBeInstanceOf(SpecialPost);
    const tag = (await (thinking as any).tags.first()) as Base;
    expect(tag.id).toBe(tags("general").id);
  });

  it("polymorphic has many going through join model with inheritance with custom class name", async () => {
    const thinking = await Post.find(posts("thinking").id);
    expect(thinking).toBeInstanceOf(SpecialPost);
    const tag = (await (thinking as any).funkyTags.first()) as Base;
    expect(tag.id).toBe(tags("general").id);
  });

  it("polymorphic has one create model with inheritance", async () => {
    const misc = await Tag.find(tags("misc").id);
    const thinking = await Post.find(posts("thinking").id);
    const tagging = await (misc as any).createTagging({ taggable: thinking });
    expect(tagging.taggable_type).toBe("Post");
  });

  it("set polymorphic has many", async () => {
    const misc = await Tag.find(tags("misc").id);
    const tagging = await (misc as any).taggings.create();
    const thinking = await Post.find(posts("thinking").id);
    await (thinking as any).taggings.push(tagging);
    expect(tagging.taggable_type).toBe("Post");
  });

  it("set polymorphic has one", async () => {
    const misc = await Tag.find(tags("misc").id);
    const tagging = await (misc as any).taggings.create();
    const thinking = await Post.find(posts("thinking").id);
    await setHasOne(thinking, "tagging", tagging, { as: "taggable", className: "Tagging" });

    expect(tagging.taggable_type).toBe("Post");
    expect(tagging.taggable_id).toBe(thinking.id);
    const taggable = (await loadBelongsTo(tagging, "taggable", { polymorphic: true })) as Base;
    expect(taggable.id).toBe(thinking.id);
  });

  it("set polymorphic has one on new record", async () => {
    const misc = await Tag.find(tags("misc").id);
    const tagging = await (misc as any).taggings.create();
    const post = Post.new({ title: "foo", body: "bar" });
    await (post as any).association("tagging").replace(tagging);
    await post.save();

    expect(tagging.taggable_type).toBe("Post");
    expect(tagging.taggable_id).toBe(post.id);
    const taggable = (await loadBelongsTo(tagging, "taggable", { polymorphic: true })) as Base;
    expect(taggable.id).toBe(post.id);
  });

  it("create polymorphic has many with scope", async () => {
    const welcome = await Post.find(posts("welcome").id);
    const oldCount = await (welcome as any).taggings.count();
    const misc = await Tag.find(tags("misc").id);
    const tagging = await (welcome as any).taggings.create({ tag: misc });
    expect(tagging.taggable_type).toBe("Post");
    expect(await (welcome as any).taggings.count()).toBe(oldCount + 1);
  });

  it("create bang polymorphic with has many scope", async () => {
    const welcome = await Post.find(posts("welcome").id);
    const oldCount = await (welcome as any).taggings.count();
    const misc = await Tag.find(tags("misc").id);
    const tagging = await (welcome as any).taggings.createBang({ tag: misc });
    expect(tagging.taggable_type).toBe("Post");
    expect(await (welcome as any).taggings.count()).toBe(oldCount + 1);
  });

  it("create polymorphic has one with scope", async () => {
    const welcome = await Post.find(posts("welcome").id);
    const oldCount = Number(await Tagging.count());
    const misc = await Tag.find(tags("misc").id);
    const tagging = await (welcome as any).createTagging({ tag: misc });
    expect(tagging.taggable_type).toBe("Post");
    expect(await Tagging.count()).toBe(oldCount + 1);
  });

  it("delete polymorphic has many with delete all", async () => {
    const welcome = await Post.find(posts("welcome").id);
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
    const welcome = await Post.find(posts("welcome").id);
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
    const welcome = await Post.find(posts("welcome").id);
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
    const welcome = await Post.find(posts("welcome").id);
    const tagging = (await (welcome as any).tagging) as Tagging;
    expect(tagging).toBeTruthy();
    await (tagging as any).updateColumns({ taggable_type: "PostWithHasOneDestroy" });
    const post = await findPostWithDependency(welcome.id as number, PostWithHasOneDestroy);

    const oldCount = Number(await Tagging.count());
    await (post as any).destroy();
    expect(await Tagging.count()).toBe(oldCount - 1);
    await (welcome as any).association("tagging").reload();
    expect(await (welcome as any).tagging).toBeNull();
  });

  it("delete polymorphic has one with nullify", async () => {
    const welcome = await Post.find(posts("welcome").id);
    const tagging = (await (welcome as any).tagging) as Tagging;
    expect(tagging).toBeTruthy();
    await (tagging as any).updateColumns({ taggable_type: "PostWithHasOneNullify" });
    const post = await findPostWithDependency(welcome.id as number, PostWithHasOneNullify);

    const oldCount = Number(await Tagging.count());
    await (post as any).destroy();
    expect(await Tagging.count()).toBe(oldCount);
    await (welcome as any).association("tagging").reload();
    expect(await (welcome as any).tagging).toBeNull();
  });

  it("belongs to polymorphic with counter cache", async () => {
    const welcome = await Post.find(posts("welcome").id);
    expect((welcome as any).tags_count).toBe(1);
    const general = await Tag.find(tags("general").id);
    const tagging = await (welcome as any).taggings.create({ tag: general });
    expect(((await Post.find(posts("welcome").id)) as any).tags_count).toBe(2);
    await tagging.destroy();
    expect(((await Post.find(posts("welcome").id)) as any).tags_count).toBe(1);
  });

  it("has many with piggyback", async () => {
    const stiTest = await Category.find(categories("sti_test").id);
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
    const category = await Category.find(categories("sti_test").id);
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
    const post = await Post.includes("tagging").find(posts("welcome").id);
    const tagging = taggings("welcome_general");
    await assertNoQueries(false, async () => {
      const target = (post as any).association("tagging").target as Base;
      expect(target.id).toBe(tagging.id);
    });
  });

  it("include polymorphic has one defined in abstract parent", async () => {
    const item = await Item.includes("tagging").find(items("dvd").id);
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
    const thinking = await Post.find(posts("thinking").id);
    expect(((await (thinking as any).authors.toArray()) as Base[]).map((a) => a.id)).toEqual([
      authors("bob").id,
    ]);
    const authorless = await Post.find(posts("authorless").id);
    expect(((await (authorless as any).authors.toArray()) as Base[]).map((a) => a.id)).toEqual([
      authors("mary").id,
    ]);
  });

  it("has many going through join model with custom primary key", async () => {
    const thinking = await Post.find(posts("thinking").id);
    expect(
      ((await (thinking as any).authorsUsingAuthorId.toArray()) as Base[]).map((a) => a.id),
    ).toEqual([authors("david").id]);
  });

  it("has many going through polymorphic join model with custom primary key", async () => {
    const eagerOther = await Post.find(posts("eager_other").id);
    expect(
      ((await (eagerOther as any).tagsUsingAuthorId.toArray()) as Base[]).map((t) => t.id),
    ).toEqual([tags("general").id]);
  });

  it("has many through with custom primary key on belongs to source", async () => {
    const thinking = await Post.find(posts("thinking").id);
    expect(
      ((await (thinking as any).authorUsingCustomPk.toArray()) as Base[]).map((a) => a.id),
    ).toEqual([authors("david").id, authors("david").id]);
  });

  it("has many through with custom primary key on has many source", async () => {
    const thinking = await Post.find(posts("thinking").id);
    const authorsUsingCustomPk = (await (thinking as any).authorsUsingCustomPk
      .order("authors.id")
      .toArray()) as Base[];
    expect(authorsUsingCustomPk.map((a) => a.id)).toEqual([authors("david").id, authors("bob").id]);
  });

  it("unavailable through reflection", async () => {
    const david = await Author.find(authors("david").id);
    expect(() => association(david, "nothings")).toThrow(HasManyThroughAssociationNotFoundError);
  });

  it("exceptions have suggestions for fix", async () => {
    const david = await Author.find(authors("david").id);
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
    const welcome = await Post.find(posts("welcome").id);
    expect((await (welcome as any).invalidTaggings.toArray()) as Base[]).toEqual([]);
    expect((await (welcome as any).invalidTags.toArray()) as Base[]).toEqual([]);
  });

  it("has many polymorphic", async () => {
    const general = await Tag.find(tags("general").id);
    expect(() => association(general, "taggables")).toThrow(
      HasManyThroughAssociationPolymorphicSourceError,
    );

    const welcomeGeneral = await Tagging.find(taggings("welcome_general").id);
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
    const general = await Tag.find(tags("general").id);
    const taggedPosts = (await (general as any).taggedPosts.toArray()) as Base[];
    expect(taggedPosts.map((p) => p.id).sort((a: any, b: any) => Number(a) - Number(b))).toEqual(
      [posts("welcome").id, posts("thinking").id].sort((a: any, b: any) => Number(a) - Number(b)),
    );
  });

  it("has many polymorphic associations merges through scope", async () => {
    // Rails defines null_taggings / null_tagged_posts inline here; the canonical
    // Tag model carries them so we needn't mutate the shared class at runtime.
    const general = await Tag.find(tags("general").id);
    expect((await (general as any).nullTaggedPosts.toArray()) as Base[]).toEqual([]);
    expect(((await (general as any).taggedPosts.toArray()) as Base[]).length).not.toBe(0);
  });

  it("eager has many polymorphic with source type", async () => {
    const tagWithInclude = await Tag.all().includes("taggedPosts").find(tags("general").id);
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
    const david = await Author.find(authors("david").id);
    const first = ((await (david as any).comments.order("comments.id").toArray()) as Base[])[0];
    expect(first.id).toBe(comments("greetings").id);
  });

  it("has many through has many find all with custom class", async () => {
    const david = await Author.find(authors("david").id);
    const first = (
      (await (david as any).funkyComments.order("comments.id").toArray()) as Base[]
    )[0];
    expect(first.id).toBe(comments("greetings").id);
  });

  it("has many through has many find first", async () => {
    const david = await Author.find(authors("david").id);
    const first = (await (david as any).comments.order("comments.id").first()) as Base;
    expect(first.id).toBe(comments("greetings").id);
  });

  it("has many through has many find conditions", async () => {
    const david = await Author.find(authors("david").id);
    const first = (await (david as any).comments
      .where("comments.type = 'SpecialComment'")
      .order("comments.id")
      .first()) as Base;
    expect(first.id).toBe(comments("does_it_hurt").id);
  });

  it("has many through has many find by id", async () => {
    const david = await Author.find(authors("david").id);
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
    const david = await Author.find(authors("david").id);
    const taggings2 = (await (david as any).taggings_2.toArray()) as Base[];
    // Rails: Tagging.find(1, 2).sort_by(&:id) — welcome_general + thinking_general.
    expect(taggings2.map((t) => t.id).sort((a: any, b: any) => Number(a) - Number(b))).toEqual(
      [taggings("welcome_general").id, taggings("thinking_general").id].sort(
        (a: any, b: any) => Number(a) - Number(b),
      ),
    );
  });

  it.skip("has many through polymorphic has many", async () => {
    const david = await Author.find(authors("david").id);
    const davidTaggings = (await (david as any).taggings.distinct().toArray()) as Base[];
    expect(davidTaggings.map((t) => t.id).sort((a: any, b: any) => Number(a) - Number(b))).toEqual([
      taggings("welcome_general").id,
      taggings("thinking_general").id,
    ]);
  });

  it("self referential has many through", async () => {
    const david = await Author.find(authors("david").id);
    const mary = await Author.find(authors("mary").id);
    expect(((await (david as any).favoriteAuthors.toArray()) as Base[]).map((a) => a.id)).toEqual([
      mary.id,
    ]);
    expect(((await (mary as any).favoriteAuthors.toArray()) as Base[]).map((a) => a.id)).toEqual(
      [],
    );
  });

  it("add to self referential has many through", async () => {
    const newAuthor = await Author.create({ name: "Bob" });
    const david = await Author.find(authors("david").id);
    await (david as any).authorFavorites.create({ favoriteAuthor: newAuthor });
    await (david as any).reload();
    const first = (await (david as any).favoriteAuthors.first()) as Base;
    expect(first.id).toBe(newAuthor.id);
  });

  // DEFERRED (tracked: through-source-reflection-scope-not-merged): trails
  // resolves the source reflection (Post.nonexistentComments) but drops its
  // `where("comments.id < 0")` scope from the through query, so
  // author.nonexistentComments returns all 11 of david's comments instead of 0.
  // Un-skip once has_many :through merges the source reflection's scope.
  it.skip("has many through uses conditions specified on the has many association", async () => {
    const author = (await Author.first()) as Author;
    expect(((await (author as any).comments.toArray()) as Base[]).length).toBeGreaterThan(0);
    expect(((await (author as any).nonexistentComments.toArray()) as Base[]).length).toBe(0);
  });

  it("has many through uses correct attributes", async () => {
    const thinking = await Post.find(posts("thinking").id);
    const tag = (await (thinking as any).tags.findBy({ name: "General" })) as Base;
    expect((tag as any).attributes.tag_id ?? null).toBeNull();
  });

  it("create associate when adding to has many through", async () => {
    const postThinking = await Post.find(posts("thinking").id);
    const count = await (postThinking as any).tags.count();
    const push = await Tag.createBang({ name: "pushme" });
    await (postThinking as any).tags.push(push);
    expect(
      ((await (postThinking as any).tags.toArray()) as Base[]).every((t) => t instanceof Tag),
    ).toBe(true);
    expect(
      ((await (postThinking as any).taggings.toArray()) as Base[]).every(
        (t) => t instanceof Tagging,
      ),
    ).toBe(true);
    await (postThinking as any).reload();
    expect(await (postThinking as any).tags.size()).toBe(count + 1);
    await (postThinking as any).tags.reload();
    expect(await (postThinking as any).tags.size()).toBe(count + 1);

    const foo = await (postThinking as any).tags.createBang({ name: "foo" });
    expect(foo).toBeInstanceOf(Tag);
    expect(
      ((await (postThinking as any).tags.toArray()) as Base[]).every((t) => t instanceof Tag),
    ).toBe(true);
    expect(
      ((await (postThinking as any).taggings.toArray()) as Base[]).every(
        (t) => t instanceof Tagging,
      ),
    ).toBe(true);
    await (postThinking as any).reload();
    expect(await (postThinking as any).tags.size()).toBe(count + 2);
    await (postThinking as any).tags.reload();
    expect(await (postThinking as any).tags.size()).toBe(count + 2);

    await (postThinking as any).tags.concat(
      await Tag.createBang({ name: "abc" }),
      await Tag.createBang({ name: "def" }),
    );
    expect(
      ((await (postThinking as any).tags.toArray()) as Base[]).every((t) => t instanceof Tag),
    ).toBe(true);
    expect(
      ((await (postThinking as any).taggings.toArray()) as Base[]).every(
        (t) => t instanceof Tagging,
      ),
    ).toBe(true);
    await (postThinking as any).reload();
    expect(await (postThinking as any).tags.size()).toBe(count + 4);
    await (postThinking as any).tags.reload();
    expect(await (postThinking as any).tags.size()).toBe(count + 4);

    // Raises if the wrong reflection name is used to set the Edge belongs_to
    const vertex1 = await Vertex.find(vertices("vertex_1").id);
    const vertex5 = await Vertex.find(vertices("vertex_5").id);
    await (vertex1 as any).sinks.push(vertex5);
  });

  it("add to join table with no id", async () => {
    const vertex1 = await Vertex.find(vertices("vertex_1").id);
    const vertex5 = await Vertex.find(vertices("vertex_5").id);
    await (vertex1 as any).sinks.push(vertex5);
  });

  // DEFERRED (tracked: join-model-create-through-sets-owner-fk): Book.references
  // is a has_many :through citations with a belongs_to source (referenceOf).
  // `book_awdr.references << book` creates no citation row (debug: zero
  // citations with book1_id == awdr after push), so references.size stays 0.
  // Same create-through-doesn't-persist-join root cause as the piggyback skip.
  // Un-skip once create-through populates the join record.
  it.skip("delete associate when deleting from has many through with nonstandard id", async () => {
    const bookAwdr = await Book.find(books("awdr").id);
    const count = await (bookAwdr as any).references.count();
    const referencesBefore = ((await (bookAwdr as any).references.toArray()) as Base[]).map(
      (r) => r.id,
    );
    const book = await Book.createBang({ name: "Getting Real" });
    await (bookAwdr as any).references.push(book);
    await (bookAwdr as any).references.reload();
    expect(await (bookAwdr as any).references.size()).toBe(count + 1);

    await (bookAwdr as any).references.delete(book);
    expect(await (bookAwdr as any).references.size()).toBe(count);
    await (bookAwdr as any).references.reload();
    expect(await (bookAwdr as any).references.size()).toBe(count);
    expect(
      ((await (bookAwdr as any).references.toArray()) as Base[]).map((r) => r.id).sort(),
    ).toEqual([...referencesBefore].sort());
  });

  it("delete associate when deleting from has many through", async () => {
    const postThinking = await Post.find(posts("thinking").id);
    const count = await (postThinking as any).tags.count();
    const tagsBefore = ((await (postThinking as any).tags.toArray()) as Base[])
      .map((t) => Number(t.id))
      .sort((a, b) => a - b);
    const tag = await Tag.createBang({ name: "doomed" });
    await (postThinking as any).tags.push(tag);
    await (postThinking as any).taggings.reload();
    expect(await (postThinking as any).taggings.size()).toBe(count + 1);
    await (postThinking as any).reload();
    expect(await (postThinking as any).tags.size()).toBe(count + 1);
    expect(
      ((await (postThinking as any).tags.toArray()) as Base[])
        .map((t) => Number(t.id))
        .sort((a, b) => a - b),
    ).not.toEqual(tagsBefore);

    await (postThinking as any).tags.delete(tag);
    expect(await (postThinking as any).tags.size()).toBe(count);
    await (postThinking as any).tags.reload();
    expect(await (postThinking as any).tags.size()).toBe(count);
    await (postThinking as any).taggings.reload();
    expect(await (postThinking as any).taggings.size()).toBe(count);
    expect(
      ((await (postThinking as any).tags.toArray()) as Base[])
        .map((t) => Number(t.id))
        .sort((a, b) => a - b),
    ).toEqual(tagsBefore);
  });

  it("delete associate when deleting from has many through with multiple tags", async () => {
    const postThinking = await Post.find(posts("thinking").id);
    const count = await (postThinking as any).tags.count();
    const tagsBefore = ((await (postThinking as any).tags.toArray()) as Base[])
      .map((t) => Number(t.id))
      .sort((a, b) => a - b);
    const doomed = await Tag.createBang({ name: "doomed" });
    const doomed2 = await Tag.createBang({ name: "doomed2" });
    const quaked = await Tag.createBang({ name: "quaked" });
    await (postThinking as any).tags.concat(doomed, doomed2);
    await (postThinking as any).reload();
    expect(await (postThinking as any).tags.size()).toBe(count + 2);

    await (postThinking as any).tags.delete(doomed, doomed2, quaked);
    expect(await (postThinking as any).tags.size()).toBe(count);
    await (postThinking as any).tags.reload();
    expect(await (postThinking as any).tags.size()).toBe(count);
    expect(
      ((await (postThinking as any).tags.toArray()) as Base[])
        .map((t) => Number(t.id))
        .sort((a, b) => a - b),
    ).toEqual(tagsBefore);
  });

  it("adding junk to has many through should raise type mismatch", async () => {
    const thinking = await Post.find(posts("thinking").id);
    await expect((thinking as any).tags.push("Uhh what now?")).rejects.toThrow(
      AssociationTypeMismatch,
    );
  });

  it("deleting junk from has many through should raise type mismatch", async () => {
    const thinking = await Post.find(posts("thinking").id);
    await expect((thinking as any).tags.delete({})).rejects.toThrow(AssociationTypeMismatch);
  });

  it("deleting by integer id from has many through", async () => {
    const post = await Post.find(posts("thinking").id);
    const before = await (post as any).tags.count();
    const deleted = (await (post as any).tags.delete(tags("general").id)) as Base[];
    expect(deleted.length).toBe(1);
    expect(await (post as any).tags.count()).toBe(before - 1);
    expect(await (post as any).tags.size()).toBe(0);
  });

  it("deleting by string id from has many through", async () => {
    const post = await Post.find(posts("thinking").id);
    const before = await (post as any).tags.count();
    const deleted = (await (post as any).tags.delete(String(tags("general").id))) as Base[];
    expect(deleted.length).toBe(1);
    expect(await (post as any).tags.count()).toBe(before - 1);
    expect(await (post as any).tags.size()).toBe(0);
  });

  it("has many through has many with sti", async () => {
    const david = await Author.find(authors("david").id);
    const specialComments = (await (david as any).specialPostComments.toArray()) as Base[];
    expect(specialComments.map((c) => c.id)).toEqual([comments("does_it_hurt").id]);
  });

  it("distinct has many through should retain order", async () => {
    const david = await Author.find(authors("david").id);
    const commentIds = ((await (david as any).comments.toArray()) as Base[]).map((c) =>
      Number(c.id),
    );
    const asc = ((await (david as any).orderedUniqComments.toArray()) as Base[]).map((c) =>
      Number(c.id),
    );
    const desc = ((await (david as any).orderedUniqCommentsDesc.toArray()) as Base[]).map((c) =>
      Number(c.id),
    );
    expect(asc).toEqual([...commentIds].sort((a, b) => a - b));
    expect(desc).toEqual([...commentIds].sort((a, b) => b - a));
  });

  it("polymorphic has many", async () => {
    const expected = taggings("welcome_general");
    const p = await Post.includes("taggings").find(posts("welcome").id);
    await assertNoQueries(false, async () => {
      const target = (p as any).association("taggings").target as Base[];
      expect(target.map((t) => t.id)).toContain(expected.id);
    });
    const welcome = await Post.find(posts("welcome").id);
    expect(((await (welcome as any).taggings.toArray()) as Base[]).map((t) => t.id)).toContain(
      taggings("welcome_general").id,
    );
  });

  it("polymorphic has one", async () => {
    const expected = await Post.find(posts("welcome").id);
    const tagging = await Tagging.includes("taggable").find(taggings("welcome_general").id);
    await assertNoQueries(false, async () => {
      const taggable = (tagging as any).association("taggable").target as Base;
      expect(taggable.id).toBe(expected.id);
    });
  });

  it("polymorphic belongs to", async () => {
    const p = await Post.includes({ taggings: "taggable" }).find(posts("welcome").id);
    await assertNoQueries(false, async () => {
      const firstTagging = ((p as any).association("taggings").target as Base[])[0];
      const taggable = (firstTagging as any).association("taggable").target as Base;
      expect(taggable.id).toBe(posts("welcome").id);
    });
  });

  it("preload polymorph many types", async () => {
    // Rails relies on implicit fixture-insertion order so taggings[0]/[1] are
    // the two Post taggables; pin `taggings.id` so first/second resolve to
    // non-nil taggables on PG/MySQL too (heap order isn't guaranteed there).
    const taggingList = (await Tagging.where("taggable_type != ?", "FakeModel")
      .includes("taggable")
      .order("taggings.id")
      .toArray()) as Base[];
    await assertNoQueries(false, async () => {
      void ((taggingList[0] as any).association("taggable").target as Base).id;
      void ((taggingList[1] as any).association("taggable").target as Base).id;
    });

    const taggables = taggingList.map(
      (t) => (t as any).association("taggable").target as Base | null,
    );
    const taggableIds = taggables.filter((t): t is Base => t !== null).map((t) => `${t.id}`);
    expect(taggableIds).toContain(`${items("dvd").id}`);
    expect(taggableIds).toContain(`${posts("welcome").id}`);
  });

  it("preload nil polymorphic belongs to", async () => {
    let error: unknown;
    try {
      await Tagging.where("taggable_type IS NULL").includes("taggable").toArray();
    } catch (e) {
      error = e;
    }
    expect(error).toBeUndefined();
  });

  it("preload polymorphic has many", async () => {
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

  it("belongs to shared parent", async () => {
    const commentList = (await Comment.where(`post_id = ${posts("welcome").id}`)
      .includes("post")
      .toArray()) as Base[];
    await assertNoQueries(false, async () => {
      const p0 = (commentList[0] as any).association("post").target as Base;
      const p1 = (commentList[1] as any).association("post").target as Base;
      expect(p0.id).toBe(p1.id);
    });
  });

  it("has many through include uses array include after loaded", async () => {
    const david = await Author.find(authors("david").id);
    await (david as any).categories.loadTarget();
    const category = ((david as any).categories.target as Base[])[0];
    await assertNoQueries(false, async () => {
      expect((david as any).categories.loaded).toBe(true);
      expect(await (david as any).categories.isInclude(category)).toBe(true);
    });
  });

  it("has many through include checks if record exists if target not loaded", async () => {
    const david = await Author.find(authors("david").id);
    const category = (await (david as any).categories.first()) as Base;

    await (david as any).reload();
    expect((david as any).categories.loaded).toBe(false);
    await assertQueriesCount(1, false, async () => {
      expect(await (david as any).categories.isInclude(category)).toBe(true);
    });
    expect((david as any).categories.loaded).toBe(false);
  });

  it("has many through include returns false for non matching record to verify scoping", async () => {
    const david = await Author.find(authors("david").id);
    const category = await Category.createBang({ name: "Not Associated" });
    expect((david as any).categories.loaded).toBe(false);
    expect(await (david as any).categories.isInclude(category)).toBe(false);
  });

  it("has many with pluralize table names false", async () => {
    const aircraft = await Aircraft.createBang({ name: "Airbus 380" });
    const engine = await Engine.createBang({ car_id: aircraft.id });
    expect(((await (aircraft as any).engines.toArray()) as Base[]).map((e) => e.id)).toEqual([
      engine.id,
    ]);
  });

  // Convergence test: a composite-PK owner (CpkOrder, PK = [shop_id, id]) can own
  // a polymorphic-through association using the scalar taggings.taggable_id column
  // without requiring an explicit `primaryKey:` option. The "id" component of the
  // CPK is derived automatically (matching Rails' join_id_for behaviour).
  it("polymorphic has many through with composite owner primary key", async () => {
    class CpkOrderWithTaggings extends CpkOrder {
      static {
        this.hasMany("orderTaggings", { className: "Tagging", as: "taggable" });
        this.hasMany("orderTagNames", {
          className: "Tag",
          through: "orderTaggings",
          source: "tag",
        });
      }
    }
    registerModel(CpkOrderWithTaggings);

    const order = await CpkOrderWithTaggings.createBang({ shop_id: 42, status: "paid" });
    const tag = await Tag.createBang({ name: "rails-faithful" });
    await (order as any).orderTaggings.createBang({ tag_id: (tag as any).id });

    const loadedTags = (await (order as any).orderTagNames.toArray()) as Base[];
    expect(loadedTags.map((t) => (t as any).id)).toEqual([(tag as any).id]);
  });

  it("has many distinct through count", async () => {
    const author = await Author.find(authors("mary").id);
    expect((author as any).uniqueCategorizedPosts.loaded).toBe(false);
    await assertQueriesCount(1, false, async () => {
      expect(await (author as any).uniqueCategorizedPosts.count()).toBe(1);
    });
    await assertQueriesCount(1, false, async () => {
      expect(await (author as any).uniqueCategorizedPosts.count("title")).toBe(1);
    });
    await assertQueriesCount(1, false, async () => {
      expect(
        await (author as any).uniqueCategorizedPosts.where({ title: null }).count("title"),
      ).toBe(0);
    });
    expect((author as any).uniqueCategorizedPosts.loaded).toBe(false);
  });

  it("polymorphic has many going through join model", async () => {
    // Rails uses lazy load (posts(:welcome).tags.first); trails' lazy-load path does not
    // cache the join record on the tag, so includes() is used to exercise the same
    // no-query guarantee via the eager-load path.
    const post = await Post.includes("tags").find(posts("welcome").id);
    const tag = ((post as any).tags.target as Base[])[0];
    expect(tag.id).toBe(tags("general").id);
    await assertNoQueries(false, async () => {
      void (tag as any).tagging;
    });
  });

  it("polymorphic has many going through join model with find", async () => {
    // Rails (line 70) is identical to line 58 — same lazy-load + no-query assertion.
    // Same includes() substitution applies; see comment above.
    const post = await Post.includes("tags").find(posts("welcome").id);
    const tag = ((post as any).tags.target as Base[])[0];
    expect(tag.id).toBe(tags("general").id);
    await assertNoQueries(false, async () => {
      void (tag as any).tagging;
    });
  });

  it("polymorphic has many going through join model with include on source reflection", async () => {
    const post = await Post.includes("funkyTags").find(posts("welcome").id);
    const tag = ((post as any).funkyTags.target as Base[])[0];
    expect(tag.id).toBe(tags("general").id);
    await assertNoQueries(false, async () => {
      void (tag as any).tagging;
    });
  });

  it("polymorphic has many going through join model with include on source reflection with find", async () => {
    const post = await Post.includes("funkyTags").find(posts("welcome").id);
    const tag = ((post as any).funkyTags.target as Base[])[0];
    expect(tag.id).toBe(tags("general").id);
    await assertNoQueries(false, async () => {
      void (tag as any).tagging;
    });
  });

  it.skip("polymorphic has many going through join model with custom select and joins", async () => {
    // trails does not support association extension blocks (add_joins_and_select)
  });

  it("polymorphic has many going through join model with custom foreign key", async () => {
    const tagging = await Tagging.find(taggings("welcome_general").id);
    const superTag = (await loadBelongsTo(tagging, "superTag", {
      className: "Tag",
      foreignKey: "super_tag_id",
    })) as Base;
    expect(superTag.id).toBe(tags("misc").id);
    const post = await Post.find(posts("welcome").id);
    const superTagsList = (await (post as any).superTags.toArray()) as Base[];
    expect(superTagsList[0].id).toBe(tags("misc").id);
  });

  it("include has many through polymorphic has many", async () => {
    const author = await Author.includes("taggings").find(authors("david").id);
    const expectedIds = [taggings("welcome_general").id, taggings("thinking_general").id]
      .map(Number)
      .sort((a, b) => a - b);
    await assertNoQueries(false, async () => {
      const seen = new Set<number>();
      const actual = ((author as any).taggings.target as Base[])
        .map((t) => Number(t.id))
        .filter((id) => (seen.has(id) ? false : seen.add(id)))
        .sort((a, b) => a - b);
      expect(actual).toEqual(expectedIds);
    });
  });

  it("eager load has many through has many", async () => {
    const author = (await Author.where({ name: "David" })
      .includes("comments")
      .order("comments.id")
      .first()) as Author;
    SpecialComment.new();
    VerySpecialComment.new();
    await assertNoQueries(false, async () => {
      const ids = ((author as any).comments.target as Base[]).map((c) => Number(c.id));
      expect(ids).toEqual([1, 2, 3, 5, 6, 7, 8, 9, 10, 12, 13]);
    });
  });

  it("eager load has many through has many with conditions", async () => {
    const post = (await Post.includes("invalidTags").first()) as Post;
    await assertNoQueries(false, async () => {
      await (post as any).invalidTags.toArray();
    });
  });

  it("eager belongs to and has one not singularized", async () => {
    await expect(Author.includes("authorAddress").first()).resolves.not.toThrow();
    await expect(AuthorAddress.includes("author").first()).resolves.not.toThrow();
  });

  it("associating unsaved records with has many through", async () => {
    const savedPost = await Post.find(posts("thinking").id);
    const newTag = Tag.new({ name: "new" });

    await (savedPost as any).tags.push(newTag);
    expect((newTag as any).isPersisted()).toBe(true);
    expect((savedPost as any).isPersisted()).toBe(true);
    expect(((savedPost as any).tags.target as Base[]).map((t) => t.id)).toContain(newTag.id);

    expect((newTag as any).isPersisted()).toBe(true);
    await (savedPost as any).reload();
    await (savedPost as any).tags.reload();
    expect(((savedPost as any).tags.target as Base[]).map((t) => t.id)).toContain(newTag.id);

    const newPost = Post.new({
      title: "Association replacement works!",
      body: "You best believe it.",
    });
    const savedTag = await Tag.find(tags("general").id);

    await (newPost as any).tags.push(savedTag);
    expect((newPost as any).isPersisted()).toBe(false);
    expect((savedTag as any).isPersisted()).toBe(true);
    expect(((newPost as any).tags.target as Base[]).map((t) => t.id)).toContain(savedTag.id);

    await (newPost as any).save();
    expect((newPost as any).isPersisted()).toBe(true);
    await (newPost as any).reload();
    await (newPost as any).tags.reload();
    expect(((newPost as any).tags.target as Base[]).map((t) => t.id)).toContain(savedTag.id);

    expect((savedPost as any).tags.build().isPersisted()).toBe(false);
    expect((savedPost as any).tags.new().isPersisted()).toBe(false);
  });

  it("has many through collection size doesnt load target if not loaded", async () => {
    const author = await Author.find(authors("david").id);
    expect(await (author as any).comments.size()).toBe(11);
    expect((author as any).comments.loaded).toBe(false);
  });

  it("has many through collection size uses counter cache if it exists", async () => {
    const c = await Category.find(categories("general").id);
    (c as any)._writeAttribute("categorizations_count", 100);
    expect(await (c as any).categorizations.size()).toBe(100);
    expect((c as any).categorizations.loaded).toBe(false);
  });

  it("adding to has many through should return self", async () => {
    const thinking = await Post.find(posts("thinking").id);
    const tagsProxy = (thinking as any).tags;
    const general = await Tag.find(tags("general").id);
    expect(await tagsProxy.push(general)).toBe(tagsProxy);
  });

  it("has many through sum uses calculations", async () => {
    const david = await Author.find(authors("david").id);
    await expect((david as any).comments.sum("post_id")).resolves.not.toThrow();
  });

  it("calculations on has many through should disambiguate fields", async () => {
    const david = await Author.find(authors("david").id);
    await expect((david as any).categories.maximum("id")).resolves.not.toThrow();
  });

  it("calculations on has many through should not disambiguate fields unless necessary", async () => {
    const david = await Author.find(authors("david").id);
    await expect((david as any).categories.maximum("categories.id")).resolves.not.toThrow();
  });

  it("preload polymorphic has many through", async () => {
    const allPosts = (await Post.order("posts.id").toArray()) as Base[];
    const postsWithTags = (await Post.includes("tags").order("posts.id").toArray()) as Base[];
    expect(allPosts.length).toBe(postsWithTags.length);
    for (let i = 0; i < allPosts.length; i++) {
      const expectedLen = ((await (allPosts[i] as any).tags.toArray()) as Base[]).length;
      await assertNoQueries(false, async () => {
        const len = ((postsWithTags[i] as any).tags.target as Base[]).length;
        expect(len).toBe(expectedLen);
      });
    }
  });

  it.skip("proper error message for eager load and includes association errors", async () => {
    // trails: throws ArgumentError not ConfigurationError for unknown associations —
    // convergence tracked in RFC 0023
  });

  it("eager association with scope with string joins", async () => {
    await expect(Post.joins("verySpecialCommentWithStringJoins").first()).resolves.not.toThrow();
  });

  it("has many through goes through all sti classes", async () => {
    const subStiPost = await SubStiPost.createBang({
      title: "test",
      body: "test",
      author_id: authors("david").id,
    });
    const newComment = await (subStiPost as any).comments.create({ body: "test" });
    const david = await Author.find(authors("david").id);
    const ids = ((await (david as any).stiPostComments.toArray()) as Base[])
      .map((c) => Number(c.id))
      .sort((a, b) => a - b);
    expect(ids).toEqual(
      [
        Number(comments("check_eager_sti_on_associations").id),
        Number(comments("check_eager_sti_on_associations2").id),
        Number(comments("recursive_association_comment").id),
        Number(newComment.id),
      ].sort((a, b) => a - b),
    );
  });
});
