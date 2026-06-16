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
import { registerModel, type Base } from "../index.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";
import { Tag } from "../test-helpers/models/tag.js";
import { Tagging } from "../test-helpers/models/tagging.js";
import { Category } from "../test-helpers/models/category.js";
import { Categorization } from "../test-helpers/models/categorization.js";

describe("AssociationsJoinModelTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  const { authors, posts, categories, tags } = useHandlerFixtures([
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
    const cats = (await (david as any).categories.toArray()) as Base[];
    expect(cats.some((category: any) => category.name === "General")).toBe(true);
    expect(() => [...cats].sort()).not.toThrow();
  });
});
