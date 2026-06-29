/**
 * Mirrors Rails activerecord/test/cases/associations/eager_test.rb
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  Base,
  registerModel,
  enableSti,
  registerSubclass,
  AssociationNotFoundError,
  EagerLoadPolymorphicError,
} from "../index.js";
import { Notifications } from "@blazetrails/activesupport";
import { HasManyThroughAssociation } from "./has-many-through-association.js";
import { assertNotCalledOnInstanceOf } from "../testing/method-call-assertions.js";
import { defineSchema, type Schema } from "../test-helpers/define-schema.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";
import { useFixtures } from "../test-helpers/use-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { assertNoQueries, assertQueriesCount } from "../testing/query-assertions.js";
import {
  Post,
  FirstPost,
  SpecialPost,
  StiPost,
  PostWithDefaultInclude,
  PostWithDefaultScope,
} from "../test-helpers/models/post.js";
import { Author, AuthorFavorite, AuthorAddress } from "../test-helpers/models/author.js";
import {
  Comment,
  VerySpecialComment,
  SpecialComment,
  SubSpecialComment,
} from "../test-helpers/models/comment.js";
import { Tag, OrderedTag } from "../test-helpers/models/tag.js";
import { Tagging } from "../test-helpers/models/tagging.js";
import { Reader, LazyReader } from "../test-helpers/models/reader.js";
import { Person } from "../test-helpers/models/person.js";
import { Pet } from "../test-helpers/models/pet.js";
import { Owner } from "../test-helpers/models/owner.js";
import { Category, SpecialCategory } from "../test-helpers/models/category.js";
import { Categorization } from "../test-helpers/models/categorization.js";
import {
  Developer,
  EagerDeveloperWithDefaultScope,
  EagerDeveloperWithClassMethodDefaultScope,
  EagerDeveloperWithLambdaDefaultScope,
  EagerDeveloperWithBlockDefaultScope,
  EagerDeveloperWithCallableDefaultScope,
  AuditLog,
} from "../test-helpers/models/developer.js";
import { Company, Firm, Client } from "../test-helpers/models/company.js";
import { Account } from "../test-helpers/models/account.js";
import { Citation } from "../test-helpers/models/citation.js";
import { Book } from "../test-helpers/models/book.js";
import { Subscriber } from "../test-helpers/models/subscriber.js";
import { Subscription } from "../test-helpers/models/subscription.js";
import { ShardedBlog, ShardedBlogPost, ShardedComment } from "../test-helpers/models/sharded.js";
import { captureSql } from "../testing/sql-capture.js";
import { Member } from "../test-helpers/models/member.js";
import { Membership } from "../test-helpers/models/membership.js";
import { Club } from "../test-helpers/models/club.js";
import { Project } from "../test-helpers/models/project.js";
import { Mentor } from "../test-helpers/models/mentor.js";
import { Contract } from "../test-helpers/models/contract.js";
import { Sponsor } from "../test-helpers/models/sponsor.js";
import { Essay } from "../test-helpers/models/essay.js";
import { Job } from "../test-helpers/models/job.js";
import { Matey } from "../test-helpers/models/matey.js";
import { Pirate } from "../test-helpers/models/pirate.js";
import { Reference } from "../test-helpers/models/reference.js";
import { CpkOrder, CpkBook, CpkOrderAgreement } from "../test-helpers/models/cpk.js";

// Mirrors eager_test.rb's `find_all_ordered` helper.
async function findAllOrdered(klass: any, include: unknown = null): Promise<any[]> {
  let relation = klass.order(`${klass.tableName}.${klass.primaryKey}`);
  if (include) relation = relation.includes(include);
  return relation.toArray();
}

// ==========================================================================
// EagerAssociationTest — targets associations/eager_test.rb
// ==========================================================================
describe("EagerAssociationTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  const {
    authors,
    posts,
    companies,
    accounts,
    pirates,
    sponsors,
    subscribers,
    subscriptions,
    books,
    tags,
    people,
    categories,
  } = useFixtures(
    [
      "authors",
      "authorFavorites",
      "authorAddresses",
      "posts",
      "comments",
      "essays",
      "people",
      "readers",
      "categories",
      "companies",
      "accounts",
      "developers",
      "projects",
      "developersProjects",
      "parrots",
      "pirates",
      "mateys",
      "clubs",
      "members",
      "memberships",
      "sponsors",
      "subscribers",
      "subscriptions",
      "books",
      "tags",
    ],
    () => Base.connection,
    { schema: canonicalSchema },
  );
  beforeAll(async () => {
    registerModel(Matey);
    registerModel(Subscriber);
    registerModel(Subscription);
    registerModel(Book);
    registerModel("PostWithDefaultScope", PostWithDefaultScope);
    registerModel(CpkOrder);
    registerModel(CpkBook);
    registerModel(CpkOrderAgreement);
    registerModel(Mentor);
    registerModel(Contract);
    registerModel(AuditLog);
  });
  it("should work inverse of with eager load", async () => {
    const author = authors("david");
    const firstPost = await author.posts.first();
    expect((firstPost as any).association("author").target).toBe(author);
    const eagerFirst = await author.posts.eagerLoad("comments").first();
    expect((eagerFirst as any).association("author").target).toBe(author);
  });
  it("loading conditions with or", async () => {
    const author = authors("david");
    const postArr = await Post.where({ author_id: author.id })
      .references("comments")
      .includes("comments")
      .where("comments.body like 'Normal%' OR comments.type = 'SpecialComment'")
      .toArray();
    expect(postArr.every((p: any) => Number(p.author_id) === Number(author.id))).toBe(true);
  });
  it.skip("loading polymorphic association with mixed table conditions", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/eager.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in eager.test.ts
  });
  it.skip("loading association with string joins", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/eager.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in eager.test.ts
  });
  it.skip("loading with scope including joins", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/eager.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in eager.test.ts
  });
  it.skip("loading association with same table joins", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/eager.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in eager.test.ts
  });
  it.skip("loading association with intersection joins", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/eager.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in eager.test.ts
  });

  it("loading associations dont leak instance state", async () => {
    const assertFirm = (firm: any) => {
      expect(firm.id).toBe(companies("first_firm").id);
      expect(firm.association("readonlyAccount").loaded).toBe(true);
      expect(firm.association("accounts").loaded).toBe(true);
      expect(firm.readonlyAccount.id).toBe(accounts("signals37").id);
      const accts = firm.association("accounts").target;
      expect(accts).toHaveLength(1);
      expect(accts[0].id).toBe(accounts("signals37").id);
      expect(firm.readonlyAccount.isReadonly()).toBe(true);
      expect(accts.every((a: any) => !a.isReadonly())).toBe(true);
    };
    assertFirm(await Firm.preload("readonlyAccount", "accounts").first());
    assertFirm(await Firm.eagerLoad("readonlyAccount", "accounts").first());
  });

  it("with ordering", async () => {
    const list = await Post.all().includes("comments").order("posts.id DESC").toArray();
    const expected = [
      "other_by_mary",
      "other_by_bob",
      "misc_by_mary",
      "misc_by_bob",
      "eager_other",
      "sti_habtm",
      "sti_post_and_comments",
      "sti_comments",
      "authorless",
      "thinking",
      "welcome",
    ] as const;
    expected.forEach((name, index) => {
      expect((list[index] as any).id).toBe(posts(name).id);
    });
  });
  it("has many through with order", async () => {
    const authorsArr = await Author.all().includes("favoriteAuthors").toArray();
    expect(authorsArr.length).toBeGreaterThan(0);
    await assertNoQueries(false, () => {
      authorsArr.map((a: any) => a.favoriteAuthors);
    });
  });
  it("eager loaded has one association with references does not run additional queries", async () => {
    await Post.updateAll({ author_id: null });
    const authorsArr = await Author.all().includes("post").references("post").toArray();
    expect(authorsArr.length).toBeGreaterThan(0);
    await assertNoQueries(false, () => {
      authorsArr.map((a: any) => a.post);
    });
  });
  it("eager loaded has one association without primary key", async () => {
    const pirate = pirates("redbeard");
    const attackerMatey = await (pirate as any).attackerMatey;
    const eagerLoaded = await Pirate.eagerLoad("attackerMatey").where({ id: pirate.id }).first();
    const mateyAttrs = (m: any) => ({
      pirate_id: m?.pirate_id,
      target_id: m?.target_id,
      weight: m?.weight,
    });
    await assertNoQueries(false, () => {
      expect(mateyAttrs((eagerLoaded as any)?.attackerMatey)).toEqual(mateyAttrs(attackerMatey));
    });
  });
  it("eager loaded has many association without primary key", async () => {
    const pirate = pirates("blackbeard");
    const mateysList: Matey[] = await pirate.mateys.toArray();
    const eagerLoaded = await Pirate.eagerLoad("mateys").where({ id: pirate.id }).first();
    expect(mateysList.length).toBeGreaterThan(0);
    const mateyAttrs = (m: any) => ({
      pirate_id: m?.pirate_id,
      target_id: m?.target_id,
      weight: m?.weight,
    });
    await assertNoQueries(false, async () => {
      const eagerMateys: Matey[] = await (eagerLoaded as any).mateys.toArray();
      expect(eagerMateys.map(mateyAttrs)).toEqual(mateysList.map(mateyAttrs));
    });
  });
  it("duplicate middle objects", async () => {
    const commentArr = await Comment.where({ post_id: 1 }).includes({ post: "author" }).toArray();
    await assertNoQueries(false, () => {
      commentArr.forEach((c: any) => {
        void c.post.author.name;
      });
    });
  });
  it("including duplicate objects from belongs to", async () => {
    const popularPost = await Post.create({ title: "foo", body: "I like cars!" });
    const comment = await popularPost.comments.create({ body: "lol" });
    const michael = await Person.create({ first_name: "Michael" });
    const david = await Person.create({ first_name: "David" });
    await Reader.create({ post_id: popularPost.id, person_id: michael.id });
    await Reader.create({ post_id: popularPost.id, person_id: david.id });

    const readerArr = await Reader.where({ post_id: popularPost.id })
      .includes({ post: "comments" })
      .toArray();
    for (const reader of readerArr) {
      const readerPost = (reader as any).post;
      const readerComments = readerPost.association("comments").target;
      expect(readerComments).toHaveLength(1);
      expect(readerComments[0].id).toBe(comment.id);
    }
  });

  it("finding with includes on has many association with same include includes only once", async () => {
    const authorId = authors("david").id;
    let author!: Author;
    await assertQueriesCount(3, false, async () => {
      author = await Author.includes({ postsWithComments: "comments" }).find(authorId);
    });
    const postsLoaded = (author as any).association("postsWithComments").target as any[];
    for (const post of postsLoaded) {
      const loaded = post.association("comments").target as any[];
      expect(loaded.length).toBe(await post.comments.count());
      const ids = loaded.map((c: any) => c.id);
      expect(ids).toEqual([...new Set(ids)]);
    }
  });

  it("finding with includes on has one association with same include includes only once", async () => {
    const davidAuthor = authors("david");
    const post = await davidAuthor.postAboutThinkingWithLastComment;
    const lastComment = await (post as any).lastComment;
    let author!: Author;
    await assertQueriesCount(3, false, async () => {
      author = await Author.includes({ postAboutThinkingWithLastComment: "lastComment" }).find(
        davidAuthor.id,
      );
    });
    await assertNoQueries(false, () => {
      expect((author as any).postAboutThinkingWithLastComment?.id).toBe(post?.id);
      expect(
        (author as any).postAboutThinkingWithLastComment?.association("lastComment").target?.id,
      ).toBe(lastComment?.id);
    });
  });
  it("finding with includes on belongs to association with same include includes only once", async () => {
    const welcomePost = posts("welcome");
    const author = await welcomePost.author;
    const authorAddress = await (author as any).authorAddress;
    let post!: Post;
    await assertQueriesCount(3, false, async () => {
      post = await Post.includes({ authorWithAddress: "authorAddress" }).find(welcomePost.id);
    });
    await assertNoQueries(false, () => {
      expect((post as any).authorWithAddress?.id).toBe(author?.id);
      expect((post as any).authorWithAddress?.association("authorAddress").target?.id).toBe(
        authorAddress?.id,
      );
    });
  });
  it("finding with includes on null belongs to association with same include includes only once", async () => {
    const welcomePost = posts("welcome");
    await Post.where({ id: welcomePost.id }).updateAll({ author_id: null });
    let post!: Post;
    await assertQueriesCount(1, false, async () => {
      post = await Post.includes({ authorWithAddress: "authorAddress" }).find(welcomePost.id);
    });
    await assertNoQueries(false, () => {
      expect((post as any).authorWithAddress).toBeNull();
    });
  });
  it("finding with includes on null belongs to polymorphic association", async () => {
    const sponsorRecord = sponsors("moustache_club_sponsor_for_groucho");
    await Sponsor.where({ id: sponsorRecord.id }).updateAll({
      sponsorable_id: null,
      sponsorable_type: null,
    });
    let sponsor!: Sponsor;
    await assertQueriesCount(1, false, async () => {
      sponsor = await Sponsor.includes("sponsorable").find(sponsorRecord.id);
    });
    await assertNoQueries(false, () => {
      expect((sponsor as any).sponsorable).toBeNull();
    });
  });
  it("finding with includes on empty polymorphic type column", async () => {
    const sponsorRecord = sponsors("moustache_club_sponsor_for_groucho");
    await Sponsor.where({ id: sponsorRecord.id }).updateAll({
      sponsorable_type: "",
      sponsorable_id: null,
    });
    let sponsor!: Sponsor;
    await assertQueriesCount(1, false, async () => {
      sponsor = await Sponsor.includes("sponsorable").find(sponsorRecord.id);
    });
    await assertNoQueries(false, () => {
      expect((sponsor as any).sponsorable).toBeNull();
    });
  });

  it("loading from an association", async () => {
    const david = authors("david");
    const postArr = await david.posts.includes("comments").order("posts.id").toArray();
    expect((postArr[0] as any).association("comments").target).toHaveLength(2);
  });

  it("nested loading does not raise exception when association does not exist", async () => {
    const authorlessPost = posts("authorless");
    await expect(
      Post.includes({ author: "nonExisting" }).find(authorlessPost.id),
    ).resolves.toBeDefined();
  });
  it("three level nested preloading does not raise exception when association does not exist", async () => {
    const nullAuthorComment = await Comment.where({ author_id: null })
      .whereNot({ post_id: null })
      .first();
    const postId = (nullAuthorComment as any).post_id;
    await expect(
      Post.preload({ comments: [{ author: "essays" }] }).find(postId),
    ).resolves.toBeDefined();
  });
  it("eager load has many with string keys", async () => {
    const expectedSubscriptions = [subscriptions("webster_awdr"), subscriptions("webster_rfr")];
    const subscriber = await Subscriber.includes("subscriptions").find(subscribers("second").id);
    const loaded = (subscriber as any).association("subscriptions").target as any[];
    expect(loaded.map((s: any) => s.id).sort()).toEqual(
      expectedSubscriptions.map((s) => s.id).sort(),
    );
  });
  it.skip("string id column joins", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/eager.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in eager.test.ts
  });
  it("eager load has many through with string keys", async () => {
    const expectedBooks = [books("awdr"), books("rfr")];
    const subscriber = await Subscriber.includes("books").find(subscribers("second").id);
    const loaded = (subscriber as any).association("books").target as any[];
    expect(loaded.map((b: any) => b.id).sort()).toEqual(expectedBooks.map((b) => b.id).sort());
  });
  it("eager load belongs to with string keys", async () => {
    const expectedSubscriber = subscribers("second");
    const subscription = await Subscription.includes("subscriber").find(
      subscriptions("webster_awdr").id,
    );
    expect((subscription as any).association("subscriber").target?.nick).toBe(
      expectedSubscriber.nick,
    );
  });
  it("eager association loading with explicit join", async () => {
    const list = await Post.all()
      .includes("comments")
      .joins("INNER JOIN authors ON posts.author_id = authors.id AND authors.name = 'Mary'")
      .limit(1)
      .order("author_id")
      .toArray();
    expect(list).toHaveLength(1);
  });
  it("eager association loading with explicit join belongs to", async () => {
    const welcome = posts("welcome");
    const david = authors("david");

    const posts2 = await Post.where({ id: welcome.id }).eagerLoad("author").toArray();
    expect(posts2).toHaveLength(1);
    const loaded = (posts2[0] as any).association("author").target;
    expect(loaded).not.toBeNull();
    expect(loaded.name).toBe(david.name);

    // Association proxy wired during hydration (read off the holder, not lazy-synced)
    const btProxy = (posts2[0] as any)._associationInstances.get("author");
    expect(btProxy).toBeDefined();
    expect(btProxy.loaded).toBe(true);
    expect(btProxy.target).not.toBeNull();
    expect(btProxy.target.name).toBe(david.name);
  });
  it("eager association loading with explicit join has one", async () => {
    const david = authors("david");

    const users = await Author.where({ id: david.id }).eagerLoad("post").toArray();
    expect(users).toHaveLength(1);
    const profile = (users[0] as any).association("post").target;
    expect(profile).not.toBeNull();

    // Association proxy wired during hydration (read off the holder, not lazy-synced)
    const hoProxy = (users[0] as any)._associationInstances.get("post");
    expect(hoProxy).toBeDefined();
    expect(hoProxy.loaded).toBe(true);
    expect(hoProxy.target).not.toBeNull();
  });
  it("eager association loading with explicit join marks empty association loaded", async () => {
    const author = await Author.create({ name: "NoPostsAuthor" });

    const authorsArr = await Author.where({ id: author.id }).eagerLoad("posts").toArray();
    expect(authorsArr).toHaveLength(1);
    const proxy = (authorsArr[0] as any)._associationInstances.get("posts");
    expect(proxy).toBeDefined();
    expect(proxy.loaded).toBe(true);
    expect(proxy.target).toEqual([]);
  });
  it("eager with invalid association reference", async () => {
    const expected =
      /Association named 'monkeys' was not found on Post; perhaps you misspelled it\?/;
    await expect(Post.all().includes("monkeys").toArray()).rejects.toThrow(expected);
    await expect(
      Post.all()
        .includes(["monkeys"] as any)
        .toArray(),
    ).rejects.toThrow(expected);
    await expect(Post.all().includes("monkeys", "elephants").toArray()).rejects.toThrow(expected);
  });

  it("exceptions have suggestions for fix", async () => {
    let error: any;
    try {
      await Post.includes("taggingz").find(posts("welcome").id);
    } catch (e: any) {
      error = e;
    }
    expect(error).toBeInstanceOf(AssociationNotFoundError);
    expect(error.detailedMessage()).toContain("Did you mean?  tagging");
  });
  it("eager has many through with order", async () => {
    const tag = await OrderedTag.create({ name: "Foo" });
    const post1 = await Post.create({ title: "Beaches", body: "I like beaches!" });
    const post2 = await Post.create({ title: "Pools", body: "I like pools!" });

    await Tagging.create({ taggable_type: "Post", taggable_id: post1.id, tag_id: tag.id });
    await Tagging.create({ taggable_type: "Post", taggable_id: post2.id, tag_id: tag.id });

    const tagWithIncludes = await OrderedTag.includes("taggedPosts").find(tag.id);
    const taggings = await tagWithIncludes.orderedTaggings.toArray();
    const taggableTitles: string[] = [];
    for (const tagging of taggings) {
      const taggable = (await tagging.loadBelongsTo("taggable")) as Post;
      taggableTitles.push(taggable.title);
    }
    const taggedPostTitles = (await tagWithIncludes.taggedPosts.toArray()).map((p: any) => p.title);
    expect(taggedPostTitles).toEqual(taggableTitles);
  });
  it("eager has many through multiple with order", async () => {
    const tag1 = await OrderedTag.create({ name: "Bar" });
    const tag2 = await OrderedTag.create({ name: "Foo" });

    const post1 = await Post.create({ title: "Beaches", body: "I like beaches!" });
    const post2 = await Post.create({ title: "Pools", body: "I like pools!" });

    await Tagging.create({ taggable_type: "Post", taggable_id: post1.id, tag_id: tag1.id });
    await Tagging.create({ taggable_type: "Post", taggable_id: post2.id, tag_id: tag1.id });
    await Tagging.create({ taggable_type: "Post", taggable_id: post2.id, tag_id: tag2.id });
    await Tagging.create({ taggable_type: "Post", taggable_id: post1.id, tag_id: tag2.id });

    const tagsWithIncludes = await OrderedTag.where({ id: [tag1.id, tag2.id] })
      .includes("taggedPosts")
      .order("id")
      .toArray();
    const tag1WithIncludes = tagsWithIncludes[0];
    const tag2WithIncludes = tagsWithIncludes[tagsWithIncludes.length - 1];

    expect((await tag1WithIncludes.taggedPosts.toArray()).map((p: any) => p.title)).toEqual([
      post2.title,
      post1.title,
    ]);
    expect((await tag2WithIncludes.taggedPosts.toArray()).map((p: any) => p.title)).toEqual([
      post1.title,
      post2.title,
    ]);
  });
  it("limited eager with order", async () => {
    const result1 = await Post.includes("author", "comments")
      .references("authors")
      .where({ "authors.name": "David" })
      .order("UPPER(posts.title)")
      .limit(2)
      .offset(1)
      .toArray();
    expect(result1.map((p: any) => Number(p.id))).toEqual([
      Number(posts("thinking").id),
      Number(posts("sti_comments").id),
    ]);
    const result2 = await Post.includes("author", "comments")
      .references("authors")
      .where({ "authors.name": "David" })
      .order("UPPER(posts.title) DESC")
      .limit(2)
      .offset(1)
      .toArray();
    expect(result2.map((p: any) => Number(p.id))).toEqual([
      Number(posts("sti_post_and_comments").id),
      Number(posts("sti_comments").id),
    ]);
  });
  it("limited eager with multiple order columns", async () => {
    const result1 = await Post.includes("author", "comments")
      .references("authors")
      .where({ "authors.name": "David" })
      .order("UPPER(posts.title)", "posts.id")
      .limit(2)
      .offset(1)
      .toArray();
    expect(result1.map((p: any) => Number(p.id))).toEqual([
      Number(posts("thinking").id),
      Number(posts("sti_comments").id),
    ]);
    const result2 = await Post.includes("author", "comments")
      .references("authors")
      .where({ "authors.name": "David" })
      .order("UPPER(posts.title) DESC", "posts.id")
      .limit(2)
      .offset(1)
      .toArray();
    expect(result2.map((p: any) => Number(p.id))).toEqual([
      Number(posts("sti_post_and_comments").id),
      Number(posts("sti_comments").id),
    ]);
  });
  it("limited eager with numeric in association", async () => {
    const result = await Person.references("number1_fans_people")
      .includes("readers", "primaryContact", "number1Fan")
      .where("number1_fans_people.first_name like 'M%'")
      .order("people.id")
      .limit(2)
      .offset(0)
      .toArray();
    expect(result.map((p: any) => Number(p.id))).toEqual([
      Number(people("david").id),
      Number(people("susan").id),
    ]);
  });
  it("eager with multiple associations with same table has one", async () => {
    const d1 = await findAllOrdered(Firm);
    const d2 = await findAllOrdered(Firm, "account");
    for (let i = 0; i < d1.length; i++) {
      expect(d2[i].id).toBe(d1[i].id);
      const a1 = await d1[i].loadHasOne("account");
      const a2 = d2[i].association("account").target ?? null;
      if (a1 == null) {
        expect(a2).toBeNull();
      } else {
        expect(a2?.id).toBe(a1.id);
      }
    }
  });
  it("eager with multiple associations with same table belongs to", async () => {
    const firmTypes = ["firm", "firmWithBasicId", "firmWithOtherName", "firmWithCondition"];
    const d1 = await findAllOrdered(Client);
    const d2 = await findAllOrdered(Client, firmTypes);
    for (let i = 0; i < d1.length; i++) {
      expect(d2[i].id).toBe(d1[i].id);
      for (const type of firmTypes) {
        const expected = await d1[i].loadBelongsTo(type);
        const actual = d2[i].association(type).target ?? null;
        if (expected == null) {
          expect(actual).toBeNull();
        } else {
          expect(actual?.id).toBe(expected.id);
        }
      }
    }
  });

  it("eager with valid association as string not symbol", async () => {
    let raised = false;
    try {
      await Post.all().includes("comments").toArray();
    } catch {
      raised = true;
    }
    expect(raised).toBe(false);
  });

  it.skip("eager association with scope with joins", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/eager.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in eager.test.ts
  });
  it("count with include", async () => {
    const david = authors("david");
    const count = await david.postsWithComments
      .where("length(comments.body) > 15")
      .references("comments")
      .count();
    expect(count).toBe(3);
  });

  it("load with sti sharing association", async () => {
    await assertQueriesCount(2, false, async () => {
      // should not do 1 query per subclass
      await Comment.all().includes("post").toArray();
    });
  });
  it.skip("eager loading with conditions on string joined table preloads", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/eager.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in eager.test.ts
  });
  it("preload has many using primary key", async () => {
    const expected = (await (await Firm.first())!.clientsUsingPrimaryKey.toArray()).sort(
      (a: any, b: any) => Number(a.id) - Number(b.id),
    );
    const firm = await Firm.includes("clientsUsingPrimaryKey").first();
    await assertNoQueries(false, async () => {
      const actual = (await firm!.clientsUsingPrimaryKey.toArray()).sort(
        (a: any, b: any) => Number(a.id) - Number(b.id),
      );
      expect(actual.map((c: any) => c.id)).toEqual(expected.map((c: any) => c.id));
    });
  });

  it("include has many using primary key", async () => {
    const expected = (await (await Firm.find(1)).clientsUsingPrimaryKey.toArray()).sort(
      (a: any, b: any) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
    );
    const firm = await Firm.all()
      .includes("clientsUsingPrimaryKey")
      .order("clients_using_primary_keys_companies.name")
      .find(1);
    await assertNoQueries(false, async () => {
      const actual = await firm.clientsUsingPrimaryKey.toArray();
      expect(actual.map((c: any) => c.id)).toEqual(expected.map((c: any) => c.id));
    });
  });
  it("preloading through empty belongs to", async () => {
    const maxId = Number(await Company.maximum("id"));
    const c = await Client.create({ name: "Foo", client_of: maxId + 1 });

    let client!: InstanceType<typeof Client>;
    await assertQueriesCount(2, false, async () => {
      client = await Client.preload("accounts").find(c.id);
    });
    await assertNoQueries(false, async () => {
      expect(await client.accounts.toArray()).toHaveLength(0);
    });
  });
  it("preloading empty belongs to polymorphic", async () => {
    const maxId = Number(await Post.maximum("id"));
    const t = await Tagging.create({
      taggable_type: "Post",
      taggable_id: maxId + 1,
      tag_id: tags("general").id,
    });

    let tagging!: InstanceType<typeof Tagging>;
    await assertQueriesCount(2, false, async () => {
      tagging = await Tagging.preload("taggable").find(t.id);
    });
    // Rails: assert_no_queries { assert_nil tagging.taggable } — exercise the
    // reader so a preloaded-but-re-querying bug would be caught.
    await assertNoQueries(false, async () => {
      expect(await (tagging as any).taggable).toBeNull();
    });
    expect(Number(tagging.taggable_id)).toBe(maxId + 1);
  });
  it("preloading has one using reorder", async () => {
    class TempAuthor extends Base {
      static tableName = "authors";
      static {
        this.hasOne("post", { className: "PostWithDefaultScope", foreignKey: "author_id" });
        this.hasOne("reorderedPost", {
          className: "PostWithDefaultScope",
          foreignKey: "author_id",
          scope: (q: any) => q.reorder({ title: "desc" }),
        });
      }
    }

    const author = await TempAuthor.first();
    // PRECONDITION: make sure ordering results in different results
    const post = await (author as any).loadHasOne("post");
    const reorderedPost = await (author as any).loadHasOne("reorderedPost");
    expect(Number(post.id)).not.toBe(Number(reorderedPost.id));

    const preloaded = await TempAuthor.preload("reorderedPost").first();
    // Rails: klass.preload(:reordered_post).first.reordered_post — go through the
    // reader so a preloaded-but-re-querying bug would be caught.
    const preloadedReorderedPost = await (preloaded as any).reorderedPost;
    expect(Number(preloadedReorderedPost.id)).toBe(Number(reorderedPost.id));
    const topByTitleDesc = await Post.order({ title: "desc" }).first();
    expect(preloadedReorderedPost.title).toBe(topByTitleDesc!.title);
  });
  it("join eager with empty order should generate valid sql", async () => {
    let error: unknown;
    try {
      await Post.includes("comments")
        .references("comments")
        .order("")
        .where({ comments: { body: "Thank you for the welcome" } })
        .first();
    } catch (e) {
      error = e;
    }
    expect(error).toBeUndefined();
  });
  it("eager load multiple associations with references", async () => {
    const mentor = await Mentor.create({ name: "Barış Can DAYLIK" });
    const developer = await Developer.create({
      name: "Mehmet Emin İNAÇ",
      mentor_id: mentor.id,
    });
    const contract = await Contract.create({ developer_id: developer.id });
    const project = await Project.create({ name: "VNGRS", mentor_id: mentor.id });
    await (project as any).developers.concat(developer);

    // Rails: Project.references(:mentors).includes(mentor: { developers: :contracts },
    //        developers: :contracts). The eager-load JOINs the mentor's developers and
    //        the project's HABTM developers, both down to contracts.
    const projects = await (Project as any)
      .all()
      .references("mentors")
      .includes({
        mentor: { developers: "contracts" },
        developers: "contracts",
      })
      .order("projects.id")
      .toArray();

    // Rails: projects.last.mentor.developers.first.contracts == projects.last.developers.last.contracts
    const last = projects[projects.length - 1];
    const mentorDevContracts = last
      .association("mentor")
      .target?.association("developers")
      .target?.[0]?.association("contracts").target;
    const directDevs = last.association("developers").target;
    const directDevContracts = directDevs?.[directDevs.length - 1]?.association("contracts").target;

    expect(mentorDevContracts).toHaveLength(1);
    expect(directDevContracts).toHaveLength(1);
    expect(Number(mentorDevContracts![0].id)).toBe(Number(contract.id));
    expect(Number(directDevContracts![0].id)).toBe(Number(contract.id));
    // Rails: assert_equal — AR `==` is class+id equality; both branches JOIN the
    // same contract row.
    expect(Number(mentorDevContracts![0].id)).toBe(Number(directDevContracts![0].id));
  });
  it("scoping with a circular preload", async () => {
    // Rails: Comment.preload(post: :comments).scoping { Comment.find(1) }
    // The pushed scope carries the preload values, so `find` inside the block
    // runs the circular preload (comment -> post -> comments). It must not loop
    // or error, and `find` must still return the matching record.
    const post = await Post.create({ title: "P", body: "b" });
    const c1 = await Comment.create({ post_id: post.id, body: "c1" });

    const rel = (Comment as any).all().preload({ post: "comments" });
    const found = await (Comment as any).scoping(rel, async () => {
      return await (Comment as any).find(c1.id);
    });
    expect(found.id).toBe(c1.id);
    // The current scope's preload values are applied by `find`, so the circular
    // preload actually traverses post -> comments (the original loop hazard).
    const loadedPost = found.association("post").target;
    expect(loadedPost.id).toBe(post.id);
    expect(loadedPost.association("comments").target.map((c: any) => c.id)).toContain(c1.id);
  });

  it("circular preload does not modify unscoped", async () => {
    // Rails: FirstPost.preload(comments: :first_post).find(1) must not let
    // FirstPost's default scope (where id: 1) leak into a later unscoped lookup.
    // Uses fixture post id=1 (welcome) as the FirstPost target; creates a fresh post2.
    registerModel("FirstPost", FirstPost);
    const post2 = await Post.create({ title: "P2", body: "b" });
    await Comment.create({ post_id: 1, body: "c1" });

    const expected = await (FirstPost as any).unscoped().find(post2.id);
    await (FirstPost as any).all().preload({ comments: "firstPost" }).find(1);
    const after = await (FirstPost as any).unscoped().find(post2.id);
    expect(after.id).toBe(expected.id);
  });

  it.skip("preloading associations with string joins and order references", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/eager.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in eager.test.ts
  });
  it("preloading readonly association", async () => {
    // has-one
    const firm = await (Firm as any).where({ id: 1 }).preload("readonlyAccount").firstBang();
    expect((await firm.readonlyAccount).isReadonly()).toBe(true);

    // has_and_belongs_to_many
    const project = await (Project as any)
      .where({ id: 2 })
      .preload("readonlyDevelopers")
      .firstBang();
    expect((await project.readonlyDevelopers.first()).isReadonly()).toBe(true);

    // has-many :through
    const david = await (Author as any).where({ id: 1 }).preload("readonlyComments").firstBang();
    expect((await david.readonlyComments.first()).isReadonly()).toBe(true);
  });

  it("eager-loading non-readonly association", async () => {
    // has_one
    const firm = await (Firm as any).where({ id: 1 }).eagerLoad("account").firstBang();
    expect((await firm.account).isReadonly()).toBe(false);

    // has_and_belongs_to_many
    const project = await (Project as any).where({ id: 2 }).eagerLoad("developers").firstBang();
    expect((await project.developers.first()).isReadonly()).toBe(false);

    // has_many :through
    const david = await (Author as any).where({ id: 1 }).eagerLoad("comments").firstBang();
    expect((await david.comments.first()).isReadonly()).toBe(false);

    // belongs_to
    const post = await (Post as any).where({ id: 1 }).eagerLoad("author").firstBang();
    expect((await post.author).isReadonly()).toBe(false);
  });

  it("eager-loading readonly association", async () => {
    // has-one
    const firm = await (Firm as any).where({ id: 1 }).eagerLoad("readonlyAccount").firstBang();
    expect((await firm.readonlyAccount).isReadonly()).toBe(true);

    // has_and_belongs_to_many
    const project = await (Project as any)
      .where({ id: 2 })
      .eagerLoad("readonlyDevelopers")
      .firstBang();
    expect((await project.readonlyDevelopers.first()).isReadonly()).toBe(true);

    // has-many :through
    const david = await (Author as any).where({ id: 1 }).eagerLoad("readonlyComments").firstBang();
    expect((await david.readonlyComments.first()).isReadonly()).toBe(true);

    // belongs_to
    const post = await (Post as any).where({ id: 1 }).eagerLoad("readonlyAuthor").firstBang();
    expect((await post.readonlyAuthor).isReadonly()).toBe(true);
  });

  it("eager-loading with a polymorphic association won't work consistently", async () => {
    const david = authors("david");
    const essays = david.essays;

    await expect(essays.eagerLoad("writer").toArray()).rejects.toThrow(EagerLoadPolymorphicError);
    await expect(essays.eagerLoad("writer").count()).rejects.toThrow(EagerLoadPolymorphicError);
    await expect(essays.eagerLoad("writer").exists()).rejects.toThrow(EagerLoadPolymorphicError);
    // Rails routes every calculation through apply_join_dependency when eager
    // loading, so sum/minimum (single aggregate) and grouped aggregates raise too.
    await expect(essays.eagerLoad("writer").sum("writer_id")).rejects.toThrow(
      EagerLoadPolymorphicError,
    );
    await expect(essays.eagerLoad("writer").minimum("writer_id")).rejects.toThrow(
      EagerLoadPolymorphicError,
    );
    await expect(essays.eagerLoad("writer").group("writer_type").sum("writer_id")).rejects.toThrow(
      EagerLoadPolymorphicError,
    );
    // Rails `exists?` short-circuits on a falsey condition before the
    // eager_loading? raise (finder_methods.rb:367-369).
    expect(await essays.eagerLoad("writer").exists(false)).toBe(false);
    // Misspelled eager-load names raise on the calculation path too — Rails
    // construct_join_dependency → find_reflection (join_dependency.rb), so count
    // doesn't silently ignore an unknown association.
    await expect(essays.eagerLoad("nope").count()).rejects.toThrow(/misspelled it/);
  });
  it("preloading has_many_through association avoids calling association.reader", async () => {
    // Rails: assert_not_called_on_instance_of(HasManyAssociation, :reader) { Author.preload(:readonly_comments).first! }
    // — CollectionProxy#reader is expensive, so the preloader populates the
    // target directly rather than going through the association reader. trails'
    // `reader` getter lives on CollectionAssociation, the superclass of
    // HasManyThroughAssociation; spy there so any through-instance access is
    // caught.
    let author: any;
    await assertNotCalledOnInstanceOf(HasManyThroughAssociation, "reader", async () => {
      author = await Author.preload("readonlyComments").first();
    });
    expect(author).toBeTruthy();
    expect(author.association("readonlyComments").isLoaded()).toBe(true);
    // The preloader populated the through target directly, so reading it must
    // not fire a query (it never goes through the expensive reader path).
    await assertNoQueries(false, async () => {
      await author.readonlyComments.toArray();
    });
  });
  it("preloading through a polymorphic association doesn't require the association to exist", async () => {
    // Rails: Sponsor.where(sponsorable_id: 1).preload(sponsorable: [:post, :membership]).
    // sponsorable_id 1 matches the Member (groucho) and Author (david) sponsors; the
    // polymorphic preload applies :post only to Author and :membership only to Member
    // — neither must exist on the other type.
    const sponsorRecords = await (Sponsor as any)
      .where({ sponsorable_id: 1 })
      .preload({ sponsorable: ["post", "membership"] })
      .toArray();
    const sponsorables = sponsorRecords.map((s: any) => s.association("sponsorable").target);
    const author = sponsorables.find((s: any) => s?.constructor.name === "Author");
    const member = sponsorables.find((s: any) => s?.constructor.name === "Member");
    expect(author.association("post").isLoaded()).toBe(true);
    expect(member.association("membership").isLoaded()).toBe(true);
  });
  it("preloading a regular association through a polymorphic association doesn't require the association to exist on all types", async () => {
    // Rails: preload(sponsorable: [{ post: :first_comment }, :membership]). The Author's
    // post (and its first_comment) must be preloaded; the Member type silently skips :post.
    const sponsorRecords = await (Sponsor as any)
      .where({ sponsorable_id: 1 })
      .preload({ sponsorable: [{ post: "firstComment" }, "membership"] })
      .toArray();
    const author = sponsorRecords
      .map((s: any) => s.association("sponsorable").target)
      .find((s: any) => s?.constructor.name === "Author");
    const post = author.association("post").target;
    expect(post).toBeTruthy();
    expect(post.association("firstComment").isLoaded()).toBe(true);
  });
  it("preloading a regular association with a typo through a polymorphic association still raises", async () => {
    // Rails: an intentional typo of first -> fist must raise AssociationNotFoundError.
    await expect(
      (Sponsor as any)
        .where({ sponsorable_id: 1 })
        .preload({ sponsorable: [{ post: "fistComment" }, "membership"] })
        .toArray(),
    ).rejects.toThrow(AssociationNotFoundError);
  });
  it("preloading belongs_to with cpk", async () => {
    // CpkOrder's PK is composite (["shop_id", "id"]), so `order.id` is the
    // `[shop_id, id]` array; the `order_id` FK column wants the scalar `id`.
    const order = await CpkOrder.create({ shop_id: 2, id: 2 });
    const orderId = (order as any).id[1];
    const orderAgreement = await CpkOrderAgreement.create({ order_id: orderId });

    const found = (await CpkOrderAgreement.all()
      .eagerLoad("order")
      .findBy({ id: orderAgreement.id })) as any;
    const loaded = found.association("order").target;
    expect(loaded).not.toBeNull();
    expect(loaded.id).toEqual(order.id);
  });

  it("preloading has_many with cpk", async () => {
    const order = await CpkOrder.create({ shop_id: 2, id: 2 });
    const orderId = (order as any).id[1];
    const orderAgreement = await CpkOrderAgreement.create({ order_id: orderId });

    const found = (await CpkOrder.all()
      .eagerLoad("orderAgreements")
      .findBy({ id: orderId })) as any;
    const agreements = found.association("orderAgreements").target;
    expect(agreements).toHaveLength(1);
    expect(agreements[0].id).toEqual(orderAgreement.id);
  });

  it("preloading has_one with cpk", async () => {
    const order = await CpkOrder.create({ shop_id: 2, id: 2 });
    const orderId = (order as any).id[1];
    const book = await CpkBook.create({
      author_id: 1,
      id: 3,
      shop_id: order.shop_id,
      order_id: orderId,
    });

    const found = (await CpkOrder.all().eagerLoad("book").findBy({ id: orderId })) as any;
    const loaded = found.association("book").target;
    expect(loaded).not.toBeNull();
    expect(loaded.id).toEqual(book.id);
  });

  it("including duplicate objects from has many", async () => {
    // Rails: car_post belongs to 2 categories via habtm; includes(posts: :comments) on
    // categories should yield the SAME comment object for each category's posts[0].
    const carPost = await Post.create({ title: "foo", body: "I like cars!" });
    await (carPost as any).categories.concat(categories("general"), categories("technology"));
    const comment = await (carPost as any).comments.create({ body: "hmm" });

    const cats = await (Category as any)
      .all()
      .where({ posts: { id: carPost.id } })
      .includes({ posts: "comments" })
      .toArray();

    for (const category of cats) {
      const catPosts = category.association("posts").target;
      const comments = catPosts[0].association("comments").target;
      expect(comments.map((c: any) => Number(c.id))).toEqual([Number(comment.id)]);
    }
  });
  it("associations loaded for all records", async () => {
    // Rails: categories with includes(posts: :special_comments) — each post's
    // special_comments association is loaded for all category records.
    const post = await Post.create({ title: "foo", body: "I like cars!" });
    await SpecialComment.create({ body: "Come on!", post_id: post.id });
    const firstCategory = await Category.create({ name: "First!" });
    await (firstCategory as any).posts.concat(post);
    const secondCategory = await Category.create({ name: "Second!" });
    await (secondCategory as any).posts.concat(post);

    const cats = await (Category as any)
      .where({ id: [firstCategory.id, secondCategory.id] })
      .includes({ posts: "specialComments" })
      .toArray();

    expect(
      cats.map((c: any) =>
        c.association("posts").target[0].association("specialComments").isLoaded(),
      ),
    ).toEqual([true, true]);
  });
  it("loading with no associations", async () => {
    const authorless = posts("authorless");
    const found = await (Post as any).all().includes("author").find(authorless.id);
    expect(await found.author).toBeNull();
  });
  it("eager association loading with belongs to", async () => {
    const comments = await (Comment as any).all().includes("post").toArray();
    expect(comments).toHaveLength(12);
    const titles = await Promise.all(comments.map(async (c: any) => (await c.post).title));
    expect(titles).toContain(posts("welcome").title);
    expect(titles).toContain(posts("sti_post_and_comments").title);
  });
  it("preload belongs to uses exclusive scope", async () => {
    const people = await (Person as any).males().includes("primaryContact").toArray();
    expect(people).toHaveLength(2);
    for (const person of people) {
      // Rails: assert_no_queries { assert_not_nil person.primary_contact } — the
      // reader must serve the preloaded target without firing a query.
      let contact: any;
      await assertNoQueries(false, async () => {
        contact = await person.primaryContact;
        expect(contact).not.toBeNull();
      });
      const direct = await (Person as any).find(person.id);
      const directContact = await direct.primaryContact;
      expect(Number(contact.id)).toBe(Number(directContact.id));
    }
  });
  it("preload has many uses exclusive scope", async () => {
    const people = await (Person as any).males().includes("agents").toArray();
    expect(people).toHaveLength(2);
    for (const person of people) {
      const agents = person.association("agents").target;
      const direct = await (Person as any).find(person.id);
      const directAgents = await direct.agents.toArray();
      expect(agents.map((a: any) => Number(a.id)).sort()).toEqual(
        directAgents.map((a: any) => Number(a.id)).sort(),
      );
    }
  });
  it("preloading empty belongs to", async () => {
    const clientOf = Number(await Company.maximum("id")) + 1;
    const c = await Client.create({ name: "Foo", client_of: clientOf });

    let client!: InstanceType<typeof Client>;
    await assertQueriesCount(2, false, async () => {
      client = await Client.preload("firm").find(c.id);
    });
    await assertNoQueries(false, async () => {
      expect(await client.firm).toBeNull();
    });
    expect(Number(client.client_of)).toBe(clientOf);
  });
  it("deep preload", async () => {
    // Rails: Post.preload(author: :posts, comments: :post).first
    const post = await (Post as any).all().preload({ author: "posts", comments: "post" }).first();

    expect(post.association("author").target.association("posts").isLoaded()).toBe(true);
    expect(post.association("comments").target[0].association("post").isLoaded()).toBe(true);
  });
  it("preloading the same association twice works", async () => {
    await Member.create({});
    const members = await (Member as any)
      .preload("currentMembership")
      .includes({ currentMembership: "club" })
      .all()
      .toArray();

    await assertNoQueries(false, async () => {
      const membersWithMembership = members.filter(
        (m: any) => m.association("currentMembership").target,
      );
      const clubs = membersWithMembership.map(
        (m: any) => m.association("currentMembership").target.association("club").target,
      );
      expect(clubs).toHaveLength(3);
    });
  });
});

describe("EagerLoadingTooManyIdsTest", () => {
  setupHandlerSuite();
  // Mirrors the citations.yml fixture: 65536 rows (id 0..65535, book2_id i*i).
  // The point of these tests is that preload/eager_load split an IN clause whose
  // id list exceeds the adapter's bind-parameter limit, so the row count must be
  // the real fixture size. The per-row reload in useHandlerFixtures is too slow
  // at this scale, so seed via chunked insertAll (no reload) and clean up after.
  const TOTAL = 65536;
  beforeAll(async () => {
    await defineSchema(
      { citations: canonicalSchema.citations, books: canonicalSchema.books } as Schema,
      { dropExisting: true },
    );
    registerModel(Citation);
    registerModel(Book);
    const rows: { id: number; book2_id: number }[] = [];
    for (let i = 0; i < TOTAL; i++) rows.push({ id: i, book2_id: i * i });
    // 2-column rows → ≤ 65535 placeholders/insert on MySQL/MariaDB at this chunk.
    for (let i = 0; i < rows.length; i += 10_000) {
      await Citation.insertAll(rows.slice(i, i + 10_000));
    }
  }, 180_000);

  afterAll(async () => {
    await Base.connection.executeMutation("DELETE FROM citations");
  }, 60_000);

  // Generous timeout: building the IN-split preload over the full 65536-row set
  // is slow on the MySQL-family lanes, well past the 5s default. The fixture
  // size is the point — it must exceed the adapter's bind-parameter limit to
  // force IN-splitting.
  it("preloading too many ids", async () => {
    expect((await Citation.preload("referenceOf").toArray()).length).toBe(await Citation.count());
  }, 120_000);

  // `eager_load(:citations)` is a 65536-row self-LEFT-JOIN on `citation_id`.
  // Rails' `t.references :citation` indexes that column, so the join is an
  // indexed lookup rather than the O(n²) nested-loop scan it degrades to on the
  // MySQL-family lanes without the index (that scan was >360s and poisoned the
  // shared connection). With the canonical `citations` schema now carrying the
  // Rails-faithful `index_citations_on_citation_id`, the join runs within budget.
  it("eager loading too many ids", async () => {
    expect(await Citation.all().eagerLoad("citations").offset(0).size()).toBe(
      await Citation.count(),
    );
  }, 120_000);
});

// ==========================================================================
// EagerAssociationTest (sharded composite-query_constraints fixtures) — preloading
// `Sharded::BlogPost#comments` (a has_many keyed by [blog_id, blog_post_id]) must
// emit a composite IN clause: `blog_id IN (...) AND blog_post_id IN (...)`. Same
// describe name so test:compare matches the Rails `EagerAssociationTest` class.
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { shardedBlogs } = useHandlerFixtures([
    "shardedBlogs",
    "shardedBlogPosts",
    "shardedComments",
  ]);
  beforeAll(async () => {
    await defineSchema(
      {
        sharded_blogs: canonicalSchema.sharded_blogs,
        sharded_blog_posts: canonicalSchema.sharded_blog_posts,
        sharded_comments: canonicalSchema.sharded_comments,
      } as Schema,
      { dropExisting: true },
    );
  });
  registerModel("ShardedBlog", ShardedBlog);
  registerModel("ShardedBlogPost", ShardedBlogPost);
  registerModel("ShardedComment", ShardedComment);

  it("preloading belongs_to association SQL", async () => {
    const blogIds = [shardedBlogs("sharded_blog_one").id, shardedBlogs("sharded_blog_two").id];
    const posts = ShardedBlogPost.where({ blog_id: blogIds }).includes("comments");

    const sqls = await captureSql(async () => {
      const loaded = (await posts.toArray()) as Base[];
      // Exercise the public reader (Rails: `posts.map(&:comments)`); the size
      // is the post count (3), populated from the preload, not a fresh query.
      const commentsCollection = await Promise.all(
        loaded.map((p) => (p as any).comments.toArray() as Promise<Base[]>),
      );
      expect(commentsCollection.length).toBe(3);
      expect(commentsCollection.flat()).toHaveLength(4);
    });
    const sql = sqls[sqls.length - 1];

    // Rails (eager_test.rb:1698-1700) builds the pattern from `quote_table_name`,
    // which is adapter-specific (double-quotes on sqlite/pg, backticks on mysql),
    // so derive the quoting from the live adapter rather than hardcoding it.
    const conn = Base.connection;
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const quotedBlogId = escape(conn.quoteTableName("sharded_comments.blog_id"));
    const quotedBlogPostId = escape(conn.quoteTableName("sharded_comments.blog_post_id"));
    expect(sql).toMatch(
      new RegExp(`WHERE ${quotedBlogId} IN \\(.+\\) AND ${quotedBlogPostId} IN \\(.+\\)`),
    );
  });
});

// ==========================================================================
// EagerAssociationTest (HABTM, canonical fixtures) — `Post has_and_belongs_to_many
// :categories` / `Category has_and_belongs_to_many :posts` use the canonical
// Post/Category/Categorization models + real categories/posts/categories_posts/
// categorizations fixtures, so they need the fixture-backed handler suite. The
// main block above declares ad-hoc per-test models against a local schema.
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { posts, categories } = useHandlerFixtures([
    "categories",
    "posts",
    "categoriesPosts",
    "categorizations",
  ]);
  // Force-recreate the canonical HABTM tables with `dropExisting` (mirrors
  // named-scoping.test.ts). The per-worker SQLite DB is shared across files
  // (`file:trails_test_${VITEST_POOL_ID}?mode=memory&cache=shared`), and sibling
  // files (e.g. has-many-associations.test.ts) define a `posts` table WITHOUT a
  // `body` column. The signature cache is primed at worker boot
  // (template-global-setup.ts), so a plain `defineSchema` would cache-hit and
  // skip recreation — leaving the fixture seed to hit the wrong columns
  // (`table posts has no column named body`). `dropExisting` bypasses the cache.
  beforeAll(async () => {
    await defineSchema(
      Base.connection,
      {
        categories: canonicalSchema.categories,
        posts: canonicalSchema.posts,
        categories_posts: canonicalSchema.categories_posts,
        categorizations: canonicalSchema.categorizations,
      } as Schema,
      { dropExisting: true },
    );
  });
  registerModel(Post);
  registerModel(Category);
  registerModel(Categorization);

  it("has and belongs to many should not instantiate same records multiple times", async () => {
    // Rails (eager_test.rb): eager-loading `welcome` through two different HABTM
    // owners (general.posts and technology.posts) must reuse one instance
    // (`assert_same post1, post2`). categories_posts seeds both general_welcome
    // and technology_welcome, so welcome is genuinely reachable via two owners.
    const welcome = posts("welcome");
    const loaded = await Category.all().includes("posts").toArray();

    const general = loaded.find((c) => c.id === categories("general").id) as Category;
    const technology = loaded.find((c) => c.id === categories("technology").id) as Category;

    const generalPosts = general.association("posts").target as Base[];
    const technologyPosts = technology.association("posts").target as Base[];
    const post1 = generalPosts.find((p) => p.id === welcome.id);
    const post2 = technologyPosts.find((p) => p.id === welcome.id);

    expect(post1).toBeDefined();
    expect(post1).toBe(post2);
  });

  it("deep including through habtm", async () => {
    // Rails (eager_test.rb): `includes(categories: :categorizations)` preloads
    // two levels — Post HABTM categories, each Category has_many categorizations
    // — so the nested reads fire no further queries (Rails wraps each in
    // `assert_no_queries`).
    const loaded = await Post.all()
      .includes({ categories: "categorizations" })
      .order("posts.id")
      .toArray();

    await assertNoQueries(false, async () => {
      // Posts are positional (explicitly `order("posts.id")`); categories are
      // looked up by fixture identity rather than position — the HABTM preload
      // query carries no ORDER BY (preloader/association.ts:470; the through
      // preloader only sorts when the association scope has `orderValues`,
      // through-association.ts:91-94), so `WHERE id IN (...)` row order isn't
      // guaranteed cross-adapter. Rails relies on the same implicit order via
      // `categories[0]`/`[1]`; we assert the same counts without depending on it.
      const categoryOf = (post: Base, categoryId: unknown): Base =>
        (post.association("categories").target as Base[]).find((c) => c.id === categoryId)!;
      const categorizationCount = (c: Base): number =>
        (c.association("categorizations").target as Base[]).length;

      // welcome → general (2 categorizations) + technology (1); thinking → general (2).
      expect(categorizationCount(categoryOf(loaded[0], categories("general").id))).toBe(2);
      expect(categorizationCount(categoryOf(loaded[0], categories("technology").id))).toBe(1);
      expect(categorizationCount(categoryOf(loaded[1], categories("general").id))).toBe(2);
    });
  });
});

// ==========================================================================
// EagerAssociationTest (HABTM, canonical Developer fixtures) — the
// `conditions on join table` test eager-loads `Developer has_and_belongs_to_many
// :projects` and filters on a column of the `developers_projects` join table.
// It needs the canonical Developer/Project models + real developers/projects/
// developers_projects fixtures, so it lives in its own fixture-backed handler
// suite (the main block above declares ad-hoc per-test models). Same describe
// name as the other EagerAssociationTest blocks so test:compare matches it to
// the Rails `EagerAssociationTest` class.
// ==========================================================================
describe("EagerAssociationTest", () => {
  useHandlerFixtures(["developers", "projects", "developersProjects"]);
  // Force-recreate the canonical tables with `dropExisting` (mirrors the
  // EagerAssociationTest block above). Sibling files share the per-worker SQLite
  // DB and define `developers`/`projects` with different column sets, and the
  // signature cache is primed at worker boot — a plain `defineSchema` would
  // cache-hit and skip recreation, leaving the fixture seed to hit stale columns.
  beforeAll(async () => {
    await defineSchema(
      Base.connection,
      {
        developers: canonicalSchema.developers,
        projects: canonicalSchema.projects,
        developers_projects: canonicalSchema.developers_projects,
      } as Schema,
      { dropExisting: true },
    );
  });
  registerModel(Developer);
  registerModel(Project);

  it("conditions on join table with include and limit", async () => {
    // Rails (eager_test.rb): three developers (david, jamis, poor_jamis) have a
    // developers_projects row with the default access_level of 1; limit 5 doesn't
    // trim the set, so the eager + join-condition query returns 3 distinct rows.
    const developers = await Developer.all()
      .includes("projects")
      .where({ "developers_projects.access_level": 1 })
      .limit(5)
      .toArray();
    expect(developers).toHaveLength(3);
  });

  // Rails (eager_test.rb): mirrors the `messages_for` helper — subscribe to a
  // notification, run the block, collect the events, then unsubscribe.
  async function messagesFor(
    name: string,
    fn: () => Promise<void>,
  ): Promise<Array<{ payload: Record<string, unknown> }>> {
    const notifications: Array<{ payload: Record<string, unknown> }> = [];
    const sub = Notifications.subscribe(name, (e) => {
      notifications.push({ payload: e.payload });
    });
    try {
      await fn();
    } finally {
      Notifications.unsubscribe(sub);
    }
    return notifications;
  }

  it("association loading notification", async () => {
    const notifications = await messagesFor("instantiation.active_record", async () => {
      await Developer.all()
        .includes("projects")
        .where({ "developers_projects.access_level": 1 })
        .limit(5)
        .toArray();
    });

    const payload = notifications[0].payload;
    const count = (
      await Developer.all()
        .includes("projects")
        .where({ "developers_projects.access_level": 1 })
        .limit(5)
        .toArray()
    ).length;

    // eagerloaded row count should be greater than just developer count
    expect(payload.record_count as number).toBeGreaterThan(count);
    expect(payload.class_name).toBe(Developer.name);
  });

  it("base messages", async () => {
    const notifications = await messagesFor("instantiation.active_record", async () => {
      await Developer.all().toArray();
    });
    const payload = notifications[0].payload;

    expect(payload.record_count).toBe((await Developer.all().toArray()).length);
    expect(payload.class_name).toBe(Developer.name);
  });

  it("dont create temporary active record instances", async () => {
    Developer.instanceCount = 0;
    const developers = await Developer.all()
      .includes("projects")
      .where({ "developers_projects.access_level": 1 })
      .limit(5)
      .toArray();
    expect(Developer.instanceCount).toBe(developers.length);
  });

  it("order on join table with include and limit", async () => {
    // Rails (eager_test.rb): Developer.includes("projects") ordered by the join
    // table column `developers_projects.joined_on DESC` with limit 5 returns 5
    // developers.
    const developers = await Developer.all()
      .includes("projects")
      .references("developers_projects")
      .order("developers_projects.joined_on DESC")
      .limit(5)
      .toArray();
    expect(developers).toHaveLength(5);
  });
});

// ==========================================================================
// EagerAssociationTest (canonical developers/projects fixtures) — ports of the
// eager_test.rb `default_scope { includes(:projects) }` cluster. Each
// EagerDeveloperWith*DefaultScope model uses `developers` with a HABTM
// `projects` association eager-loaded by its default scope, so accessing
// `developer.projects` after the initial load issues no further queries.
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { developers } = useHandlerFixtures(["developers", "projects", "developersProjects"]);
  beforeAll(async () => {
    await defineSchema(
      Base.connection,
      {
        developers: canonicalSchema.developers,
        projects: canonicalSchema.projects,
        developers_projects: canonicalSchema.developers_projects,
      } as Schema,
      { dropExisting: true },
    );
  });
  registerModel(Project);
  registerModel(EagerDeveloperWithDefaultScope);
  registerModel(EagerDeveloperWithClassMethodDefaultScope);
  registerModel(EagerDeveloperWithLambdaDefaultScope);
  registerModel(EagerDeveloperWithBlockDefaultScope);
  registerModel(EagerDeveloperWithCallableDefaultScope);

  async function projectIds(): Promise<unknown[]> {
    return (await Project.order("id").toArray()).map((p) => p.id);
  }

  it("eager with default scope", async () => {
    const developer = await EagerDeveloperWithDefaultScope.where({ name: "David" }).first();
    const projects = await projectIds();
    await assertNoQueries(false, async () => {
      const loaded = await developer!.projects;
      expect(loaded.map((p) => p.id)).toEqual(projects);
    });
  });

  it("eager with default scope as class method", async () => {
    const developer = await EagerDeveloperWithClassMethodDefaultScope.where({
      name: "David",
    }).first();
    const projects = await projectIds();
    await assertNoQueries(false, async () => {
      const loaded = await developer!.projects;
      expect(loaded.map((p) => p.id)).toEqual(projects);
    });
  });

  it("eager with default scope as class method using find method", async () => {
    const david = developers("david");
    const developer = await EagerDeveloperWithClassMethodDefaultScope.find(david.id);
    const projects = await projectIds();
    await assertNoQueries(false, async () => {
      const loaded = await developer.projects;
      expect(loaded.map((p) => p.id)).toEqual(projects);
    });
  });

  it("eager with default scope as class method using find by method", async () => {
    const developer = await EagerDeveloperWithClassMethodDefaultScope.findBy({ name: "David" });
    const projects = await projectIds();
    await assertNoQueries(false, async () => {
      const loaded = await developer!.projects;
      expect(loaded.map((p) => p.id)).toEqual(projects);
    });
  });

  it("eager with default scope as lambda", async () => {
    const developer = await EagerDeveloperWithLambdaDefaultScope.where({ name: "David" }).first();
    const projects = await projectIds();
    await assertNoQueries(false, async () => {
      const loaded = await developer!.projects;
      expect(loaded.map((p) => p.id)).toEqual(projects);
    });
  });

  it("eager with default scope as block", async () => {
    // warm up the habtm cache
    await EagerDeveloperWithBlockDefaultScope.where({ name: "David" }).first();
    const developer = await EagerDeveloperWithBlockDefaultScope.where({ name: "David" }).first();
    const projects = await projectIds();
    await assertNoQueries(false, async () => {
      const loaded = await developer!.projects;
      expect(loaded.map((p) => p.id)).toEqual(projects);
    });
  });

  it("eager with default scope as callable", async () => {
    const developer = await EagerDeveloperWithCallableDefaultScope.where({ name: "David" }).first();
    const projects = await projectIds();
    await assertNoQueries(false, async () => {
      const loaded = await developer!.projects;
      expect(loaded.map((p) => p.id)).toEqual(projects);
    });
  });
});

// ==========================================================================
// EagerAssociationTest (canonical Post/Author/Comment + join-table fixtures) —
// ports of eager_test.rb cases that combine eager-loading with conditions /
// order / select / limit on a *joined* table (joins + includes), conditions on
// join models, default-scope association conditions, and the joins+includes
// collapse-to-one-query path. Needs the taggings/tags/author_addresses/readers/
// people fixtures in addition to the Post/Author/Comment set. Same describe name
// as the other EagerAssociationTest blocks so test:compare matches the Rails
// `EagerAssociationTest` class.
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { authors, posts, people, authorAddresses } = useHandlerFixtures([
    "authors",
    "posts",
    "comments",
    "taggings",
    "tags",
    "authorAddresses",
    "readers",
    "people",
  ]);
  beforeAll(async () => {
    await defineSchema(
      Base.connection,
      {
        authors: canonicalSchema.authors,
        posts: canonicalSchema.posts,
        comments: canonicalSchema.comments,
        taggings: canonicalSchema.taggings,
        tags: canonicalSchema.tags,
        author_addresses: canonicalSchema.author_addresses,
        readers: canonicalSchema.readers,
        people: canonicalSchema.people,
      } as Schema,
      { dropExisting: true },
    );
  });
  registerModel(Post);
  registerModel(Author);
  registerModel(AuthorAddress);
  registerModel(Comment);
  registerModel(Tag);
  registerModel(Tagging);
  registerModel(Reader);
  registerModel(LazyReader);
  registerModel(Person);

  it("eager loading with order on joined table preloads", async () => {
    let loaded: Post[] = [];
    await assertQueriesCount(2, false, async () => {
      loaded = await Post.all()
        .joins("comments")
        .includes("author")
        .order("comments.id DESC")
        .toArray();
    });
    expect(loaded[2].id).toBe(posts("eager_other").id);
    await assertNoQueries(false, () => {
      expect((loaded[2].association("author").target as Base).id).toBe(authors("mary").id);
    });
  });

  it("eager loading with conditions on joined table preloads", async () => {
    let loaded: Post[] = [];
    await assertQueriesCount(2, false, async () => {
      loaded = await Post.all()
        .select("distinct posts.*")
        .includes("author")
        .joins("comments")
        .where("comments.body like 'Thank you%'")
        .order("posts.id")
        .toArray();
    });
    expect(loaded.map((p) => Number(p.id))).toEqual([Number(posts("welcome").id)]);
    await assertNoQueries(false, () => {
      expect((loaded[0].association("author").target as Base).id).toBe(authors("david").id);
    });

    await assertQueriesCount(2, false, async () => {
      loaded = await Post.all()
        .includes("author")
        .joins({ taggings: "tag" })
        .where("tags.name = 'General'")
        .order("posts.id")
        .toArray();
    });
    expect(loaded.map((p) => Number(p.id))).toEqual([
      Number(posts("welcome").id),
      Number(posts("thinking").id),
    ]);

    await assertQueriesCount(2, false, async () => {
      loaded = await Post.all()
        .includes("author")
        .joins({ taggings: { tag: "taggings" } })
        .where("taggings_tags.super_tag_id=2")
        .order("posts.id")
        .toArray();
    });
    expect(loaded.map((p) => Number(p.id))).toEqual([
      Number(posts("welcome").id),
      Number(posts("thinking").id),
    ]);
  });

  it("eager loading with select on joined table preloads", async () => {
    let loaded: Post[] = [];
    await assertQueriesCount(2, false, async () => {
      loaded = await Post.all()
        .select("posts.*, authors.name as author_name")
        .includes("comments")
        .joins("author")
        .order("posts.id")
        .toArray();
    });
    expect(loaded[0].id).toBe(posts("welcome").id);
    expect(loaded[0].readAttribute("author_name")).toBe("David");
    await assertNoQueries(false, () => {
      expect((loaded[0].association("comments").target as Base[]).length).toBe(2);
    });
  });

  it("eager loading with conditions on join model preloads", async () => {
    let loaded: Author[] = [];
    await assertQueriesCount(2, false, async () => {
      loaded = await Author.all()
        .includes("authorAddress")
        .joins("comments")
        .where("posts.title like 'Welcome%'")
        .toArray();
    });
    expect(loaded[0].id).toBe(authors("david").id);
    await assertNoQueries(false, () => {
      expect((loaded[0].association("authorAddress").target as Base).id).toBe(
        authorAddresses("david_address").id,
      );
    });
  });

  it("eager with has many and limit and conditions on the eagers", async () => {
    const david = await Author.find(authors("david").id);
    const loaded = await (david as any).posts
      .includes("comments")
      .where("comments.body like 'Normal%' OR comments.type = 'SpecialComment'")
      .references("comments")
      .limit(2)
      .toArray();
    expect(loaded).toHaveLength(2);

    const count = await Post.includes("comments", "author")
      .where(
        "authors.name = 'David' AND (comments.body like 'Normal%' OR comments.type = 'SpecialComment')",
      )
      .references("authors", "comments")
      .limit(2)
      .count();
    expect(count).toBe(loaded.length);
  });

  it("eager with has many and limit and scoped conditions on the eagers", async () => {
    const david = await Author.find(authors("david").id);
    let loaded: Post[] = [];
    await Post.scoping(
      Post.includes("comments")
        .where("comments.body like 'Normal%' OR comments.type = 'SpecialComment'")
        .references("comments"),
      async () => {
        loaded = (await (david as any).posts.limit(2).toArray()) as Post[];
        expect(loaded).toHaveLength(2);
      },
    );

    await Post.scoping(
      Post.includes("comments", "author")
        .where(
          "authors.name = 'David' AND (comments.body like 'Normal%' OR comments.type = 'SpecialComment')",
        )
        .references("authors", "comments"),
      async () => {
        const count = await Post.limit(2).count();
        expect(count).toBe(loaded.length);
      },
    );
  });

  it("preload has many with association condition and default scope", async () => {
    const post = await Post.create({ title: "Beaches", body: "I like beaches!" });
    await Reader.create({ person_id: people("david").id, post_id: post.id });
    await LazyReader.create({ person_id: people("susan").id, post_id: post.id });

    expect(((await (post as any).lazyReaders.toArray()) as Base[]).length).toBe(1);
    expect(((await (post as any).lazyReadersSkimmersOrNot.toArray()) as Base[]).length).toBe(2);

    const postWithReaders = await Post.includes("lazyReadersSkimmersOrNot").find(post.id);
    expect(
      ((await (postWithReaders as any).lazyReadersSkimmersOrNot.toArray()) as Base[]).length,
    ).toBe(2);
  });

  it("joins with includes should preload via joins", async () => {
    let post: Post | undefined;
    await assertQueriesCount(1, false, async () => {
      const loaded = await Post.includes("comments")
        .joins("comments")
        .order("posts.id desc")
        .toArray();
      post = loaded[0];
    });
    await assertNoQueries(false, () => {
      expect((post!.association("comments").target as Base[]).length).not.toBe(0);
    });
  });

  // trails-only regression: extends Rails' single-include
  // test_joins_with_includes_should_preload_via_joins (eager_test.rb:1373) to the
  // multi-include fan-out branch — `comments` collapses onto the INNER join from
  // joins(...) while the non-intersecting `author` is join-loaded as a deduped
  // OUTER join, all in one query. No upstream Rails test exercises this path.
  it("joins with multiple includes should preload via joins", async () => {
    let post: Post | undefined;
    await assertQueriesCount(1, false, async () => {
      const loaded = await Post.includes("comments", "author")
        .joins("comments")
        .order("posts.id desc")
        .toArray();
      post = loaded[0];
    });
    await assertNoQueries(false, () => {
      expect((post!.association("comments").target as Base[]).length).not.toBe(0);
      expect(post!.association("author").target as Base).toBeTruthy();
    });
  });

  it("nested loading through has one association", async () => {
    const aa = await AuthorAddress.all()
      .includes({ author: "posts" })
      .find(authorAddresses("david_address").id);
    const author = aa.association("author").target as Author;
    expect(await (author as any).posts.count()).toBe((author as any).posts.target.length);
  });

  it("nested loading through has one association with order", async () => {
    const aa = await AuthorAddress.all()
      .includes({ author: "posts" })
      .order("author_addresses.id")
      .find(authorAddresses("david_address").id);
    const author = aa.association("author").target as Author;
    expect(await (author as any).posts.count()).toBe((author as any).posts.target.length);
  });

  it("nested loading through has one association with order on association", async () => {
    const aa = await AuthorAddress.all()
      .includes({ author: "posts" })
      .order("authors.id")
      .find(authorAddresses("david_address").id);
    const author = aa.association("author").target as Author;
    expect(await (author as any).posts.count()).toBe((author as any).posts.target.length);
  });

  it("nested loading through has one association with order on nested association", async () => {
    const aa = await AuthorAddress.all()
      .includes({ author: "posts" })
      .order("posts.id")
      .find(authorAddresses("david_address").id);
    const author = aa.association("author").target as Author;
    expect(await (author as any).posts.count()).toBe((author as any).posts.target.length);
  });

  it("nested loading through has one association with conditions", async () => {
    const aa = await AuthorAddress.references("author_addresses")
      .includes({ author: "posts" })
      .where("author_addresses.id > 0")
      .find(authorAddresses("david_address").id);
    const author = aa.association("author").target as Author;
    expect(await (author as any).posts.count()).toBe((author as any).posts.target.length);
  });

  it("nested loading through has one association with conditions on association", async () => {
    const aa = await AuthorAddress.references("authors")
      .includes({ author: "posts" })
      .where("authors.id > 0")
      .find(authorAddresses("david_address").id);
    const author = aa.association("author").target as Author;
    expect(await (author as any).posts.count()).toBe((author as any).posts.target.length);
  });

  it("nested loading through has one association with conditions on nested association", async () => {
    const aa = await AuthorAddress.references("posts")
      .includes({ author: "posts" })
      .where("posts.id > 0")
      .find(authorAddresses("david_address").id);
    const author = aa.association("author").target as Author;
    expect(await (author as any).posts.count()).toBe((author as any).posts.target.length);
  });
});

// ==========================================================================
// EagerAssociationTest (canonical Post/Author/Comment/Category fixtures) — ports
// of eager_test.rb cases that exercise plain preloading/eager-loading over the
// real Post/Author/Comment/Category models + their fixtures. Same describe name
// as the other EagerAssociationTest blocks so test:compare matches the Rails
// `EagerAssociationTest` class.
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { authors, posts, comments, categories, people } = useHandlerFixtures([
    "authors",
    "posts",
    "comments",
    "categories",
    "categoriesPosts",
    "people",
    "readers",
  ]);
  beforeAll(async () => {
    await defineSchema(
      Base.connection,
      {
        authors: canonicalSchema.authors,
        posts: canonicalSchema.posts,
        comments: canonicalSchema.comments,
        categories: canonicalSchema.categories,
        categories_posts: canonicalSchema.categories_posts,
        people: canonicalSchema.people,
        readers: canonicalSchema.readers,
      } as Schema,
      { dropExisting: true },
    );
  });
  registerModel(Post);
  registerModel(SpecialPost);
  registerModel(Author);
  registerModel(Comment);
  registerModel(VerySpecialComment);
  registerModel(Category);
  registerModel(SpecialCategory);
  registerModel(Categorization);
  registerModel(Person);
  registerModel(Reader);

  it("loading with multiple associations", async () => {
    const loaded = await Post.all()
      .includes("comments", "author", "categories")
      .order("posts.id")
      .toArray();
    const first = loaded[0];
    expect((first.association("comments").target as Base[]).length).toBe(2);
    expect((first.association("categories").target as Base[]).length).toBe(2);
    const commentIds = (first.association("comments").target as Base[]).map((c) => c.id);
    expect(commentIds).toContain(comments("greetings").id);
  });

  it("eager count performed on a has many association with multi table conditional", async () => {
    const author = authors("david") as any;
    const allPosts = (await author.posts.toArray()) as Base[];
    let authorPostsWithoutComments = 0;
    for (const post of allPosts) {
      if (((await (post as any).comments.toArray()) as Base[]).length === 0)
        authorPostsWithoutComments++;
    }
    const count = await author.posts
      .includes("comments")
      .where("comments.id is null")
      .references("comments")
      .count();
    expect(count).toBe(authorPostsWithoutComments);
  });

  it("eager count performed on a has many through association with multi table conditional", async () => {
    const person = people("michael") as any;
    const allPosts = (await person.posts.toArray()) as Base[];
    let personPostsWithoutComments = 0;
    for (const post of allPosts) {
      if (((await (post as any).comments.toArray()) as Base[]).length === 0)
        personPostsWithoutComments++;
    }
    const count = await person.postsWithNoComments.count();
    expect(count).toBe(personPostsWithoutComments);
  });

  it("eager with multi table conditional properly counts the records when using size", async () => {
    const author = authors("david") as any;
    const allPosts = (await author.posts.toArray()) as Base[];
    const postsWithNoComments: Base[] = [];
    for (const post of allPosts) {
      if (((await (post as any).comments.toArray()) as Base[]).length === 0)
        postsWithNoComments.push(post);
    }
    expect(await author.postsWithNoComments.size()).toBe(postsWithNoComments.length);
    const loaded = (await author.postsWithNoComments.toArray()) as Base[];
    expect(loaded.map((p) => p.id)).toEqual(postsWithNoComments.map((p) => p.id));
  });

  it("test_calculate_with_string_in_from_and_eager_loading", async () => {
    const count = await Post.from("authors, posts")
      .eagerLoad("comments")
      .where("posts.author_id = authors.id")
      .count();
    expect(count).toBe(10);
  });

  it("test_with_two_tables_in_from_without_getting_double_quoted", async () => {
    const loaded = await Post.select("posts.*")
      .from("authors, posts")
      .eagerLoad("comments")
      .where("posts.author_id = authors.id")
      .order("posts.id")
      .toArray();
    const firstComments = loaded[0].association("comments").target as Base[];
    expect(firstComments).toHaveLength(2);
  });

  it("including associations with where.not adds implicit references", async () => {
    let author!: Author;
    await assertQueriesCount(2, false, async () => {
      author = (await Author.includes("posts")
        .whereNot({ posts: { title: "Welcome to the weblog" } })
        .last()) as Author;
    });
    await assertNoQueries(false, () => {
      expect((author.association("posts").target as Base[]).length).toBe(2);
    });
  });

  it("loading from an association that has a hash of conditions", async () => {
    const author = await Author.all()
      .includes("helloPostsWithHashConditions")
      .find(authors("david").id);
    const helloPosts = (await author.association("helloPosts").loadTarget()) as Base[];
    expect(helloPosts.length).toBeGreaterThan(0);
  });

  it("preloading does not cache has many association subset when preloaded with a through association", async () => {
    const author = (await Author.all()
      .includes("commentsWithOrderAndConditions", "posts")
      .order("authors.id")
      .first()) as Author;
    await assertNoQueries(false, () => {
      expect((author.association("commentsWithOrderAndConditions").target as Base[]).length).toBe(
        2,
      );
    });
    await assertNoQueries(false, () => {
      expect((author.association("posts").target as Base[]).length).toBe(5);
    });
  });

  it("works in combination with order(:symbol) and reorder(:symbol)", async () => {
    let author = (await Author.all()
      .includes("posts")
      .references("posts")
      .order("name")
      .where("posts.title IS NOT NULL")
      .first()) as Author;
    expect(author.id).toBe(authors("bob").id);

    author = (await Author.all()
      .includes("posts")
      .references("posts")
      .reorder("name")
      .where("posts.title IS NOT NULL")
      .first()) as Author;
    expect(author.id).toBe(authors("bob").id);
  });

  it("loading with one association with non preload", async () => {
    const loaded = await Post.all().includes("lastComment").order("comments.id DESC").toArray();
    const post = loaded.find((p) => p.id === posts("welcome").id)!;
    const fresh = await Post.find(posts("welcome").id);
    const expected = (await fresh.association("lastComment").loadTarget()) as Base | null;
    const actual = post.association("lastComment").target as Base | null;
    expect(actual?.id).toBe(expected?.id);
  });

  it("preconfigured includes with belongs to", async () => {
    const post = await Post.find(posts("welcome").id);
    const author = (await post.association("authorWithPosts").loadTarget()) as Author;
    await assertNoQueries(false, () => {
      expect((author.association("posts").target as Base[]).length).toBe(5);
    });
  });

  it("preconfigured includes with has many", async () => {
    const david = await Author.find(authors("david").id);
    const loaded = (await david.association("postsWithComments").loadTarget()) as Base[];
    await assertNoQueries(false, () => {
      expect(loaded.length).toBe(5);
      const one = loaded.find((p) => p.id === posts("welcome").id)!;
      expect((one.association("comments").target as Base[]).length).toBe(2);
    });
  });

  it("preconfigured includes with has one", async () => {
    const post = await Post.find(posts("sti_comments").id);
    const comment = (await post.association("verySpecialCommentWithPost").loadTarget()) as Base;
    await assertNoQueries(false, () => {
      expect((comment.association("post").target as Base).id).toBe(posts("sti_comments").id);
    });
  });

  it("eager with floating point numbers", async () => {
    await assertQueriesCount(2, false, async () => {
      // Before changes, the floating-point numbers will be interpreted as table names and will cause this to run in one query
      await Comment.all().where("123.456 = 123.456").includes("post").toArray();
    });
  });

  it("eager association loading with belongs to and limit", async () => {
    const loaded = await Comment.all().includes("post").limit(5).order("comments.id").toArray();
    expect(loaded).toHaveLength(5);
    expect(loaded.map((c) => Number(c.id))).toEqual([1, 2, 3, 5, 6]);
  });

  it("eager association loading with belongs to and limit and conditions", async () => {
    const loaded = await Comment.all()
      .includes("post")
      .where("post_id = 4")
      .limit(3)
      .order("comments.id")
      .toArray();
    expect(loaded).toHaveLength(3);
    expect(loaded.map((c) => Number(c.id))).toEqual([5, 6, 7]);
  });

  it("eager association loading with belongs to and limit and offset", async () => {
    const loaded = await Comment.all()
      .includes("post")
      .limit(3)
      .offset(2)
      .order("comments.id")
      .toArray();
    expect(loaded).toHaveLength(3);
    expect(loaded.map((c) => Number(c.id))).toEqual([3, 5, 6]);
  });

  it("eager association loading with belongs to and limit and offset and conditions", async () => {
    const loaded = await Comment.all()
      .includes("post")
      .where("post_id = 4")
      .limit(3)
      .offset(1)
      .order("comments.id")
      .toArray();
    expect(loaded).toHaveLength(3);
    expect(loaded.map((c) => Number(c.id))).toEqual([6, 7, 8]);
  });

  it("eager association loading with belongs to and limit and offset and conditions array", async () => {
    const loaded = await Comment.all()
      .includes("post")
      .where("post_id = ?", 4)
      .limit(3)
      .offset(1)
      .order("comments.id")
      .toArray();
    expect(loaded).toHaveLength(3);
    expect(loaded.map((c) => Number(c.id))).toEqual([6, 7, 8]);
  });

  it("eager association loading with belongs to and conditions string with unquoted table name", async () => {
    expect(() =>
      Comment.all()
        .includes("post")
        .references("posts")
        .where("posts.id = ?", posts("sti_comments").id),
    ).not.toThrow();
  });

  it("eager association loading with belongs to and conditions string with quoted table name", async () => {
    const quotedPostsId = Comment.connection.quoteTableName("posts.id");
    expect(() =>
      Comment.all()
        .includes("post")
        .references("posts")
        .where(`${quotedPostsId} = ?`, posts("welcome").id),
    ).not.toThrow();
  });

  it("eager association loading with belongs to and order string with unquoted table name", async () => {
    const loaded = await Comment.all()
      .includes("post")
      .references("posts")
      .order("posts.id")
      .toArray();
    expect(loaded.map((c) => c.id)).toContain(comments("greetings").id);
  });

  it("eager association loading with belongs to and order string with quoted table name", async () => {
    const quotedPostsId = Comment.connection.quoteTableName("posts.id");
    const loaded = await Comment.all()
      .includes("post")
      .references("posts")
      .order(quotedPostsId)
      .toArray();
    expect(loaded.map((c) => c.id)).toContain(comments("greetings").id);
  });

  it("eager association loading with belongs to and limit and multiple associations", async () => {
    const loaded = await Post.all()
      .includes("author", "verySpecialComment")
      .limit(1)
      .order("posts.id")
      .toArray();
    expect(loaded).toHaveLength(1);
    expect(loaded.map((p) => Number(p.id))).toEqual([Number(posts("welcome").id)]);
  });

  it("eager association loading with belongs to and limit and offset and multiple associations", async () => {
    const loaded = await Post.all()
      .includes("author", "verySpecialComment")
      .limit(1)
      .offset(1)
      .order("posts.id")
      .toArray();
    expect(loaded).toHaveLength(1);
    expect(loaded.map((p) => Number(p.id))).toEqual([Number(posts("thinking").id)]);
  });

  it("eager association loading with belongs to and conditions hash", async () => {
    const loaded = await Comment.all()
      .includes("post")
      .where({ posts: { id: 4 } })
      .limit(3)
      .order("comments.id")
      .toArray();
    expect(loaded).toHaveLength(3);
    expect(loaded.map((c) => Number(c.id))).toEqual([5, 6, 7]);
    await assertNoQueries(false, () => {
      expect(loaded[0].association("post").target).toBeDefined();
    });
  });

  it("eager with has many and limit", async () => {
    const loaded = await Post.all()
      .order("posts.id asc")
      .includes("author", "comments")
      .limit(2)
      .toArray();
    expect(loaded).toHaveLength(2);
    const sum = loaded.reduce(
      (acc, post) => acc + (post.association("comments").target as Base[]).length,
      0,
    );
    expect(sum).toBe(3);
  });

  it("eager with has many and limit and conditions", async () => {
    const loaded = await Post.all()
      .includes("author", "comments")
      .limit(2)
      .where("posts.body = 'hello'")
      .order("posts.id")
      .toArray();
    expect(loaded).toHaveLength(2);
    expect(loaded.map((post) => Number(post.id))).toEqual([4, 5]);
  });

  it("eager with has many and limit and conditions array", async () => {
    const loaded = await Post.all()
      .includes("author", "comments")
      .limit(2)
      .where("posts.body = ?", "hello")
      .order("posts.id")
      .toArray();
    expect(loaded).toHaveLength(2);
    expect(loaded.map((post) => Number(post.id))).toEqual([4, 5]);
  });

  it("eager with has many and limit and conditions array on the eagers", async () => {
    const david = authors("david").name;
    const posts = await Post.includes("author", "comments")
      .limit(2)
      .references("author")
      .where("authors.name = ?", david)
      .toArray();
    expect(posts).toHaveLength(2);

    const count = await Post.includes("author", "comments")
      .limit(2)
      .references("author")
      .where("authors.name = ?", david)
      .count();
    expect(count).toBe(posts.length);
  });

  it("eager with has many and limit and high offset", async () => {
    const posts = await Post.all()
      .includes("author", "comments")
      .limit(2)
      .offset(10)
      .where({ "authors.name": "David" })
      .toArray();
    expect(posts).toHaveLength(0);
  });

  it("eager with has many and limit and high offset and multiple array conditions", async () => {
    await assertQueriesCount(1, false, async () => {
      const posts = await Post.references("authors", "comments")
        .includes("author", "comments")
        .limit(2)
        .offset(10)
        .where("authors.name = ? and comments.body = ?", authors("david").name, "go wild")
        .toArray();
      expect(posts).toHaveLength(0);
    });
  });

  it("eager with has many and limit and high offset and multiple hash conditions", async () => {
    await assertQueriesCount(1, false, async () => {
      const posts = await Post.all()
        .includes("author", "comments")
        .limit(2)
        .offset(10)
        .where({ "authors.name": "David", "comments.body": "go wild" })
        .toArray();
      expect(posts).toHaveLength(0);
    });
  });

  it("count eager with has many and limit and high offset", async () => {
    const count = await Post.all()
      .includes("author", "comments")
      .limit(2)
      .offset(10)
      .where({ "authors.name": "David" })
      .count("*");
    expect(count).toBe(0);
  });

  it("eager with has many and limit with no results", async () => {
    const posts = await Post.all()
      .includes("author", "comments")
      .limit(2)
      .where("posts.title = 'magic forest'")
      .toArray();
    expect(posts).toHaveLength(0);
  });

  it("test_type_cast_in_where_references_association_name", async () => {
    const parent = await Comment.find(comments("greetings").id);
    const child = (await (parent as any).children.create({
      label: "child",
      body: "hi",
      post_id: (parent as any).post_id,
    })) as Comment;

    const comment = (await Comment.includes("children")
      .where({ "children.label": "child" })
      .last()) as Comment;

    expect(comment.id).toBe(parent.id);
    const children = (await (comment as any).children.toArray()) as Base[];
    expect(children.map((c) => Number(c.id))).toEqual([Number(child.id)]);
  });

  it("eager association loading with explicit join habtm", async () => {
    // Proves the JOIN path is taken (not the preload fallback): the eager-load
    // SQL must reference both the HABTM join table and the target table.
    const rel = Post.all().eagerLoad("categories").order("posts.id");
    const sql = rel.toSql();
    expect(sql).toMatch(/LEFT OUTER JOIN.*categories_posts/);
    expect(sql).toMatch(/LEFT OUTER JOIN.*categories[^_]/);

    const loaded = await rel.toArray();
    const welcome = loaded.find((p) => p.id === posts("welcome").id)!;
    const thinking = loaded.find((p) => p.id === posts("thinking").id)!;
    expect(welcome.association("categories").target as Base[]).toHaveLength(2);
    expect(thinking.association("categories").target as Base[]).toHaveLength(1);
  });

  it("eager association loading with habtm via preload", async () => {
    const loaded = await Post.all().preload("categories").order("posts.id").toArray();
    const welcome = loaded.find((p) => p.id === posts("welcome").id)!;
    expect(welcome.association("categories").target as Base[]).toHaveLength(2);
  });

  it("eager with has and belongs to many and limit", async () => {
    const loaded = await Post.all().includes("categories").order("posts.id").limit(3).toArray();
    expect(loaded).toHaveLength(3);
    expect(loaded[0].association("categories").target as Base[]).toHaveLength(2);
    expect(loaded[1].association("categories").target as Base[]).toHaveLength(1);
    expect(loaded[2].association("categories").target as Base[]).toHaveLength(0);
    const cats0 = loaded[0].association("categories").target as Base[];
    const cats1 = loaded[1].association("categories").target as Base[];
    expect(cats0.some((c) => c.id === categories("technology").id)).toBe(true);
    expect(cats1.some((c) => c.id === categories("general").id)).toBe(true);
  });

  it("eager association loading with habtm", async () => {
    const loaded = await Post.all().includes("categories").order("posts.id").toArray();
    expect(loaded[0].association("categories").target as Base[]).toHaveLength(2);
    expect(loaded[1].association("categories").target as Base[]).toHaveLength(1);
    expect(loaded[2].association("categories").target as Base[]).toHaveLength(0);
    const cats0 = loaded[0].association("categories").target as Base[];
    const cats1 = loaded[1].association("categories").target as Base[];
    expect(cats0.some((c) => c.id === categories("technology").id)).toBe(true);
    expect(cats1.some((c) => c.id === categories("general").id)).toBe(true);
  });

  it("eager habtm with association inheritance", async () => {
    const post = await Post.all().includes("specialCategories").find(posts("sti_habtm").id);
    const specials = post.association("specialCategories").target as Base[];
    expect(specials).toHaveLength(1);
    for (const specialCategory of specials) {
      expect(specialCategory.constructor.name).toBe("SpecialCategory");
    }
  });

  it("eager with multiple associations with same table has many and habtm", async () => {
    function sortById(records: Base[]) {
      return [...records].sort((a, b) => Number(a.id) - Number(b.id));
    }
    const postTypes = ["posts", "otherPosts", "specialPosts"] as const;
    for (const ModelClass of [Author, Category] as (typeof Author | typeof Category)[]) {
      const tableName = ModelClass.tableName;
      const pk = ModelClass.primaryKey as string;
      const d1 = (await (ModelClass as any).order(`${tableName}.${pk}`).toArray()) as Base[];
      const d2 = (await (ModelClass as any)
        .order(`${tableName}.${pk}`)
        .includes(...postTypes)
        .toArray()) as Base[];
      for (const postType of postTypes.slice(1)) {
        const d3 = (await (ModelClass as any)
          .order(`${tableName}.${pk}`)
          .includes("posts", postType)
          .toArray()) as Base[];
        for (let i = 0; i < d1.length; i++) {
          expect(d1[i].id).toEqual(d2[i].id);
          expect(d3[i].id).toEqual(d1[i].id);
          const d1Posts = sortById((await (d1[i] as any).posts.toArray()) as Base[]);
          const d2Posts = sortById(d2[i].association("posts").target as Base[]);
          const d3Posts = sortById(d3[i].association("posts").target as Base[]);
          expect(d2Posts.map((p) => p.id)).toEqual(d1Posts.map((p) => p.id));
          expect(d3Posts.map((p) => p.id)).toEqual(d1Posts.map((p) => p.id));
          const d1Type = sortById((await (d1[i] as any)[postType].toArray()) as Base[]);
          const d2Type = sortById(d2[i].association(postType).target as Base[]);
          const d3Type = sortById(d3[i].association(postType).target as Base[]);
          expect(d2Type.map((p) => p.id)).toEqual(d1Type.map((p) => p.id));
          expect(d3Type.map((p) => p.id)).toEqual(d1Type.map((p) => p.id));
        }
      }
    }
  });

  it("preconfigured includes with habtm", async () => {
    const david = await Author.find(authors("david").id);
    const postsList = (await david.association("postsWithCategories").loadTarget()) as Base[];
    const one = postsList.find((p) => Number(p.id) === 1)!;
    await assertNoQueries(false, () => {
      expect(postsList).toHaveLength(5);
      expect(one.association("categories").target as Base[]).toHaveLength(2);
    });
  });

  it("preconfigured includes with has many and habtm", async () => {
    const david = await Author.find(authors("david").id);
    const postsList = (await david
      .association("postsWithCommentsAndCategories")
      .loadTarget()) as Base[];
    const one = postsList.find((p) => Number(p.id) === 1)!;
    await assertNoQueries(false, () => {
      expect(postsList).toHaveLength(5);
      expect(one.association("comments").target as Base[]).toHaveLength(2);
      expect(one.association("categories").target as Base[]).toHaveLength(2);
    });
  });
});

// ==========================================================================
// EagerAssociationTest (canonical Pet/Owner fixtures) — ports the belongs_to +
// foreign-key eager-loading case over the real Pet/Owner models. Same describe
// name as the other EagerAssociationTest blocks so test:compare matches the
// Rails `EagerAssociationTest` class.
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { pets } = useHandlerFixtures(["owners", "pets"]);
  beforeAll(async () => {
    await defineSchema(
      Base.connection,
      {
        owners: canonicalSchema.owners,
        pets: canonicalSchema.pets,
      } as Schema,
      { dropExisting: true },
    );
  });
  registerModel(Pet);
  registerModel(Owner);

  it("eager association loading with belongs to and foreign keys", async () => {
    const pets = await Pet.all().includes("owner").toArray();
    expect(pets).toHaveLength(4);
  });

  it("including association based on sql condition and no database column", async () => {
    const owner = (await Owner.includingLastPet().first()) as Owner;
    const lastPet = owner.association("lastPet").target as Pet;
    expect(lastPet.id).toBe(pets("parrot").id);
  });
});

// ==========================================================================
// EagerAssociationTest (canonical AuthorFavorite/Author fixtures) — ports the
// belongs_to inferred-foreign-key eager-loading case over the real
// AuthorFavorite/Author models. Same describe name as the other
// EagerAssociationTest blocks so test:compare matches the Rails
// `EagerAssociationTest` class.
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { authors } = useHandlerFixtures(["authors", "authorFavorites"]);
  beforeAll(async () => {
    await defineSchema(
      Base.connection,
      {
        authors: canonicalSchema.authors,
        author_favorites: canonicalSchema.author_favorites,
      } as Schema,
      { dropExisting: true },
    );
  });
  registerModel(Author);
  registerModel(AuthorFavorite);

  it("eager association loading with belongs to inferred foreign key from association name", async () => {
    const authorFavorite = (await AuthorFavorite.all()
      .includes("favoriteAuthor")
      .first()) as AuthorFavorite;
    await assertNoQueries(false, () => {
      expect((authorFavorite.association("favoriteAuthor").target as Author).id).toBe(
        authors("mary").id,
      );
    });
  });
});

// ==========================================================================
// EagerAssociationTest (canonical Firm/Client fixtures) — ports the
// attribute-alias + self-join where-hash case over the real Firm/Client models
// (both on the `companies` table). Same describe name as the other
// EagerAssociationTest blocks so test:compare matches the Rails
// `EagerAssociationTest` class.
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { companies } = useHandlerFixtures(["companies"]);
  beforeAll(async () => {
    // Partial schema: the eager SELECT projects only real `companies` columns.
    await defineSchema({ companies: canonicalSchema.companies }, { dropExisting: true });
  });
  registerModel(Company);
  registerModel(Firm);
  registerModel(Client);

  it("test_attribute_alias_in_where_references_association_name", async () => {
    const firm = (await Firm.includes("clients")
      .where({ "clients.newName": "Summit" })
      .last()) as Firm;
    expect(firm.id).toBe(companies("first_firm").id);
    const clients = (await (firm as any).clients.toArray()) as Base[];
    expect(clients.map((c) => Number(c.id))).toEqual([Number(companies("first_client").id)]);
  });
});

// ==========================================================================
// EagerAssociationTest (companies + accounts fixtures) — `has_one
// :account_using_primary_key` keys Account.firm_id off Firm.firm_id (the
// association's `primary_key: "firm_id"`), so eager/preloading it returns the
// signals37 account for first_firm (firm_id 1). Same describe name so
// test:compare matches the Rails `EagerAssociationTest` class.
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { accounts } = useHandlerFixtures(["companies", "accounts"]);
  beforeAll(async () => {
    await defineSchema(
      {
        companies: canonicalSchema.companies,
        accounts: canonicalSchema.accounts,
      } as Schema,
      { dropExisting: true },
    );
  });
  registerModel(Company);
  registerModel(Firm);
  registerModel(Client);
  registerModel(Account);

  it("preload has one using primary key", async () => {
    const expected = accounts("signals37");
    const firm = (await Firm.all()
      .includes("accountUsingPrimaryKey")
      .order("companies.id")
      .first()) as Firm;
    await assertNoQueries(false, async () => {
      const account = (firm as any).accountUsingPrimaryKey;
      expect(account.id).toBe(expected.id);
    });
  });

  it("include has one using primary key", async () => {
    const expected = accounts("signals37");
    const firms = await Firm.all()
      .includes("accountUsingPrimaryKey")
      .order("accounts.id")
      .toArray();
    const firm = firms.find((f) => Number(f.id) === 1)!;
    await assertNoQueries(false, async () => {
      const account = (firm as any).accountUsingPrimaryKey;
      expect(account.id).toBe(expected.id);
    });
  });
});

// ==========================================================================
// EagerAssociationTest (canonical Sponsor/Member polymorphic fixtures) — ports
// the custom `foreign_type` preload case (Sponsor#thing reuses the
// sponsorable_* columns via `foreign_type:`/`foreign_key:`).
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { sponsors, members } = useHandlerFixtures(["members", "sponsors"]);
  beforeAll(async () => {
    await defineSchema(
      { members: canonicalSchema.members, sponsors: canonicalSchema.sponsors } as Schema,
      { dropExisting: true },
    );
  });
  registerModel(Sponsor);
  registerModel(Member);

  it("preloading polymorphic with custom foreign type", async () => {
    const grouchoId = members("groucho").id;
    const sponsorId = sponsors("moustache_club_sponsor_for_groucho").id;
    let sponsor!: Sponsor;
    await assertQueriesCount(2, false, async () => {
      sponsor = (await Sponsor.includes("thing").where({ id: sponsorId }).first()) as Sponsor;
    });
    await assertNoQueries(false, async () => {
      const thing = (await sponsor.thing) as Base;
      expect(thing.id).toBe(grouchoId);
    });
  });
});

// ==========================================================================
// EagerAssociationTest (canonical Author/Essay polymorphic fixtures) — ports the
// existential-predicate preload cases over Essay#writer (polymorphic belongs_to,
// primary_key: name).
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { authors } = useHandlerFixtures(["authors", "essays"]);
  beforeAll(async () => {
    await defineSchema(
      { authors: canonicalSchema.authors, essays: canonicalSchema.essays } as Schema,
      { dropExisting: true },
    );
  });
  registerModel(Author);
  registerModel(Essay);

  it("preloading with a polymorphic association and using the existential predicate but also using a select", async () => {
    const david = await Author.find(authors("david").id);
    const essay = (await (david as any).essays.includes("writer").first()) as Essay;
    expect(((await essay.writer) as Base).id).toBe(david.id);

    await expect(
      (david as any).essays.includes("writer").select("name").isAny(),
    ).resolves.not.toThrow();
  });

  it("preloading with a polymorphic association and using the existential predicate", async () => {
    const david = await Author.find(authors("david").id);
    const essay = (await (david as any).essays.includes("writer").first()) as Essay;
    expect(((await essay.writer) as Base).id).toBe(david.id);

    await (david as any).essays.includes("writer").isAny();
    await (david as any).essays.includes("writer").exists();
    await (david as any).essays.includes("owner").where("name IS NOT NULL").exists();
  });
});

// ==========================================================================
// EagerAssociationTest (canonical Post/Tag/Tagging fixtures) — ports the
// polymorphic has_many :through (`tags` through polymorphic `taggings`) cases
// that reference the joined `tags` table via `references`/`eager_load`.
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { posts, taggings } = useHandlerFixtures(["posts", "tags", "taggings"]);
  beforeAll(async () => {
    await defineSchema(
      {
        posts: canonicalSchema.posts,
        tags: canonicalSchema.tags,
        taggings: canonicalSchema.taggings,
      } as Schema,
      { dropExisting: true },
    );
  });
  registerModel(Post);
  registerModel(SpecialPost);
  registerModel(Tag);
  registerModel(Tagging);

  it("polymorphic type condition", async () => {
    let post = await Post.all().includes("taggings").find(posts("thinking").id);
    expect((post.association("taggings").target as Base[]).map((t) => t.id)).toContain(
      taggings("thinking_general").id,
    );
    post = await SpecialPost.all().includes("taggings").find(posts("thinking").id);
    expect((post.association("taggings").target as Base[]).map((t) => t.id)).toContain(
      taggings("thinking_general").id,
    );
  });

  it("preloading a polymorphic association with references to the associated table", async () => {
    const post = (await Post.includes("tags")
      .references("tags")
      .where("tags.name = ?", "General")
      .first()) as Post;
    expect(post.id).toBe(posts("welcome").id);
  });

  it("eager-loading a polymorphic association with references to the associated table", async () => {
    const post = (await Post.eagerLoad("tags").where("tags.name = ?", "General").first()) as Post;
    expect(post.id).toBe(posts("welcome").id);
  });
});

// ==========================================================================
// EagerAssociationTest (canonical Job/Person/Reference fixtures) — ports the
// eager_test.rb cases that exercise eager loading over quoted table and column
// names. Same describe name as the other EagerAssociationTest blocks so
// test:compare matches the Rails `EagerAssociationTest` class.
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { jobs, references, people } = useHandlerFixtures(["jobs", "references", "people"]);
  beforeAll(async () => {
    await defineSchema(
      {
        jobs: canonicalSchema.jobs,
        references: canonicalSchema.references,
        people: canonicalSchema.people,
      } as Schema,
      { dropExisting: true },
    );
  });
  registerModel(Job);
  registerModel(Reference);
  registerModel(Person);

  it("eager load belongs to quotes table and column names", async () => {
    const job = await Job.includes("idealReference").find(jobs("unicyclist").id);
    await assertNoQueries(false, () => {
      expect((job.association("idealReference").target as Base).id).toBe(
        references("michael_unicyclist").id,
      );
    });
  });

  it("eager load has one quotes table and column names", async () => {
    const michael = await Person.all().includes("favoriteReference").find(people("michael").id);
    await assertNoQueries(false, () => {
      expect((michael.association("favoriteReference").target as Base).id).toBe(
        references("michael_unicyclist").id,
      );
    });
  });

  it("eager load has many quotes table and column names", async () => {
    const michael = await Person.all().includes("references").find(people("michael").id);
    await assertNoQueries(false, () => {
      const sorted = (michael.association("references").target as Base[])
        .slice()
        .sort((a, b) => Number(a.id) - Number(b.id));
      expect(sorted.map((r) => r.id)).toEqual([
        references("michael_magician").id,
        references("michael_unicyclist").id,
      ]);
    });
  });

  it("eager load has many through quotes table and column names", async () => {
    const michael = await Person.all().includes("jobs").find(people("michael").id);
    await assertNoQueries(false, () => {
      const sorted = (michael.association("jobs").target as Base[])
        .slice()
        .sort((a, b) => Number(a.id) - Number(b.id));
      expect(sorted.map((j) => j.id)).toEqual([jobs("unicyclist").id, jobs("magician").id]);
    });
  });
});

// ==========================================================================
// EagerAssociationTest — composite query_constraints / CPK preloading.
// Canonical Sharded::* and Cpk::* models + fixtures; mirrors eager_test.rb's
// composite-key preloading cases.
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { shardedBlogs, shardedBlogPosts, shardedComments } = useHandlerFixtures(
    ["shardedBlogs", "shardedBlogPosts", "shardedComments", "shardedTags", "shardedBlogPostsTags"],
    { schema: canonicalSchema },
  );

  // useHandlerFixtures loads the rows but does not register the models under the
  // class names the associations resolve by; register them here (dynamic import
  // keeps these out of the file's top-level scope).
  beforeAll(async () => {
    const sharded = await import("../test-helpers/models/sharded.js");
    registerModel("ShardedBlog", sharded.ShardedBlog);
    registerModel("ShardedBlogPost", sharded.ShardedBlogPost);
    registerModel("ShardedComment", sharded.ShardedComment);
    registerModel("ShardedTag", sharded.ShardedTag);
    registerModel("ShardedBlogPostTag", sharded.ShardedBlogPostTag);
    const cpk = await import("../test-helpers/models/cpk.js");
    registerModel("CpkPost", cpk.CpkPost);
    registerModel("CpkComment", cpk.CpkComment);
  });

  it("preloading belongs_to association associated by a composite query_constraints", async () => {
    const sharded = await import("../test-helpers/models/sharded.js");
    const blogIds = [shardedBlogs("sharded_blog_one").id, shardedBlogs("sharded_blog_two").id];
    const posts = (await sharded.ShardedBlogPost.where({ blog_id: blogIds })
      .includes("comments")
      .toArray()) as any[];
    expect(posts.every((post) => post.association("comments").isLoaded())).toBe(true);

    const greatPostId = shardedBlogPosts("great_post_blog_one").id;
    const post = posts.find((p) => p.id === greatPostId);
    const expectedComments = (await sharded.ShardedComment.where({
      blog_id: post.blog_id,
      blog_post_id: post.id,
    }).toArray()) as any[];
    const loaded = post.association("comments").target as any[];
    expect(loaded.map((c) => c.id).sort()).toEqual(expectedComments.map((c) => c.id).sort());
  });

  it("preloading has_many association associated by a composite query_constraints", async () => {
    const sharded = await import("../test-helpers/models/sharded.js");
    const blogIds = [shardedBlogs("sharded_blog_one").id, shardedBlogs("sharded_blog_two").id];
    const comments = (await sharded.ShardedComment.where({ blog_id: blogIds })
      .includes("blogPost")
      .toArray()) as any[];
    expect(comments.every((comment) => comment.association("blogPost").isLoaded())).toBe(true);

    const greatCommentId = shardedComments("great_comment_blog_post_one").id;
    const comment = comments.find((c) => c.id === greatCommentId);
    const blogPost = comment.association("blogPost").target;
    expect(blogPost.id).toBe(shardedBlogPosts("great_post_blog_one").id);
  });

  it("preloading has_many through association associated by a composite query_constraints", async () => {
    const sharded = await import("../test-helpers/models/sharded.js");
    const blogIds = [shardedBlogs("sharded_blog_one").id, shardedBlogs("sharded_blog_two").id];
    const blogPosts = (await sharded.ShardedBlogPost.where({ blog_id: blogIds })
      .includes("tags")
      .toArray()) as any[];
    expect(blogPosts.every((post) => post.association("tags").isLoaded())).toBe(true);

    const expectedPost = shardedBlogPosts("great_post_blog_one");
    const expectedTags = (await sharded.ShardedBlogPostTag.where({
      blog_id: expectedPost.blog_id,
      blog_post_id: expectedPost.id,
    }).toArray()) as any[];
    const expectedTagIds = expectedTags.map((t) => t.tag_id);
    expect(expectedTagIds.length).toBeGreaterThan(0);

    const blogPost = blogPosts.find((p) => p.id === expectedPost.id);
    const loadedTags = blogPost.association("tags").target as any[];
    expect(loadedTags.map((t) => Number(t.id)).sort((a, b) => a - b)).toEqual(
      expectedTagIds.map(Number).sort((a, b) => a - b),
    );
  });

  it("preloading belongs_to CPK model with one of the keys being shared between models", async () => {
    const cpk = await import("../test-helpers/models/cpk.js");
    const post1 = (await cpk.CpkPost.create({
      title: "post1",
      author: "the_same_author",
    })) as any;
    await cpk.CpkComment.create({
      commentable_title: post1.title,
      commentable_author: post1.author,
      text: "great post1!",
    });

    const post2 = (await cpk.CpkPost.create({
      title: "post2",
      author: "the_same_author",
    })) as any;
    await cpk.CpkComment.create({
      commentable_title: post2.title,
      commentable_author: post2.author,
      text: "great post2!",
    });

    const comments = (await cpk.CpkComment.all().eagerLoad("post").toArray()) as any[];
    const actual: Record<string, string> = {};
    for (const comment of comments) {
      actual[comment.text] = comment.association("post").target.title;
    }
    expect(actual).toEqual({ "great post1!": "post1", "great post2!": "post2" });
  });
});

// ==========================================================================
// EagerAssociationTest (canonical STI Post/Comment fixtures) — ports the
// preload/eager-load-through-STI-join-model cases over the real Author / Post /
// StiPost / SpecialPost / Comment / SpecialComment models. Same describe name as
// the other EagerAssociationTest blocks so test:compare matches the Rails
// `EagerAssociationTest` class.
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { authors } = useHandlerFixtures(["authors", "posts", "comments"]);
  beforeAll(async () => {
    await defineSchema(
      Base.connection,
      {
        authors: canonicalSchema.authors,
        posts: canonicalSchema.posts,
        comments: canonicalSchema.comments,
      } as Schema,
      { dropExisting: true },
    );
  });
  enableSti(Post);
  enableSti(Comment);
  registerModel(Author);
  registerModel(Post);
  registerModel(SpecialPost);
  registerSubclass(SpecialPost);
  registerModel(StiPost);
  registerSubclass(StiPost);
  registerModel(Comment);
  registerModel(SpecialComment);
  registerSubclass(SpecialComment);

  it("preloading with has one through an sti with after initialize", async () => {
    const authorA = await Author.create({ name: "A" });
    const authorB = await Author.create({ name: "B" });
    const postA = await StiPost.create({
      author_id: authorA.id,
      title: "TITLE",
      body: "BODY",
    });
    const postB = await SpecialPost.create({
      author_id: authorB.id,
      title: "TITLE",
      body: "BODY",
    });
    const commentA = await SpecialComment.create({ post_id: postA.id, body: "TEST" });
    const commentB = await SpecialComment.create({ post_id: postB.id, body: "TEST" });

    // Mirrors Rails `reset_callbacks(StiPost, :initialize) do ... end`: register a
    // temporary after_initialize that references the `author` association, then
    // remove it so the global StiPost model is left untouched for other tests.
    const referenceAuthor = function (this: Base): void {
      this.association("author");
    };
    try {
      StiPost.afterInitialize(referenceAuthor);
      const comments = await SpecialComment.all()
        .where({ id: [commentA.id, commentB.id] })
        .includes("author")
        .toArray();
      for (const comment of comments) {
        expect(comment.association("author").target).toBeTruthy();
      }
    } finally {
      StiPost.skipCallback("initialize", "after", referenceAuthor);
    }
  });

  it("eager with has many through an sti join model with conditions on both", async () => {
    const author = (await Author.all()
      .includes("specialNonexistentPostComments")
      .order("authors.id")
      .first()) as Author;
    expect(author.association("specialNonexistentPostComments").target).toEqual([]);
  });
});

// ==========================================================================
// EagerAssociationTest (canonical STI Post/Comment fixtures) — ports the
// inheritance / association-inheritance cases over the real STI
// Post/SpecialPost and Comment/SpecialComment/VerySpecialComment models +
// their fixtures. Same describe name as the other EagerAssociationTest blocks
// so test:compare matches the Rails `EagerAssociationTest` class.
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { posts } = useHandlerFixtures(["authors", "posts", "comments"]);
  beforeAll(async () => {
    await defineSchema(
      Base.connection,
      {
        authors: canonicalSchema.authors,
        posts: canonicalSchema.posts,
        comments: canonicalSchema.comments,
      } as Schema,
      { dropExisting: true },
    );
  });
  registerModel(Author);
  enableSti(Post);
  registerModel(Post);
  registerModel(SpecialPost);
  registerSubclass(SpecialPost);
  enableSti(Comment);
  registerModel(Comment);
  registerModel(SpecialComment);
  registerSubclass(SpecialComment);
  registerModel(SubSpecialComment);
  registerSubclass(SubSpecialComment);
  registerModel(VerySpecialComment);
  registerSubclass(VerySpecialComment);

  it("eager with inheritance", async () => {
    const loaded = await SpecialPost.all().includes("comments").toArray();
    expect(loaded).toHaveLength(1);
  });

  it("eager has one with association inheritance", async () => {
    const post = await Post.all().includes("verySpecialComment").find(posts("sti_comments").id);
    expect((post.association("verySpecialComment").target as Base).constructor.name).toBe(
      "VerySpecialComment",
    );
  });

  it("eager has many with association inheritance", async () => {
    const post = await Post.all().includes("specialComments").find(posts("sti_comments").id);
    for (const specialComment of post.association("specialComments").target as Base[]) {
      expect(specialComment).toBeInstanceOf(SpecialComment);
    }
  });
});

// ==========================================================================
// EagerAssociationTest (canonical Author/Post/Comment/Tag has_many-through
// fixtures) — ports the `eager with has many through *` cluster over the real
// Author / Post (+ STI SpecialPost/StiPost) / Comment / Person / Tag models and
// their fixtures. Same describe name as the other EagerAssociationTest blocks so
// test:compare matches the Rails `EagerAssociationTest` class.
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { authors, comments, people, posts } = useHandlerFixtures([
    "authors",
    "posts",
    "comments",
    "people",
    "readers",
    "authorFavorites",
    "taggings",
    "tags",
  ]);
  beforeAll(async () => {
    await defineSchema(
      Base.connection,
      {
        authors: canonicalSchema.authors,
        posts: canonicalSchema.posts,
        comments: canonicalSchema.comments,
        people: canonicalSchema.people,
        readers: canonicalSchema.readers,
        author_favorites: canonicalSchema.author_favorites,
        taggings: canonicalSchema.taggings,
        tags: canonicalSchema.tags,
      } as Schema,
      { dropExisting: true },
    );
  });
  enableSti(Post);
  registerModel(Author);
  registerModel(Post);
  registerModel(SpecialPost);
  registerSubclass(SpecialPost);
  registerModel(StiPost);
  registerSubclass(StiPost);
  registerModel(PostWithDefaultInclude);
  registerModel(Comment);
  registerModel(Person);
  registerModel(Reader);
  registerModel(Tag);
  registerModel(Tagging);
  registerModel(AuthorFavorite);

  it("eager with has many through", async () => {
    const michael = people("michael") as any;
    const postsWithComments = (await michael.posts
      .includes("comments")
      .order("posts.id")
      .toArray()) as Base[];
    const postsWithAuthor = (await michael.posts
      .includes("author")
      .order("posts.id")
      .toArray()) as Base[];
    const postsWithCommentsAndAuthor = (await michael.posts
      .includes("comments", "author")
      .order("posts.id")
      .toArray()) as Base[];
    const commentCount = postsWithComments.reduce(
      (sum, post) => sum + (post.association("comments").target as Base[]).length,
      0,
    );
    expect(commentCount).toBe(2);
    await assertNoQueries(false, () => {
      expect((postsWithAuthor[0].association("author").target as Base).id).toBe(
        authors("david").id,
      );
    });
    await assertNoQueries(false, () => {
      expect((postsWithCommentsAndAuthor[0].association("author").target as Base).id).toBe(
        authors("david").id,
      );
    });
  });

  it("eager with has many through a belongs to association", async () => {
    const author = authors("mary") as any;
    await Post.create({ author_id: author.id, title: "TITLE", body: "BODY" });
    await author.authorFavorites.create({ favorite_author_id: 1 });
    await author.authorFavorites.create({ favorite_author_id: 2 });
    const postsWithAuthorFavorites = (await author.posts
      .includes("authorFavorites")
      .toArray()) as Base[];
    await assertNoQueries(false, () => {
      const favorites = postsWithAuthorFavorites[0].association("authorFavorites").target as Base[];
      expect(favorites[0].readAttribute("author_id")).toBeDefined();
    });
  });

  it("eager with has many through an sti join model", async () => {
    const author = (await Author.all()
      .includes("specialPostComments")
      .order("authors.id")
      .first()) as Author;
    await assertNoQueries(false, () => {
      const specialPostComments = author.association("specialPostComments").target as Base[];
      expect(specialPostComments.map((c) => c.id)).toEqual([comments("does_it_hurt").id]);
    });
  });

  it("eager with has many through join model with conditions", async () => {
    const eagerAuthor = (await Author.all()
      .includes("helloPostComments")
      .order("authors.id")
      .first()) as Author;
    const eagerComments = (eagerAuthor.association("helloPostComments").target as Base[])
      .slice()
      .sort((a, b) => Number(a.id) - Number(b.id));
    const lazyAuthor = (await Author.all().order("authors.id").first()) as any;
    const lazyComments = ((await lazyAuthor.helloPostComments.toArray()) as Base[])
      .slice()
      .sort((a, b) => Number(a.id) - Number(b.id));
    expect(eagerComments.map((c) => c.id)).toEqual(lazyComments.map((c) => c.id));
  });

  it("eager with has many through join model with conditions on top level", async () => {
    const author = await Author.all()
      .includes("commentsWithOrderAndConditions")
      .find(authors("david").id);
    const first = (author.association("commentsWithOrderAndConditions").target as Base[])[0];
    expect(first.id).toBe(comments("more_greetings").id);
  });

  it("eager with has many through join model with include", async () => {
    const author = await Author.all().includes("commentsWithInclude").find(authors("david").id);
    const authorComments = author.association("commentsWithInclude").target as Base[];
    await assertNoQueries(false, () => {
      const post = authorComments[0].association("post").target as Base;
      expect(post.readAttribute("title")).toBeDefined();
    });
  });

  it("eager with has many through with conditions join model with include", async () => {
    const post = await Post.find(posts("welcome").id);
    const postTags = (await (post as any).miscTags.toArray()) as Base[];
    const eagerPost = await Post.all().includes("miscTags").find(posts("welcome").id);
    const eagerPostTags = eagerPost.association("miscTags").target as Base[];
    expect(eagerPostTags.map((t) => t.id)).toEqual(postTags.map((t) => t.id));
  });

  it("eager with has many through join model ignores default includes", async () => {
    const david = authors("david") as any;
    let error: unknown;
    try {
      await david.commentsOnPostsWithDefaultInclude.toArray();
    } catch (e) {
      error = e;
    }
    expect(error).toBeUndefined();
  });
});

// ==========================================================================
// EagerAssociationTest (canonical Member/Membership/Club fixtures) — ports the
// has_one-through-join-model-with-conditions-on-the-through case over the real
// Member / Membership / Club models. Same describe name as the other
// EagerAssociationTest blocks so test:compare matches the Rails
// `EagerAssociationTest` class.
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { members } = useHandlerFixtures(["members", "memberships", "clubs"]);
  beforeAll(async () => {
    await defineSchema(
      Base.connection,
      {
        members: canonicalSchema.members,
        memberships: canonicalSchema.memberships,
        clubs: canonicalSchema.clubs,
      } as Schema,
      { dropExisting: true },
    );
  });
  registerModel(Member);
  enableSti(Membership);
  registerModel(Membership);
  registerModel(Club);

  it("eager with has one through join model with conditions on the through", async () => {
    const member = await Member.all().includes("favoriteClub").find(members("some_other_guy").id);
    expect(member.association("favoriteClub").target ?? null).toBeNull();
  });
});

// ==========================================================================
// EagerAssociationTest (canonical Firm/Account fixtures) — ports the
// has_one-dependent-does-not-destroy-dependent case over the real STI
// Company/Firm + Account models. Same describe name as the other
// EagerAssociationTest blocks so test:compare matches the Rails
// `EagerAssociationTest` class.
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { companies } = useHandlerFixtures(["companies", "accounts"]);
  beforeAll(async () => {
    await defineSchema(
      Base.connection,
      {
        companies: canonicalSchema.companies,
        accounts: canonicalSchema.accounts,
      } as Schema,
      { dropExisting: true },
    );
  });
  registerModel(Company);
  enableSti(Company);
  registerModel(Firm);
  registerSubclass(Firm);
  registerModel(Client);
  registerSubclass(Client);
  registerModel(Account);

  it("eager with has one dependent does not destroy dependent", async () => {
    const firstFirm = companies("first_firm") as Firm;
    expect(await firstFirm.loadHasOne("account")).not.toBeNull();

    const f = (await Firm.all()
      .includes("account")
      .where("companies.name = ?", "37signals")
      .first()) as Firm;
    expect(f.association("account").target ?? null).not.toBeNull();

    const reloaded = await Firm.find(firstFirm.id);
    expect((f.association("account").target as Account).id).toBe(
      (await reloaded.loadHasOne("account"))!.id,
    );
  });
});

// ==========================================================================
// EagerAssociationTest (canonical Author/Post/Comment/Category + Project/Member
// fixtures) — ports of eager_test.rb's preloading has_many-through,
// instance-dependent, and scoping cases onto the real registry models. Same
// describe name as the other EagerAssociationTest blocks so test:compare matches
// the Rails `EagerAssociationTest` class.
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { authors, posts, developers, projects } = useHandlerFixtures([
    "authors",
    "posts",
    "comments",
    "categories",
    "categoriesPosts",
    "categorizations",
    "developers",
    "projects",
    "developersProjects",
    "members",
    "memberships",
    "clubs",
  ]);
  beforeAll(async () => {
    await defineSchema(
      Base.connection,
      {
        authors: canonicalSchema.authors,
        posts: canonicalSchema.posts,
        comments: canonicalSchema.comments,
        categories: canonicalSchema.categories,
        categories_posts: canonicalSchema.categories_posts,
        categorizations: canonicalSchema.categorizations,
        developers: canonicalSchema.developers,
        projects: canonicalSchema.projects,
        developers_projects: canonicalSchema.developers_projects,
        members: canonicalSchema.members,
        memberships: canonicalSchema.memberships,
        clubs: canonicalSchema.clubs,
      } as Schema,
      { dropExisting: true },
    );
  });
  registerModel(Post);
  registerModel(Author);
  enableSti(Comment);
  registerModel(Comment);
  registerModel(VerySpecialComment);
  registerModel(Category);
  registerModel(Categorization);
  registerModel(Developer);
  registerModel(Project);
  registerModel(Member);
  enableSti(Membership);
  registerModel(Membership);
  registerModel(Club);

  it("preloading has many through with implicit source", async () => {
    const authorList = (await Author.includes("verySpecialComments").toArray()).sort(
      (a, b) => Number(a.id) - Number(b.id),
    );
    await assertNoQueries(false, () => {
      const specialCommentAuthors = authorList.map((author) => [
        (author as any).name,
        (author.association("verySpecialComments").target as Base[]).length,
      ]);
      expect(specialCommentAuthors).toEqual([
        ["David", 1],
        ["Mary", 0],
        ["Bob", 0],
      ]);
    });
  });

  it("preloading has many through with distinct", async () => {
    const mary = (await Author.includes("uniqueCategorizedPosts")
      .where({ id: authors("mary").id })
      .first()) as Author;
    expect((mary.association("uniqueCategorizedPosts").target as Base[]).length).toBe(1);
    expect(
      (
        await (mary as Author & { uniqueCategorizedPostIds: Promise<unknown[]> })
          .uniqueCategorizedPostIds
      ).length,
    ).toBe(1);
  });

  it("preloading has many through with custom scope", async () => {
    const project = await Project.includes("developersNamedDavidWithHashConditions").find(
      projects("active_record").id,
    );
    const loaded = project.association("developersNamedDavidWithHashConditions").target as Base[];
    expect(loaded.map((d) => d.id)).toEqual([developers("david").id]);
  });

  it("preloading a through association twice does not reset it", async () => {
    const members = await Member.includes({ currentMembership: "club" }).includes("club").toArray();
    await assertNoQueries(false, () => {
      // Rails: members.map(&:current_membership).map(&:club).size — a nil
      // current_membership would raise NoMethodError, so do NOT null-guard;
      // a missing preloaded target must throw (Rails-faithful failure mode).
      const clubs = members
        .map((m) => m.association("currentMembership").target as Base)
        .map((cm) => cm.association("club").target as Base);
      expect(clubs).toHaveLength(3);
    });
  });

  it("belongs_to association ignores the scoping", async () => {
    const post = await (await Comment.find(1)).loadBelongsTo("post");
    await Post.scoping(Post.where("1=0"), async () => {
      expect((await (await Comment.find(1)).loadBelongsTo("post"))!.id).toBe(post!.id);
      const preloaded = await Comment.preload("post").find(1);
      expect((preloaded.association("post").target as Base).id).toBe(post!.id);
      const eagerLoaded = await Comment.eagerLoad("post").find(1);
      expect((eagerLoaded.association("post").target as Base).id).toBe(post!.id);
    });
  });

  it("has_many association ignores the scoping", async () => {
    const comments = ((await ((await Post.find(1)) as any).comments.toArray()) as Base[]).map(
      (c) => c.id,
    );
    await Comment.scoping(Comment.where("1=0"), async () => {
      expect(
        ((await ((await Post.find(1)) as any).comments.toArray()) as Base[]).map((c) => c.id),
      ).toEqual(comments);
      const preloaded = await Post.preload("comments").find(1);
      expect((preloaded.association("comments").target as Base[]).map((c) => c.id)).toEqual(
        comments,
      );
      const eagerLoaded = await Post.eagerLoad("comments").find(1);
      expect((eagerLoaded.association("comments").target as Base[]).map((c) => c.id)).toEqual(
        comments,
      );
    });
  });

  it("preloading of instance dependent associations is supported", async () => {
    const authorList = await Author.preload("postsWithSignature").toArray();
    expect(authorList).not.toHaveLength(0);
    for (const author of authorList) {
      expect(author.association("postsWithSignature").isLoaded()).toBe(true);
    }
  });

  it("eager loading of instance dependent associations is not supported", async () => {
    await expect(Author.eagerLoad("postsWithSignature").toArray()).rejects.toThrow(
      "association scope 'postsWithSignature' is",
    );
  });

  it("preloading of optional instance dependent associations is supported", async () => {
    const authorList = await Author.includes("postsMentioningAuthor").toArray();
    expect(authorList).not.toHaveLength(0);
    for (const author of authorList) {
      expect(author.association("postsMentioningAuthor").isLoaded()).toBe(true);
    }
  });

  it("eager loading of optional instance dependent associations is not supported", async () => {
    await expect(Author.eagerLoad("postsMentioningAuthor").toArray()).rejects.toThrow(
      "association scope 'postsMentioningAuthor' is",
    );
  });

  it("preload with invalid argument", async () => {
    await expect(
      Author.all()
        .preload(10 as any)
        .toArray(),
    ).rejects.toThrow(/Association names must be Symbol or String, got: Integer/);
    await expect(Author.all().preload("doesNotExists").toArray()).rejects.toThrow(
      /Association named 'doesNotExists' was not found on Author; perhaps you misspelled it\?/,
    );
  });

  it("associations with extensions are not instance dependent", async () => {
    let error: unknown;
    try {
      await Author.includes("postsWithExtension").toArray();
    } catch (e) {
      error = e;
    }
    expect(error).toBeUndefined();
  });

  it("including associations with extensions and an instance dependent scope is supported", async () => {
    const authorList = await Author.includes("postsWithExtensionAndInstance").toArray();
    expect(authorList).not.toHaveLength(0);
    for (const author of authorList) {
      expect(author.association("postsWithExtensionAndInstance").isLoaded()).toBe(true);
    }
  });
});

// ==========================================================================
// HasManyThroughAssociationsTest — targets associations/has_many_through_associations_test.rb
// ==========================================================================
