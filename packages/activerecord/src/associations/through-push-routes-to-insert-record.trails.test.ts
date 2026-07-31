/**
 * Trails-only: Rails' `CollectionProxy#<<` is `proxy_association.concat(records)`,
 * so every through-collection write lands on
 * `HasManyThroughAssociation#concat_records` → `#insert_record`. Trails carried a
 * second, proxy-local implementation (`_pushThrough`) that wrote the join row
 * itself, so the OO `insert_record` was dead for user-facing pushes. These tests
 * pin the delegation. Rails has no equivalent test: it never had two paths.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "../index.js";
import { Author } from "../test-helpers/models/author.js";
import { Category } from "../test-helpers/models/category.js";
import { Categorization } from "../test-helpers/models/categorization.js";
import { Post } from "../test-helpers/models/post.js";
import { fixtures } from "../test-fixtures.js";
import type { Base } from "../base.js";

interface ThroughAssociationLike {
  target: Base[];
  insertRecord(record: Base, validate?: boolean, raise?: boolean): Promise<boolean>;
}

interface AuthorWithCategories {
  id: unknown;
  categories: {
    target: Base[];
    push(...records: Base[]): Promise<unknown>;
    create(attrs: Record<string, unknown>): Promise<Base>;
  };
  association(name: string): ThroughAssociationLike;
}

/** Record every `insertRecord` the association object receives, then delegate. */
function spyOnInsertRecord(assoc: ThroughAssociationLike): Base[] {
  const seen: Base[] = [];
  const original = assoc.insertRecord.bind(assoc);
  assoc.insertRecord = async (record, validate, raise) => {
    seen.push(record);
    return original(record, validate, raise);
  };
  return seen;
}

describe("through-collection writes route onto the association's insertRecord", () => {
  const { authors, categories } = fixtures(["authors", "posts", "categories", "categorizations"]);

  beforeAll(() => {
    registerModel(Author);
    registerModel(Post);
    registerModel(Category);
    registerModel(Categorization);
  });

  it("push reaches HasManyThroughAssociation#insertRecord", async () => {
    const author = (await Author.find(authors("david").id)) as unknown as AuthorWithCategories;
    const category = (await Category.find(categories("technology").id)) as unknown as Base;
    const assoc = author.association("categories");
    const inserted = spyOnInsertRecord(assoc);

    await author.categories.push(category);

    expect(inserted).toEqual([category]);
    // The join row is the association's work now, not the proxy's.
    expect(
      await Categorization.where({
        author_id: author.id,
        category_id: (category as unknown as { id: unknown }).id,
      }).count(),
    ).toBe(1);
  });

  it("create reaches HasManyThroughAssociation#insertRecord", async () => {
    const author = (await Author.find(authors("david").id)) as unknown as AuthorWithCategories;
    const assoc = author.association("categories");
    const inserted = spyOnInsertRecord(assoc);

    const created = await author.categories.create({ name: "Routed" });

    expect(inserted).toEqual([created]);
  });

  it("the pushed record lands in the one shared target", async () => {
    const author = (await Author.find(authors("david").id)) as unknown as AuthorWithCategories;
    const category = (await Category.find(categories("technology").id)) as unknown as Base;
    const assoc = author.association("categories");

    await author.categories.push(category);

    expect(assoc.target).toBe(author.categories.target);
    expect(assoc.target).toContain(category);
  });
});
