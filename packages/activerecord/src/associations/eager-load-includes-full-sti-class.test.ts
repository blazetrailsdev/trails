/**
 * Mirrors Rails
 * activerecord/test/cases/associations/eager_load_includes_full_sti_class_test.rb
 *
 * All four classes (FullStiClassNamesTest / NonFullStiClassNamesTest /
 * PolymorphicFullClassNamesTest / PolymorphicNonFullClassNamesTest) toggle
 * `ActiveRecord::Base.store_full_sti_class` / `store_full_class_name` and assert
 * that a polymorphic `taggable` association resolves (or does not resolve)
 * depending on whether the stored type column holds the namespaced or
 * demodulized class name.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { Base } from "../base.js";
import { registerModel } from "../index.js";
import { Tagging } from "../test-helpers/models/tagging.js";
import { Post } from "../test-helpers/models/post.js";
import { setupFixtures } from "../test-helpers/fixtures.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";

// Rails defines `Namespaced::Post` inline (table "posts") with a polymorphic
// has_one :tagging, as: :taggable. trails flattens the `::` into a collision-free
// JS name and declares the Ruby module path via moduleName / _demodulizedName, so
// qualifiedName() reconstructs "Namespaced::Post".
class NamespacedPost extends Base {
  static _tableName = "posts";
  static moduleName = "Namespaced";
  static _demodulizedName = "Post";

  declare title: string;
  declare body: string;
  declare author_id: number;
  declare tagging: Promise<Tagging | null>;
  declare createTagging: (attrs?: Record<string, unknown>) => Promise<Tagging>;

  static {
    this.hasOne("tagging", { as: "taggable", className: "Tagging" });
  }
}

registerModel(Tagging);
registerModel(NamespacedPost);
// Rails loads the canonical Post model in this test's environment; with
// store_full_class_name off the demodulized "Post" type column must resolve to
// it (the polymorphic counter_cache and class lookup both go through it).
registerModel(Post);

function findByTitle(): Promise<NamespacedPost | null> {
  return NamespacedPost.findBy({ title: "Great stuff" });
}

function includesFindByTitle(): Promise<NamespacedPost | null> {
  return NamespacedPost.includes("tagging").findBy({ title: "Great stuff" });
}

function eagerLoadFindByTitle(): Promise<NamespacedPost | null> {
  return NamespacedPost.eagerLoad("tagging").findBy({ title: "Great stuff" });
}

describe("FullStiClassNamesTest", () => {
  runStiSharedTests(true);
});

describe("NonFullStiClassNamesTest", () => {
  runStiSharedTests(false);
});

describe("PolymorphicFullClassNamesTest", () => {
  runPolymorphicSharedTests(true);
});

describe("PolymorphicNonFullClassNamesTest", () => {
  runPolymorphicSharedTests(false);
});

// FullStiClassNamesSharedTest: toggles store_full_sti_class. Because the
// polymorphic taggable_type column is governed by store_full_class_name (which
// stays at its default of true), flipping store_full_sti_class never changes how
// the taggable association resolves — both branches must find the tagging.
function runStiSharedTests(storeFullStiClass: boolean): void {
  setupFixtures();
  useHandlerTransactionalFixtures();

  beforeAll(async () => {
    await NamespacedPost.loadSchema();
    await Tagging.loadSchema();
  });

  let oldStoreFullStiClass: boolean;
  let tagging: Tagging;

  beforeEach(async () => {
    oldStoreFullStiClass = Base.storeFullStiClass;
    Base.storeFullStiClass = storeFullStiClass;

    const post = await NamespacedPost.create({
      title: "Great stuff",
      body: "This is not",
      author_id: 1,
    });
    tagging = await post.createTagging();
  });

  afterEach(() => {
    Base.storeFullStiClass = oldStoreFullStiClass;
  });

  it("class names", async () => {
    Base.storeFullStiClass = !storeFullStiClass;
    let post = await findByTitle();
    expect((await post!.tagging)?.id).toBe(tagging.id);

    Base.storeFullStiClass = storeFullStiClass;
    post = await findByTitle();
    expect((await post!.tagging)?.id).toBe(tagging.id);
  });

  it("class names with includes", async () => {
    Base.storeFullStiClass = !storeFullStiClass;
    let post = await includesFindByTitle();
    expect((await post!.tagging)?.id).toBe(tagging.id);

    Base.storeFullStiClass = storeFullStiClass;
    post = await includesFindByTitle();
    expect((await post!.tagging)?.id).toBe(tagging.id);
  });

  it("class names with eager load", async () => {
    Base.storeFullStiClass = !storeFullStiClass;
    let post = await eagerLoadFindByTitle();
    expect((await post!.tagging)?.id).toBe(tagging.id);

    Base.storeFullStiClass = storeFullStiClass;
    post = await eagerLoadFindByTitle();
    expect((await post!.tagging)?.id).toBe(tagging.id);
  });

  it("class names with find by", async () => {
    const post = await findByTitle();

    Base.storeFullStiClass = !storeFullStiClass;
    expect((await Tagging.findBy({ taggable: post }))?.id).toBe(tagging.id);

    Base.storeFullStiClass = storeFullStiClass;
    expect((await Tagging.findBy({ taggable: post }))?.id).toBe(tagging.id);
  });
}

// PolymorphicFullClassNamesSharedTest: toggles store_full_class_name, which DOES
// govern the polymorphic taggable_type column. When the flag at query time
// disagrees with how the row was written, the type-column value mismatches and
// the association resolves to nil.
function runPolymorphicSharedTests(storeFullClassName: boolean): void {
  setupFixtures();
  useHandlerTransactionalFixtures();

  beforeAll(async () => {
    await NamespacedPost.loadSchema();
    await Tagging.loadSchema();
  });

  let oldStoreFullClassName: boolean;
  let tagging: Tagging;

  beforeEach(async () => {
    oldStoreFullClassName = Base.storeFullClassName;
    Base.storeFullClassName = storeFullClassName;

    const post = await NamespacedPost.create({
      title: "Great stuff",
      body: "This is not",
      author_id: 1,
    });
    tagging = await post.createTagging();
  });

  afterEach(() => {
    Base.storeFullClassName = oldStoreFullClassName;
  });

  it("class names", async () => {
    Base.storeFullClassName = !storeFullClassName;
    let post = await findByTitle();
    expect(await post!.tagging).toBeNull();

    Base.storeFullClassName = storeFullClassName;
    post = await findByTitle();
    expect((await post!.tagging)?.id).toBe(tagging.id);
  });

  it("class names with includes", async () => {
    Base.storeFullClassName = !storeFullClassName;
    let post = await includesFindByTitle();
    expect(await post!.tagging).toBeNull();

    Base.storeFullClassName = storeFullClassName;
    post = await includesFindByTitle();
    expect((await post!.tagging)?.id).toBe(tagging.id);
  });

  it("class names with eager load", async () => {
    Base.storeFullClassName = !storeFullClassName;
    let post = await eagerLoadFindByTitle();
    expect(await post!.tagging).toBeNull();

    Base.storeFullClassName = storeFullClassName;
    post = await eagerLoadFindByTitle();
    expect((await post!.tagging)?.id).toBe(tagging.id);
  });

  it("class names with find by", async () => {
    const post = await findByTitle();

    Base.storeFullClassName = !storeFullClassName;
    expect(await Tagging.findBy({ taggable: post })).toBeNull();

    Base.storeFullClassName = storeFullClassName;
    expect((await Tagging.findBy({ taggable: post }))?.id).toBe(tagging.id);
  });
}
