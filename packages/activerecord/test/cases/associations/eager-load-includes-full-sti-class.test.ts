import { DescendantsTracker } from "@blazetrails/activesupport";
import { Namespaced } from "../../models/company.js";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { Base } from "../../../lib/base.js";
import { Tagging } from "../../models/tagging.js";
import { Post } from "../../models/post.js";
import { fixtures } from "../../../lib/test-helpers/use-fixtures.js";

class NamespacedPost extends Base {
  static _tableName = "posts";
  static {
    constSet(Namespaced, "Post", this);
  }

  declare title: string;
  declare body: string;
  declare author_id: number;
  declare tagging: Promise<Tagging | null>;
  declare createTagging: (attrs?: Record<string, unknown>) => Promise<Tagging>;

  static {
    this.hasOne("tagging", { as: "taggable", className: "Tagging" });
  }
}

constSet(TopLevel, "Tagging", Tagging);
constSet(TopLevel, "NamespacedPost", NamespacedPost);
DescendantsTracker.registerSubclass(Base, NamespacedPost);
constSet(TopLevel, "Post", Post);

type FindByTitle = { findByTitle(title: string): Promise<NamespacedPost | null> };

function findByTitle(): Promise<NamespacedPost | null> {
  return (NamespacedPost as unknown as FindByTitle).findByTitle("Great stuff");
}

function includesFindByTitle(): Promise<NamespacedPost | null> {
  return (NamespacedPost.includes(":tagging") as unknown as FindByTitle).findByTitle("Great stuff");
}

function eagerLoadFindByTitle(): Promise<NamespacedPost | null> {
  return (NamespacedPost.eagerLoad(":tagging") as unknown as FindByTitle).findByTitle(
    "Great stuff",
  );
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

function runStiSharedTests(storeFullStiClass: boolean): void {
  fixtures([]);

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

function runPolymorphicSharedTests(storeFullClassName: boolean): void {
  fixtures([]);

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
