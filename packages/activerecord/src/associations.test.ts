import { describe, it, expect, afterEach, beforeAll, beforeEach, vi } from "vitest";
import { SingularAssociation } from "./associations/singular-association.js";
import {
  Base,
  collectionProxyFor as association,
  reflectOnAssociation,
  registerModel,
  NameError,
  Relation,
  pp,
} from "./index.js";
import { ArgumentError } from "@blazetrails/activemodel";
import {
  assertEmpty,
  assertNot,
  assertNotEmpty,
  assertNotPredicate,
  assertNothingRaised,
  assertPredicate,
  assertRaises,
  assertSame,
} from "@blazetrails/activesupport";
import {
  assertNoQueries,
  assertQueriesCount,
  assertQueriesMatch,
} from "./testing/query-assertions.js";
import { captureSql } from "./testing/sql-capture.js";
import { clearReflectionsCache } from "./reflection.js";
import { fixtures } from "./test-fixtures.js";
import { Author, type Author as AuthorT } from "./test-helpers/models/author.js";
import { CpkOrder, CpkBook } from "./test-helpers/models/cpk.js";
import type { Firm as FirmT } from "./test-helpers/models/company.js";
import type { Tag as TagT } from "./test-helpers/models/tag.js";
import type { Tagging as TaggingT } from "./test-helpers/models/tagging.js";
import {
  Developer,
  AuditLog,
  type Developer as DeveloperT,
} from "./test-helpers/models/developer.js";
import { Post, FirstPost, Postesque } from "./test-helpers/models/post.js";
import { Comment } from "./test-helpers/models/comment.js";
import { Computer } from "./test-helpers/models/computer.js";
import { OtherDog } from "./test-helpers/models/other-dog.js";
registerModel(Comment);
registerModel(Computer);
import { Project } from "./test-helpers/models/project.js";
import { Category } from "./test-helpers/models/category.js";
import { Categorization } from "./test-helpers/models/categorization.js";
import { Member } from "./test-helpers/models/member.js";
import { Membership } from "./test-helpers/models/membership.js";
import { Human } from "./test-helpers/models/human.js";
import { Interest } from "./test-helpers/models/interest.js";
import "./test-helpers/models/ship.js";
import "./test-helpers/models/bird.js";
import "./test-helpers/models/treasure.js";
import "./test-helpers/models/price-estimate.js";

import { NoMethodError, regexpEscape } from "@blazetrails/ruby-compat";

import { Preloader } from "./associations/preloader.js";
import { LoaderQuery } from "./associations/preloader/association.js";

function quoteTableName(name: string): string {
  return (Base.connection as { quoteTableName(n: string): string }).quoteTableName(name);
}

describe("AssociationsTest", () => {
  fixtures([]);
  beforeAll(() => {
    registerModel("CpkOrder", CpkOrder);
    registerModel("CpkBook", CpkBook);
  });

  it("loading cpk association when persisted and in memory differ", async () => {
    const order = await CpkOrder.create({ shop_id: 1, status: "paid" });
    const book = await (order as any).books.create({ id: [3, 4], title: "Book" });
    const dbBook = await CpkBook.where({ author_id: 3, id: 4 }).first();
    await dbBook!.updateColumns({ title: "A different title" });
    await (order as any).books.load();
    expect(book.id).toEqual([3, 4]);
  });
});

describe("AssociationProxyTest", () => {
  registerModel([
    Author,
    Post,
    FirstPost,
    Developer,
    Project,
    AuditLog,
    Category,
    Categorization,
    Member,
    Membership,
    Human,
    Interest,
  ]);
  const { authors, developers, members, posts, categories } = fixtures([
    "authorAddresses",
    "authors",
    "posts",
    "categories",
    "categorizations",
    "developers",
    "projects",
    "developersProjects",
    "memberTypes",
    "members",
  ]);

  it("push does not lose additions to new record", async () => {
    const josh = new Author({ name: "Josh" }) as any;
    await josh.posts.push(new Post({ title: "New on Edge", body: "More cool stuff!" }));
    assertPredicate(josh.posts, (p: any) => p.loaded);
    expect(await josh.posts.size()).toBe(1);
  });

  it("append behaves like push", async () => {
    const josh = new Author({ name: "Josh" }) as any;
    await josh.posts.append(new Post({ title: "New on Edge", body: "More cool stuff!" }));
    assertPredicate(josh.posts, (p: any) => p.loaded);
    expect(await josh.posts.size()).toBe(1);
  });

  it("prepend is not defined", async () => {
    const josh = new Author({ name: "Josh" }) as any;
    expect(() => josh.posts.prepend(new Post())).toThrow(NoMethodError);
  });

  it("load does load target", async () => {
    const david = developers("david") as any;
    assertNotPredicate(david.projects, (p: any) => p.loaded);
    await david.projects.load();
    assertPredicate(david.projects, (p: any) => p.loaded);
  });

  it("create via association with block", async () => {
    const david = authors("david") as any;
    const post = await david.posts.create({ title: "New on Edge" }, (p: any) => {
      p.body = "More cool stuff!";
    });
    expect(post.title).toBe("New on Edge");
    expect(post.body).toBe("More cool stuff!");
  });

  it("create with bang via association with block", async () => {
    const david = authors("david") as any;
    const post = await david.posts.createBang({ title: "New on Edge" }, (p: any) => {
      p.body = "More cool stuff!";
    });
    expect(post.title).toBe("New on Edge");
    expect(post.body).toBe("More cool stuff!");
  });

  it("proxy association accessor", async () => {
    const david = developers("david") as any;
    expect(david.projects.proxyAssociation).toBe(david.association("projects"));
  });

  it("scoped allows conditions", async () => {
    const david = developers("david") as any;
    expect(david.projects.merge(Project.where("foo")).toSql().includes("foo")).toBeTruthy();
  });

  it("proxy object is cached", async () => {
    const david = developers("david") as any;
    expect(david.projects).toBe(david.projects);
  });

  it("proxy object can be stubbed", async () => {
    const david = developers("david") as any;
    david.projects.extraMethod = () => 42;
    expect(david.projects.extraMethod()).toBe(42);
  });

  it("first! works on loaded associations", async () => {
    const david = authors("david") as any;
    expect(await (await david.firstPosts.reload()).firstBang()).toEqual(
      await david.firstPosts.first(),
    );
    assertPredicate(david.firstPosts, (p: any) => p.loaded);
    await assertNoQueries(false, () => david.firstPosts.firstBang());
  });

  it("last! works on loaded associations", async () => {
    const david = authors("david") as any;
    const expected = await david.firstPosts.last();
    await david.firstPosts.reload();
    const sqls = await captureSql(async () => {
      const last = await david.firstPosts.lastBang();
      expect(last.id).toBe(expected!.id);
    });
    expect(sqls).toHaveLength(0);
    expect(david.firstPosts.loaded).toBe(true);
  });

  it("take! works on loaded associations", async () => {
    const david = authors("david") as any;
    const expected = await david.firstPosts.take();
    await david.firstPosts.reload();
    const sqls = await captureSql(async () => {
      const taken = await david.firstPosts.takeBang();
      expect(taken.id).toBe(expected!.id);
    });
    expect(sqls).toHaveLength(0);
    expect(david.firstPosts.loaded).toBe(true);
  });

  it("size differentiates between new and persisted in memory records when loaded records are empty", async () => {
    const member = members("blarpy_winkup") as any;
    assertEmpty(await member.favoriteMemberships.scope().toArray());
    const membership = await member.favoriteMemberships.createBang({});
    await membership.updateBang({ favorite: false });
    expect(await member.favoriteMemberships.size()).toBe(0);
    expect(await member.favoriteMemberships.size()).toBe(0);
  });

  it("push does not load target", async () => {
    const david = authors("david") as any;
    const post = new Post({ title: "New on Edge", body: "More cool stuff!" });
    await david.posts.push(post);
    assertNotPredicate(david.posts, (p: any) => p.loaded);
    expect(await david.posts.toArray()).toContain(post);
  });
  it("push has many through does not load target", async () => {
    const david = authors("david") as any;
    const technology = categories("technology") as any;
    await david.categories.push(technology);
    assertNotPredicate(david.categories, (p: any) => p.loaded);
    const davidCategories = await david.categories.toArray();
    expect(davidCategories).toContain(davidCategories.find((c: Base) => c.equals(technology)));
  });
  it("push followed by save does not load target", async () => {
    const david = authors("david") as any;
    const post = new Post({ title: "New on Edge", body: "More cool stuff!" });
    await david.posts.push(post);
    assertNotPredicate(david.posts, (p: any) => p.loaded);
    await david.save();
    assertNotPredicate(david.posts, (p: any) => p.loaded);
    expect(await david.posts.toArray()).toContain(post);
  });
  it("save on parent does not load target", async () => {
    const david = developers("david") as any;
    assertNotPredicate(david.projects, (p: any) => p.loaded);
    await david.updateColumns({ created_at: new Date() });
    assertNotPredicate(david.projects, (p: any) => p.loaded);
  });
  it("inspect does not reload a not yet loaded target", async () => {
    const andreas = new Developer({ name: "Andreas" });
    (andreas as any).log = "new developer added";
    assertNotPredicate(andreas.auditLogs, (p: any) => p.loaded);
    expect(await andreas.auditLogs.inspect()).toMatch(/message: "new developer added"/);
    assertPredicate(andreas.auditLogs, (p: any) => p.loaded);
  });
  it("pretty_print does not reload a not yet loaded target", async () => {
    const andreas = new Developer({});
    (andreas as any).log = "new developer added";
    expect(andreas.auditLogs.loaded).toBe(false);
    let out = "";
    await pp(andreas.auditLogs, { write: (s: string) => (out += s) });
    expect(out).toMatch(/message: "new developer added"/);
    expect(andreas.auditLogs.loaded).toBe(true);
  });
  it("save on parent saves children", async () => {
    const developer = await Developer.create({ name: "Bryan", salary: 50_000 });
    await developer.reload();
    expect(await developer.auditLogs.size()).toBe(1);
  });
  it("reload returns association", async () => {
    const david = developers("david") as any;
    await assertNothingRaised(async () => {
      expect(await david.projects.toArray()).toEqual(
        await (await (await david.projects.reload()).reload()).toArray(),
      );
    });
  });
  it("getting a scope from an association", async () => {
    const david = developers("david") as any;
    expect(david.projects.scope() instanceof Relation).toBeTruthy();
    expect(await david.projects.toArray()).toEqual(await david.projects.scope().toArray());
  });
  it("inverses get set of subsets of the association", async () => {
    const human = await Human.create({});
    await (human as any).interests.create({});
    const found = (await Human.find((human as any).id)) as any;
    await assertQueriesCount(1, false, async () => {
      expect(await (await found.interests.where("1=1").first()).human).toBe(found);
    });
  });
  it("pluck uses loaded target", async () => {
    const david = authors("david") as any;
    expect(await (await david.firstPosts.load()).pluck("title")).toEqual(
      await david.firstPosts.pluck("title"),
    );
    assertPredicate(david.firstPosts, (p: any) => p.loaded);
    await assertNoQueries(false, () => david.firstPosts.pluck("title"));
  });
  it("pick uses loaded target", async () => {
    const david = authors("david") as any;
    const expected = await david.firstPosts.pick("title");
    expect(await (await david.firstPosts.load()).pick("title")).toEqual(expected);
    assertPredicate(david.firstPosts, (p: any) => p.loaded);
    await assertNoQueries(false, () => david.firstPosts.pick("title"));
  });
  it("reset unloads target", async () => {
    const david = authors("david") as any;
    await david.posts.reload();

    assertPredicate(david.posts, (p: any) => p.isLoaded);
    assertPredicate(david.posts, (p: any) => p.loaded);
    david.posts.reset();
    assertNotPredicate(david.posts, (p: any) => p.isLoaded);
    assertNotPredicate(david.posts, (p: any) => p.loaded);
  });
  it("target merging ignores persisted in memory records", async () => {
    const david = authors("david") as any;
    expect(await david.thinkingPosts.isInclude(posts("thinking") as any)).toBeTruthy();
    await david.thinkingPosts.createBang({
      title: "Something else entirely",
      body: "Does not matter.",
    });
    expect(await david.thinkingPosts.size()).toBe(1);
    expect((await david.thinkingPosts.toArray()).length).toBe(1);
  });
  it("target merging ignores persisted in memory records when loaded records are empty", async () => {
    const member = members("blarpy_winkup") as any;
    assertEmpty(await member.favoriteMemberships.scope().toArray());
    const membership = await member.favoriteMemberships.createBang({});
    await membership.updateBang({ favorite: false });
    assertEmpty(await member.favoriteMemberships.toArray());
  });
  it("target merging recognizes updated in memory records", async () => {
    const member = members("blarpy_winkup") as any;
    const membership = await member.createMembershipBang({ favorite: false });
    assertEmpty(await member.favoriteMemberships.scope().toArray());
    await membership.updateBang({ favorite: true });
    assertNotEmpty(await member.favoriteMemberships.toArray());
  });
  it("load preserves in-memory instances added via push", async () => {
    const david = authors("david") as any;
    const post = await Post.create({ title: "original", body: "b" });
    await david.posts.push(post);
    post.title = "mutated";
    const loaded = await (await david.posts.load()).records();
    const found = loaded.find((r: any) => r.readAttribute("id") === post.id);
    expect(found).toBe(post);
    expect(found.title).toBe("mutated");
  });
});

describe("PreloaderTest", () => {
  const {
    posts,
    comments,
    authors,
    members,
    books,
    categories,
    essays,
    cpkOrders,
    cpkOrderAgreements,
    dogs,
    shardedBlogPosts,
    shardedComments,
    shardedTags,
  } = fixtures([
    "posts",
    "comments",
    "books",
    "authors",
    "tags",
    "taggings",
    "essays",
    "categories",
    "authorAddresses",
    "shardedBlogPosts",
    "shardedComments",
    "shardedBlogPostsTags",
    "shardedTags",
    "members",
    "memberDetails",
    "organizations",
    "cpkOrders",
    "cpkOrderAgreements",
    "dogs",
  ]);
  const { otherDogs } = fixtures(["otherDogs"], { connection: () => OtherDog.connection });

  afterEach(() => vi.restoreAllMocks());

  let Author: typeof Base;
  let Post: typeof Base;
  let Comment: typeof Base;
  let Book: typeof Base;
  let Category: typeof Base;
  let SpecialCategory: typeof Base;
  let CategoryPost: typeof Base;
  let Tag: typeof Base;
  let Tagging: typeof Base;
  let AuthorFavorite: typeof Base;
  let Essay: typeof Base;
  let Invoice: typeof Base;
  let LineItem: typeof Base;
  let LineItemDiscountApplication: typeof Base;
  let ShippingLine: typeof Base;
  let ShippingLineDiscountApplication: typeof Base;
  let Discount: typeof Base;
  let ShardedBlogPL: typeof Base;
  let ShardedBlogPostPL: typeof Base;
  let ShardedCommentPL: typeof Base;
  let ShardedTagPL: typeof Base;
  let ShardedBlogPostTagPL: typeof Base;
  let CpkOrderPL: typeof Base;
  let CpkOrderAgreementPL: typeof Base;
  let Dog: typeof Base;
  let EssaySpecial: typeof Base;
  let PostesquePL: typeof Base;
  let AuthorAddress: typeof Base;

  beforeAll(async () => {
    const authorMod = await import("./test-helpers/models/author.js");
    Author = authorMod.Author as never;
    AuthorFavorite = authorMod.AuthorFavorite as never;
    AuthorAddress = authorMod.AuthorAddress as never;
    const postMod = await import("./test-helpers/models/post.js");
    Post = postMod.Post as never;
    CategoryPost = postMod.CategoryPost as never;
    Comment = (await import("./test-helpers/models/comment.js")).Comment as never;
    Book = (await import("./test-helpers/models/book.js")).Book as never;
    const catMod = await import("./test-helpers/models/category.js");
    Category = catMod.Category as never;
    SpecialCategory = catMod.SpecialCategory as never;
    Tag = (await import("./test-helpers/models/tag.js")).Tag as never;
    Tagging = (await import("./test-helpers/models/tagging.js")).Tagging as never;
    Essay = (await import("./test-helpers/models/essay.js")).Essay as never;
    Invoice = (await import("./test-helpers/models/invoice.js")).Invoice as never;
    const liMod = await import("./test-helpers/models/line-item.js");
    LineItem = liMod.LineItem as never;
    LineItemDiscountApplication = liMod.LineItemDiscountApplication as never;
    const slMod = await import("./test-helpers/models/shipping-line.js");
    ShippingLine = slMod.ShippingLine as never;
    ShippingLineDiscountApplication = slMod.ShippingLineDiscountApplication as never;
    Discount = (await import("./test-helpers/models/discount.js")).Discount as never;
    const shardedMod = await import("./test-helpers/models/sharded.js");
    ShardedBlogPL = shardedMod.ShardedBlog as never;
    ShardedBlogPostPL = shardedMod.ShardedBlogPost as never;
    ShardedCommentPL = shardedMod.ShardedComment as never;
    ShardedTagPL = shardedMod.ShardedTag as never;
    ShardedBlogPostTagPL = shardedMod.ShardedBlogPostTag as never;
    const cpkMod = await import("./test-helpers/models/cpk.js");
    CpkOrderPL = cpkMod.CpkOrder as never;
    CpkOrderAgreementPL = cpkMod.CpkOrderAgreement as never;
    Dog = (await import("./test-helpers/models/dog.js")).Dog as never;
    EssaySpecial = (await import("./test-helpers/models/essay.js")).EssaySpecial as never;
    PostesquePL = Postesque as never;
  });

  beforeEach(() => {
    registerModel("Author", Author);
    registerModel("AuthorFavorite", AuthorFavorite);
    registerModel("Post", Post);
    registerModel("CategoryPost", CategoryPost);
    registerModel("Comment", Comment);
    registerModel("Book", Book);
    registerModel("Category", Category);
    registerModel("SpecialCategory", SpecialCategory);
    registerModel("Tag", Tag);
    registerModel("Tagging", Tagging);
    registerModel("Essay", Essay);
    registerModel("Invoice", Invoice);
    registerModel("LineItem", LineItem);
    registerModel("LineItemDiscountApplication", LineItemDiscountApplication);
    registerModel("ShippingLine", ShippingLine);
    registerModel("ShippingLineDiscountApplication", ShippingLineDiscountApplication);
    registerModel("Discount", Discount);
    registerModel("ShardedBlog", ShardedBlogPL);
    registerModel("ShardedBlogPost", ShardedBlogPostPL);
    registerModel("ShardedComment", ShardedCommentPL);
    registerModel("ShardedTag", ShardedTagPL);
    registerModel("ShardedBlogPostTag", ShardedBlogPostTagPL);
    registerModel("CpkOrder", CpkOrderPL);
    registerModel("CpkOrderAgreement", CpkOrderAgreementPL);
    registerModel("Dog", Dog);
    registerModel("OtherDog", OtherDog);
    registerModel("EssaySpecial", EssaySpecial);
    registerModel("Postesque", PostesquePL);
    registerModel("AuthorAddress", AuthorAddress);
  });

  it("preload with scope", async () => {
    const post = posts("welcome") as any;

    const preloader = new Preloader({
      records: [post],
      associations: "comments",
      scope: Comment.where({ body: "Thank you for the welcome" }),
    });
    await preloader.call();

    assertPredicate(post.comments, (c: any) => c.isLoaded);
    expect((await post.comments.toArray()).map((c: Base) => c.id)).toEqual([
      comments("greetings").id,
    ]);
  });

  it("preload makes correct number of queries on array", async () => {
    const post = posts("welcome");

    await assertQueriesCount(1, false, async () => {
      const preloader = new Preloader({ records: [post], associations: "comments" });
      await preloader.call();
    });
  });

  it("preload makes correct number of queries on relation", async () => {
    const post = posts("welcome");
    const relation = Post.where({ id: post.id });

    await assertQueriesCount(2, false, async () => {
      const preloader = new Preloader({ records: relation, associations: "comments" });
      await preloader.call();
    });
  });

  it("isEmpty materializes an empty relation and reports true", async () => {
    const relation = Post.where({ id: -1 });
    const preloader = new Preloader({ records: relation, associations: "comments" });
    expect(await preloader.isEmpty()).toBe(true);
    const sqls = await captureSql(async () => {
      await preloader.call();
    });
    expect(sqls).toHaveLength(0);
  });

  it("isEmpty reports false for a non-empty relation", async () => {
    const relation = Post.where({ id: posts("welcome").id });
    const preloader = new Preloader({ records: relation, associations: "comments" });
    expect(await preloader.isEmpty()).toBe(false);
  });

  it("preload does not concatenate duplicate records", async () => {
    const post = posts("welcome") as any;
    await post.reload();
    await post.comments.createBang({ body: "A new comment" });

    await new Preloader({ records: [post], associations: "comments" }).call();

    expect((await post.comments.toArray()).length).toBe(Number(await post.comments.count()));
    expect((await post.comments.all().toArray()).map((c: Base) => c.id)).toEqual(
      (await post.comments.toArray()).map((c: Base) => c.id),
    );
  });

  it("preload for hmt with conditions", async () => {
    const post = posts("welcome") as any;
    await post.categories.createBang({ name: "Normal" });
    const specialCategory = await post.specialCategories.createBang({ name: "Special" });

    const preloader = new Preloader({ records: [post], associations: "hmtSpecialCategories" });
    await preloader.call();

    expect((await post.hmtSpecialCategories.toArray()).length).toBe(1);
    expect((await post.hmtSpecialCategories.toArray()).map((c: Base) => c.id)).toEqual([
      specialCategory.id,
    ]);
  });

  it("preload groups queries with same scope", async () => {
    const book = books("awdr") as any;
    const post = posts("welcome") as any;

    await assertQueriesCount(1, false, async () => {
      const preloader = new Preloader({ records: [book, post], associations: "author" });
      await preloader.call();
    });

    await assertNoQueries(false, async () => {
      await book.author;
      await post.author;
    });
  });

  it("preload grouped queries with already loaded records", async () => {
    const book = books("awdr") as any;
    const post = posts("welcome") as any;
    await book.author;

    await assertNoQueries(false, async () => {
      await new Preloader({ records: [book, post], associations: "author" }).call();
      await book.author;
      await post.author;
    });
  });
  it("preload grouped queries of middle records", async () => {
    const records = [
      comments("eager_sti_on_associations_s_comment1"),
      comments("eager_sti_on_associations_s_comment2"),
    ];

    await assertQueriesCount(2, false, async () => {
      await new Preloader({ records, associations: ["author", "ordinaryPost"] }).call();
    });
  });
  it("preload grouped queries of through records", async () => {
    const author = authors("david");

    await assertQueriesCount(3, false, async () => {
      await new Preloader({
        records: [author],
        associations: ["helloPostComments", "comments"],
      }).call();
    });
  });
  it("preload through records with already loaded middle record", async () => {
    const member = members("groucho") as any;
    const expectedMemberDetailIds = await member.organizationMemberDetails_2.pluck("id");

    await (
      await member.reload()
    ).organization;

    await assertQueriesCount(1, false, async () => {
      await new Preloader({
        records: [member],
        associations: "organizationMemberDetails_2",
      }).call();
    });

    await assertNoQueries(false, async () => {
      expect([...expectedMemberDetailIds].sort()).toEqual(
        (await member.organizationMemberDetails_2.toArray()).map((d: Base) => d.id).sort(),
      );
    });
  });

  it("preload with instance dependent scope", async () => {
    const david = authors("david") as any;
    const david2 = (await Author.createBang({ name: "David" })) as any;
    const bob = authors("bob") as any;
    const post = await Post.createBang({
      author: david,
      title: "test post",
      body: "this post is about David",
    });
    const post2 = await Post.createBang({
      author: david,
      title: "test post 2",
      body: "this post is also about David",
    });

    await assertQueriesCount(2, false, async () => {
      const preloader = new Preloader({
        records: [david, david2, bob],
        associations: "postsMentioningAuthor",
      });
      await preloader.call();
    });

    assertPredicate(david.postsMentioningAuthor, (c: any) => c.isLoaded);
    assertPredicate(david2.postsMentioningAuthor, (c: any) => c.isLoaded);
    assertPredicate(bob.postsMentioningAuthor, (c: any) => c.isLoaded);

    expect([post.id, post2.id].sort()).toEqual(
      (await david.postsMentioningAuthor.toArray()).map((p: Base) => p.id).sort(),
    );
    expect(await david2.postsMentioningAuthor.toArray()).toEqual([]);
    expect(await bob.postsMentioningAuthor.toArray()).toEqual([]);
  });
  it("preload with instance dependent through scope", async () => {
    const david = authors("david") as any;
    const david2 = (await Author.createBang({ name: "David" })) as any;
    const bob = authors("bob") as any;
    const comment1 = await (await david.posts.first()).comments.createBang({ body: "Hi David!" });
    const comment2 = await (
      await david.posts.first()
    ).comments.createBang({
      body: "This comment mentions david",
    });

    await assertQueriesCount(2, false, async () => {
      const preloader = new Preloader({
        records: [david, david2, bob],
        associations: "commentsMentioningAuthor",
      });
      await preloader.call();
    });

    assertPredicate(david.commentsMentioningAuthor, (c: any) => c.isLoaded);
    assertPredicate(david2.commentsMentioningAuthor, (c: any) => c.isLoaded);
    assertPredicate(bob.commentsMentioningAuthor, (c: any) => c.isLoaded);

    expect([comment1.id, comment2.id].sort()).toEqual(
      (await david.commentsMentioningAuthor.toArray()).map((c: Base) => c.id).sort(),
    );
    expect(await david2.commentsMentioningAuthor.toArray()).toEqual([]);
    expect(await bob.commentsMentioningAuthor.toArray()).toEqual([]);
  });
  it("preload with through instance dependent scope", async () => {
    const david = authors("david") as any;
    const david2 = (await Author.createBang({ name: "David" })) as any;
    const bob = authors("bob") as any;
    const post = (await Post.createBang({
      author: david,
      title: "test post",
      body: "this post is about David",
    })) as any;
    await Post.createBang({
      author: david,
      title: "test post 2",
      body: "this post is also about David",
    });
    const post3 = (await Post.createBang({
      author: bob,
      title: "test post 3",
      body: "this post is about Bob",
    })) as any;
    const comment1 = await post.comments.createBang({ body: "hi!" });
    const comment2 = await post.comments.createBang({ body: "hello!" });
    const comment3 = await post3.comments.createBang({ body: "HI BOB!" });

    await assertQueriesCount(3, false, async () => {
      const preloader = new Preloader({
        records: [david, david2, bob],
        associations: "commentsOnPostsMentioningAuthor",
      });
      await preloader.call();
    });

    assertPredicate(david.commentsOnPostsMentioningAuthor, (c: any) => c.isLoaded);
    assertPredicate(david2.commentsOnPostsMentioningAuthor, (c: any) => c.isLoaded);
    assertPredicate(bob.commentsOnPostsMentioningAuthor, (c: any) => c.isLoaded);

    expect([comment1.id, comment2.id].sort()).toEqual(
      (await david.commentsOnPostsMentioningAuthor.toArray()).map((c: Base) => c.id).sort(),
    );
    expect(await david2.commentsOnPostsMentioningAuthor.toArray()).toEqual([]);
    expect([comment3.id]).toEqual(
      (await bob.commentsOnPostsMentioningAuthor.toArray()).map((c: Base) => c.id),
    );
  });

  it("some already loaded associations", async () => {
    const itemDiscount = await Discount.create({ amount: 5 });
    const shippingDiscount = await Discount.create({ amount: 20 });

    const invoice = new Invoice({}) as any;
    const lineItem = new LineItem({ amount: 20 }) as any;
    await lineItem.discountApplications.push(
      new LineItemDiscountApplication({ discount: itemDiscount }),
    );
    await invoice.lineItems.push(lineItem);

    const shippingLine = new ShippingLine({ amount: 50 }) as any;
    await shippingLine.discountApplications.push(
      new ShippingLineDiscountApplication({ discount: shippingDiscount }),
    );
    await invoice.shippingLines.push(shippingLine);

    await invoice.saveBang();
    await invoice.reload();

    const associations = [
      { lineItems: { discountApplications: "discount" } },
      { shippingLines: { discountApplications: "discount" } },
    ];
    await assertQueriesCount(5, false, async () => {
      const preloader = new Preloader({ records: [invoice], associations });
      await preloader.call();
    });

    await assertNoQueries(false, async () => {
      expect(
        await (
          await (await invoice.lineItems.first()).discountApplications.first()
        ).discount,
      ).not.toBeNull();
      expect(
        await (
          await (await invoice.shippingLines.first()).discountApplications.first()
        ).discount,
      ).not.toBeNull();
    });

    await invoice.reload();
    for (const i of await invoice.lineItems.toArray()) await i.discountApplications.toArray();
    await assertQueriesCount(3, false, async () => {
      const preloader = new Preloader({ records: [invoice], associations });
      await preloader.call();
    });

    await assertNoQueries(false, async () => {
      expect(
        await (
          await (await invoice.lineItems.first()).discountApplications.first()
        ).discount,
      ).not.toBeNull();
      expect(
        await (
          await (await invoice.shippingLines.first()).discountApplications.first()
        ).discount,
      ).not.toBeNull();
    });
  });

  it("preload through", async () => {
    const records = [
      comments("eager_sti_on_associations_s_comment1"),
      comments("eager_sti_on_associations_s_comment2"),
    ];

    await assertQueriesCount(2, false, async () => {
      const preloader = new Preloader({ records, associations: ["author", "post"] });
      await preloader.call();
    });

    await assertNoQueries(false, async () => {
      for (const comment of records) await (comment as any).author;
    });
  });

  it("preload groups queries with same scope at second level", async () => {
    let author: any = null;

    await assertQueriesCount(4, false, async () => {
      author = await Author.where({ name: "David" })
        .includes({ thinkingPosts: "comments", welcomePosts: "comments" })
        .first();
    });

    await assertNoQueries(false, async () => {
      for (const p of await author.thinkingPosts.toArray()) await p.comments.toArray();
      for (const p of await author.welcomePosts.toArray()) await p.comments.toArray();
    });
  });
  it("preload groups queries with same sql at second level", async () => {
    let author: any = null;

    await assertQueriesCount(4, false, async () => {
      author = await Author.where({ name: "David" })
        .includes({ thinkingPosts: "comments", welcomePosts: "commentsWithExtending" })
        .first();
    });

    await assertNoQueries(false, async () => {
      for (const p of await author.thinkingPosts.toArray()) await p.comments.toArray();
      for (const p of await author.welcomePosts.toArray()) await p.commentsWithExtending.toArray();
    });
  });
  it("preload with grouping sets inverse association", async () => {
    const mary = authors("mary");
    const bob = authors("bob");

    await AuthorFavorite.createBang({ author: mary, favoriteAuthor: bob });
    const favorites = await AuthorFavorite.all();

    await assertQueriesCount(1, false, async () => {
      const preloader = new Preloader({
        records: favorites,
        associations: ["author", "favoriteAuthor"],
      });
      await preloader.call();
    });

    await assertNoQueries(false, async () => {
      const first = favorites[0] as any;
      await first.author;
      await first.favoriteAuthor;
    });
  });
  it("preload can group separate levels", async () => {
    const mary = authors("mary") as any;
    const bob = authors("bob");

    await AuthorFavorite.createBang({ author: mary, favoriteAuthor: bob });

    await assertQueriesCount(3, false, async () => {
      const preloader = new Preloader({
        records: [mary],
        associations: ["posts", { favoriteAuthors: "posts" }],
      });
      await preloader.call();
    });

    await assertNoQueries(false, async () => {
      await mary.posts.toArray();
      for (const a of await mary.favoriteAuthors.toArray()) await a.posts.toArray();
    });
  });
  it("preload can group multi level ping pong through", async () => {
    const mary = authors("mary") as any;
    const bob = authors("bob");

    await AuthorFavorite.createBang({ author: mary, favoriteAuthor: bob });

    const associations = {
      similarPosts: "comments",
      favoriteAuthors: { similarPosts: "comments" },
    };

    await assertQueriesCount(9, false, async () => {
      const preloader = new Preloader({ records: [mary], associations });
      await preloader.call();
    });

    await assertNoQueries(false, async () => {
      for (const p of await mary.similarPosts.toArray()) await p.comments.toArray();
      for (const a of await mary.favoriteAuthors.toArray()) {
        for (const p of await a.similarPosts.toArray()) await p.comments.toArray();
      }
    });

    const tagReflection = Tagging.reflectOnAssociation("tag") as any;
    const taggingsReflection = Tag.reflectOnAssociation("taggings") as any;

    expect(tagReflection.scope).toBeTruthy();
    assertNot(taggingsReflection.scope);

    const saved = [tagReflection, taggingsReflection].map((r) => ({
      r,
      prevAutoScope: r.klass.automaticScopeInversing,
      prevNameCache: r._inverseNameCache,
      prevOfCache: r._inverseOfCache,
    }));
    for (const { r } of saved) {
      r.klass.automaticScopeInversing = true;
      r._inverseNameCache = undefined;
      r._inverseOfCache = undefined;
    }
    try {
      await mary.reload();

      await assertQueriesCount(8, false, async () => {
        const preloader = new Preloader({ records: [mary], associations });
        await preloader.call();
      });
    } finally {
      for (const { r, prevAutoScope, prevNameCache, prevOfCache } of saved) {
        r.klass.automaticScopeInversing = prevAutoScope;
        r._inverseNameCache = prevNameCache;
        r._inverseOfCache = prevOfCache;
      }
    }
  });
  it("preload does not group same class different scope", async () => {
    const post = posts("welcome") as any;
    const postesque = (await PostesquePL.create({ author: await Author.last() })) as any;
    await postesque.reload();

    await assertQueriesCount(2, false, async () => {
      const preloader = new Preloader({
        records: [post, postesque],
        associations: "authorWithTheLetterA",
      });
      await preloader.call();
    });

    await assertNoQueries(false, async () => {
      await post.authorWithTheLetterA;
      await postesque.authorWithTheLetterA;
    });

    await post.reload();
    await postesque.reload();

    await assertQueriesCount(3, false, async () => {
      const preloader = new Preloader({
        records: [post, postesque],
        associations: "authorWithAddress",
      });
      await preloader.call();
    });

    await assertNoQueries(false, async () => {
      await post.authorWithAddress;
      await postesque.authorWithAddress;
    });
  });
  it("preload does not group same scope different key name", async () => {
    const post = posts("welcome") as any;
    const postesque = (await PostesquePL.create({ author: await Author.last() })) as any;
    await postesque.reload();

    await assertQueriesCount(2, false, async () => {
      const preloader = new Preloader({ records: [post, postesque], associations: "author" });
      await preloader.call();
    });

    await assertNoQueries(false, async () => {
      await post.author;
      await postesque.author;
    });
  });
  it("multi database polymorphic preload with same table name", async () => {
    const dog = dogs("sophie");
    const dogComment = comments("greetings") as any;
    dogComment.origin_type = dog.constructor.name;
    dogComment.origin_id = dog.id;

    const otherDog = otherDogs("lassie");
    const otherDogComment = comments("more_greetings") as any;
    otherDogComment.origin_type = otherDog.constructor.name;
    otherDogComment.origin_id = otherDog.id;

    const spy = vi.spyOn(LoaderQuery.prototype, "loadRecordsInBatch");
    await new Preloader({
      records: [dogComment, otherDogComment],
      associations: ["origin"],
    }).call();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("preload with available records", async () => {
    const post = posts("welcome") as any;
    const david = authors("david");

    await assertNoQueries(false, async () => {
      await new Preloader({
        records: [post],
        associations: "author",
        availableRecords: [[david]],
      }).call();

      assertPredicate(post.association("author"), (a: any) => a.isLoaded());
      assertSame(david, await post.author);
    });
  });

  it("preload with available records sti", async () => {
    const book = (await Book.createBang({})) as any;
    const essaySpecial = await EssaySpecial.createBang({});
    await book.setEssay(essaySpecial);
    await book.saveBang();
    await book.reload();

    assertNotPredicate(book.association("essay"), (a: any) => a.isLoaded());

    await assertNoQueries(false, async () => {
      await new Preloader({
        records: [book],
        associations: "essay",
        availableRecords: [[essaySpecial]],
      }).call();
    });

    assertPredicate(book.association("essay"), (a: any) => a.isLoaded());
    assertSame(essaySpecial, await book.essay);
  });

  it("preload with only some records available", async () => {
    const bobPost = posts("misc_by_bob") as any;
    const maryPost = posts("misc_by_mary") as any;
    const bob = authors("bob");
    const mary = authors("mary");

    await assertQueriesCount(1, false, async () => {
      await new Preloader({
        records: [bobPost, maryPost],
        associations: "author",
        availableRecords: [bob],
      }).call();
    });

    await assertNoQueries(false, async () => {
      assertSame(bob, await bobPost.author);
      expect(mary.equals(await maryPost.author)).toBe(true);
    });
  });

  it("preload with some records already loaded", async () => {
    const bobPost = posts("misc_by_bob") as any;
    const maryPost = posts("misc_by_mary") as any;
    const bob = await bobPost.author;
    const mary = authors("mary");

    assertPredicate(bobPost.association("author"), (a: any) => a.isLoaded());
    assertNot(maryPost.association("author").isLoaded());

    await assertQueriesCount(1, false, async () => {
      await new Preloader({ records: [bobPost, maryPost], associations: "author" }).call();
    });

    await assertNoQueries(false, async () => {
      assertSame(bob, await bobPost.author);
      expect(mary.equals(await maryPost.author)).toBe(true);
    });
  });

  it("preload with available records with through association", async () => {
    const author = authors("david") as any;
    const categories = await Category.all();

    await assertQueriesCount(1, false, async () => {
      await new Preloader({
        records: [author],
        associations: "essayCategory",
        availableRecords: categories,
      }).call();
    });

    assertPredicate(author.association("essayCategory"), (a: any) => a.isLoaded());
    expect(categories.includes(await author.essayCategory)).toBeTruthy();
  });

  it("preload with only some records available with through associations", async () => {
    const mary = authors("mary") as any;
    const maryEssay = essays("mary_stay_home") as any;
    const maryCategory = categories("technology");
    await maryEssay.updateBang({ category: maryCategory });

    const dave = authors("david") as any;
    const daveCategory = categories("general");

    await assertQueriesCount(2, false, async () => {
      await new Preloader({
        records: [mary, dave],
        associations: "essayCategory",
        availableRecords: [maryCategory],
      }).call();
    });

    await assertNoQueries(false, async () => {
      assertSame(maryCategory, await mary.essayCategory);
      expect(daveCategory.equals(await dave.essayCategory)).toBe(true);
    });
  });

  it("preload with available records with multiple classes", async () => {
    const essay = essays("david_modest_proposal") as any;
    const general = categories("general");
    const david = authors("david");

    await assertNoQueries(false, async () => {
      await new Preloader({
        records: [essay],
        associations: ["category", "author"],
        availableRecords: [general, david],
      }).call();

      assertPredicate(essay.association("category"), (a: any) => a.isLoaded());
      assertPredicate(essay.association("author"), (a: any) => a.isLoaded());
      assertSame(general, await essay.category);
      assertSame(david, await essay.author);
    });
  });

  it("preload with available records queries when scoped", async () => {
    const post = posts("welcome") as any;
    const david = authors("david");

    await assertQueriesCount(1, false, async () => {
      await new Preloader({
        records: [post],
        associations: "author",
        scope: Author.where({ name: "David" }) as any,
        availableRecords: [david],
      }).call();
    });

    assertPredicate(post.association("author"), (a: any) => a.isLoaded());
    expect(await post.author).not.toBe(david);
  });

  it("preload with available records queries when collection", async () => {
    const post = posts("welcome") as any;
    const comments = await Comment.all();

    await assertQueriesCount(1, false, async () => {
      await new Preloader({
        records: [post],
        associations: "comments",
        availableRecords: comments,
      }).call();
    });

    assertPredicate(post.association("comments"), (a: any) => a.isLoaded());
    assertEmpty((await post.comments.toArray()).filter((c: Base) => comments.includes(c)));
  });

  it("preload with available records queries when incomplete", async () => {
    const post = posts("welcome") as any;
    const bob = authors("bob");
    const david = authors("david");

    await assertQueriesCount(1, false, async () => {
      await new Preloader({
        records: [post],
        associations: "author",
        availableRecords: [bob],
      }).call();
    });

    await assertNoQueries(false, async () => {
      assertPredicate(post.association("author"), (a: any) => a.isLoaded());
      expect(david.equals(await post.author)).toBe(true);
    });
  });

  it("preload with unpersisted records no ops", async () => {
    const author = new Author({});
    const newPostWithAuthor = new Post({ author }) as any;
    const newPostWithoutAuthor = new Post({}) as any;
    const posts = [newPostWithAuthor, newPostWithoutAuthor];

    await assertNoQueries(false, async () => {
      await new Preloader({ records: posts, associations: "author" }).call();

      assertSame(author, await newPostWithAuthor.author);
      expect(await newPostWithoutAuthor.author).toBeNull();
    });
  });

  it("preload wont set the wrong target", async () => {
    const post = posts("welcome") as any;
    await post.updateBang({ author_id: 54321 });
    const someOtherRecord = categories("general") as any;
    await someOtherRecord.updateBang({ id: 54321 });

    await assertRaises([Error], {}, () => someOtherRecord.association("author"));

    await assertNothingRaised(async () => {
      await new Preloader({
        records: [post],
        associations: "author",
        availableRecords: [[someOtherRecord]],
      }).call();
      assertPredicate(post.association("author"), (a: any) => a.isLoaded());
      expect(await post.author).not.toEqual(someOtherRecord);
    });
  });

  it("preload has many association with composite foreign key", async () => {
    const blogPost = shardedBlogPosts("great_post_blog_one") as any;
    const blogPosts = [blogPost, shardedBlogPosts("great_post_blog_two")];

    await new Preloader({ records: blogPosts, associations: ["comments"] }).call();

    assertPredicate(blogPost.association("comments"), (a: any) => a.isLoaded());
    const blogPostComments = await blogPost.comments.toArray();
    expect(blogPostComments).toContain(
      blogPostComments.find((c: Base) => c.equals(shardedComments("great_comment_blog_post_one"))),
    );
  });

  it("preload belongs to association with composite foreign key", async () => {
    const comment = shardedComments("great_comment_blog_post_one") as any;
    const comments = [comment, shardedComments("great_comment_blog_post_two")];

    await new Preloader({ records: comments, associations: "blogPost" }).call();

    assertPredicate(comment.association("blogPost"), (a: any) => a.isLoaded());
    expect(shardedBlogPosts("great_post_blog_one").equals(await comment.blogPost)).toBe(true);
  });

  it("preload loaded belongs to association with composite foreign key", async () => {
    const comment = shardedComments("great_comment_blog_post_one") as any;
    await comment.blogPost;

    await assertNoQueries(false, async () => {
      await new Preloader({ records: [comment], associations: "blogPost" }).call();
    });
  });

  it("preload has many through association with composite query constraints", async () => {
    const tag = shardedTags("short_read_blog_one") as any;

    const tags = [tag, shardedTags("breaking_news_blog_2")];

    await new Preloader({ records: tags, associations: "blogPosts" }).call();

    expect(tags.every((tag: any) => tag.association("blogPosts").isLoaded())).toBeTruthy();

    const expectedBlogPostIds = await ShardedBlogPostTagPL.where({
      blog_id: tag.blog_id,
      tag_id: tag.id,
    }).pluck("blog_post_id");

    assertNotEmpty(expectedBlogPostIds);

    expect([...expectedBlogPostIds].sort()).toEqual(
      (await tag.blogPosts.toArray()).map((p: Base) => p.id).sort(),
    );
  });

  it("preloads has many on model with a composite primary key through id attribute", async () => {
    const order = cpkOrders("cpk_groceries_order_2") as any;
    const [, orderId] = order.id as [number, number];
    const orderAgreements = await CpkOrderAgreementPL.where({ order_id: orderId });

    assertNotEmpty(orderAgreements);
    expect(orderAgreements.map((a) => a.id).sort()).toEqual(
      (await order.orderAgreements.toArray()).map((a: Base) => a.id).sort(),
    );

    let loadedOrder: any = null;
    const sql = await captureSql(async () => {
      loadedOrder = (await CpkOrderPL.where({ id: orderId }).includes("orderAgreements"))[0];
    });

    expect(sql.length).toBe(2);
    const preloadSql = sql[sql.length - 1];

    const orderIdColumn = regexpEscape(quoteTableName("cpk_order_agreements.order_id"));
    const expectation = new RegExp(`SELECT.*WHERE.* ${orderIdColumn} = (\\?|(\\d+)|\\$\\d)$`);

    expect(preloadSql).toMatch(expectation);
    expect(orderAgreements.map((a) => a.id).sort()).toEqual(
      (await loadedOrder.orderAgreements.toArray()).map((a: Base) => a.id).sort(),
    );
  });

  it("preloads belongs to a composite primary key model through id attribute", async () => {
    const orderAgreement = cpkOrderAgreements("order_agreement_three") as any;
    const order = cpkOrders("cpk_groceries_order_2");
    expect(order.equals(await orderAgreement.order)).toBe(true);

    let loadedOrderAgreement: any = null;
    const sql = await captureSql(async () => {
      loadedOrderAgreement = (
        await CpkOrderAgreementPL.where({ id: orderAgreement.id }).includes("order")
      )[0];
    });

    expect(sql.length).toBe(2);
    const preloadSql = sql[sql.length - 1];

    const orderId = regexpEscape(quoteTableName("cpk_orders.id"));
    const expectation = new RegExp(`SELECT.*WHERE.* ${orderId} = (\\?|(\\d+)|\\$\\d)$`);

    expect(preloadSql).toMatch(expectation);
    expect(order.equals(await loadedOrderAgreement.order)).toBe(true);
  });

  it("preload keeps built has many records no ops", async () => {
    const post = new Post({}) as any;
    const comment = post.comments.build();

    await assertNoQueries(false, async () => {
      await new Preloader({ records: [post], associations: "comments" }).call();

      expect(await post.comments.toArray()).toEqual([comment]);
    });
  });

  it("preload keeps built has many records after query", async () => {
    const post = posts("welcome") as any;
    const comment = post.comments.build();

    await assertQueriesCount(1, false, async () => {
      await new Preloader({ records: [post], associations: "comments" }).call();

      expect(await post.comments.toArray()).toContain(comment);
    });
  });

  it("preload keeps built belongs to records no ops", async () => {
    const post = new Post({}) as any;
    const author = post.buildAuthor();

    await assertNoQueries(false, async () => {
      await new Preloader({ records: [post], associations: "author" }).call();

      assertSame(author, await post.author);
    });
  });

  it("preload keeps built belongs to records after query", async () => {
    const post = posts("welcome") as any;
    const author = post.buildAuthor();

    await assertNoQueries(false, async () => {
      await new Preloader({ records: [post], associations: "author" }).call();

      assertSame(author, await post.author);
    });
  });

  it("preload marks belongs_to association loaded on owner", async () => {
    const welcome = posts("welcome");
    const loaded = await Post.where({ id: welcome.id }).includes(":author");
    expect(loaded).toHaveLength(1);
    const assoc = (loaded[0] as any).association("author");
    expect(assoc.isLoaded()).toBe(true);
    expect(assoc.target?.id).toBe(authors("david").id);
  });

  it("preload sets has_many association target on owner", async () => {
    const david = authors("david");
    const owners = await Author.where({ id: david.id }).includes(":posts");
    const assoc = (owners[0] as any).association("posts");
    expect(assoc.isLoaded()).toBe(true);
    const ids = (assoc.target as Base[]).map((r) => r.id);
    expect(ids).toContain(posts("welcome").id);
  });
});

describe("OverridingAssociationsTest", () => {
  fixtures([]);

  class DifferentPerson extends Base {}
  registerModel("DifferentPerson", DifferentPerson);

  class PeopleList extends Base {
    static {
      this._tableName = "people_lists";
      this.hasAndBelongsToMany("hasAndBelongsToMany", { beforeAdd: () => {} });
      this.hasMany("hasMany", { beforeAdd: () => {} });
      this.belongsTo("belongsTo");
      this.hasOne("hasOne");
    }
  }

  class DifferentPeopleList extends PeopleList {
    static {
      this.hasAndBelongsToMany("hasAndBelongsToMany", { className: "DifferentPerson" });
      this.hasMany("hasMany", { className: "DifferentPerson" });
      this.belongsTo("belongsTo", { className: "DifferentPerson" });
      this.hasOne("hasOne", { className: "DifferentPerson" });
    }
  }

  it("habtm association redefinition callbacks should differ and not inherited", () => {
    let callbacks = (PeopleList as any).beforeAddForHasAndBelongsToMany;
    expect(callbacks.length).toBe(1);
    callbacks = (DifferentPeopleList as any).beforeAddForHasAndBelongsToMany;
    expect(callbacks).toEqual([]);
  });

  it("has many association redefinition callbacks should differ and not inherited", () => {
    let callbacks = (PeopleList as any).beforeAddForHasMany;
    expect(callbacks.length).toBe(1);
    callbacks = (DifferentPeopleList as any).beforeAddForHasMany;
    expect(callbacks).toEqual([]);
  });

  it("habtm association redefinition reflections should differ and not inherited", () => {
    expect(reflectOnAssociation(PeopleList, "hasAndBelongsToMany")).not.toBe(
      reflectOnAssociation(DifferentPeopleList, "hasAndBelongsToMany"),
    );
  });

  it("has many association redefinition reflections should differ and not inherited", () => {
    expect(reflectOnAssociation(PeopleList, "hasMany")).not.toBe(
      reflectOnAssociation(DifferentPeopleList, "hasMany"),
    );
  });

  it("belongs to association redefinition reflections should differ and not inherited", () => {
    expect(reflectOnAssociation(PeopleList, "belongsTo")).not.toBe(
      reflectOnAssociation(DifferentPeopleList, "belongsTo"),
    );
  });

  it("has one association redefinition reflections should differ and not inherited", () => {
    expect(reflectOnAssociation(PeopleList, "hasOne")).not.toBe(
      reflectOnAssociation(DifferentPeopleList, "hasOne"),
    );
  });

  it("requires symbol argument", async () => {
    await assertRaises([ArgumentError], {}, () => {
      class RequiresSymbolArgument extends Post {
        static {
          this.belongsTo(new String("author") as any);
        }
      }
      return RequiresSymbolArgument;
    });
  });

  it("associations raise with name error if associated to classes that do not exist", () => {
    class ModelAssociatedToClassesThatDoNotExist extends Base {
      static {
        this._tableName = "accounts";
        this.hasOne("nonExistentHasOneClass");
        this.belongsTo("nonExistentBelongsToClass");
        this.hasMany("nonExistentHasManyClasses");
      }
    }
    const record = new ModelAssociatedToClassesThatDoNotExist();
    expect(() => record.association("nonExistentHasOneClass")).toThrow(NameError);
    expect(() => record.association("nonExistentBelongsToClass")).toThrow(NameError);
    expect(() => record.association("nonExistentHasManyClasses")).toThrow(NameError);
  });
});

describe("GeneratedMethodsTest", () => {
  const { computers, developers, posts, comments } = fixtures([
    "computers",
    "developers",
    "posts",
    "comments",
  ]);
  it("association methods override attribute methods of same name", async () => {
    const computer = await Computer.find(computers("workstation").id);
    const developer = await Developer.find(developers("david").id);
    expect((await computer.developer)?.id).toBe(developer.id);
    expect((await computer.developer)?.id).toBe(developer.id);
    expect(computer.readAttribute("developer")).toBe(Number(developer.id));
  });

  it("model method overrides association method", async () => {
    const post = await Post.find(posts("welcome").id);
    expect(await post.firstComment).toBe(comments("greetings").body);
  });

  it("included module overwrites association methods", () => {
    class MyArticle extends Base {
      static {
        Object.defineProperty(this.prototype, "comments", {
          get() {
            return "none" as const;
          },
          configurable: false,
        });
        this._tableName = "articles";
        this.hasMany("comments", { inverseOf: false });
      }
    }
    expect(new (MyArticle as any)().comments).toBe("none");
  });
});

describe("WithAnnotationsTest", () => {
  class SpacePirateAnnotated extends Base {
    static {
      this.tableName = "pirates";
      this.belongsTo("parrot", { className: "Parrot", foreignKey: "parrot_id" });
      this.belongsTo("parrotWithAnnotation", (q: any) => q.annotate("that tells jokes"), {
        className: "Parrot",
        foreignKey: "parrot_id",
      });
      this.hasAndBelongsToMany("parrots", { className: "Parrot", foreignKey: "pirate_id" });
      this.hasAndBelongsToMany(
        "parrotsWithAnnotation",
        (q: any) => q.annotate("that are very colorful"),
        {
          className: "Parrot",
          foreignKey: "pirate_id",
        },
      );
      this.hasOne("ship", { className: "Ship", foreignKey: "pirate_id" });
      this.hasOne("shipWithAnnotation", (q: any) => q.annotate("that is a rocket"), {
        className: "Ship",
        foreignKey: "pirate_id",
      });
      this.hasMany("birds", { className: "Bird", foreignKey: "pirate_id" });
      this.hasMany("birdsWithAnnotation", (q: any) => q.annotate("that are also parrots"), {
        className: "Bird",
        foreignKey: "pirate_id",
      });
      this.hasMany("treasures", { as: "looter" });
      this.hasMany("treasureEstimates", { through: "treasures", source: "priceEstimates" });
      this.hasMany("treasureEstimatesWithAnnotation", (q: any) => q.annotate("yarrr"), {
        through: "treasures",
        source: "priceEstimates",
      });
    }
  }

  const { pirates } = fixtures([
    "pirates",
    "parrots",
    "parrotsPirates",
    "ships",
    "treasures",
    "priceEstimates",
  ]);

  it("belongs to with annotation includes a query comment", async () => {
    const pirate = (await SpacePirateAnnotated.where().not({ parrot_id: null }).first()) as any;
    expect(pirate).toBeTruthy();

    const log = await captureSql(async () => {
      await pirate.parrot;
    });
    assertNotPredicate(log, (l: string[]) => l.length === 0);
    assertPredicate(
      log.filter((query) => /\/\*/.test(query)),
      (l: string[]) => l.length === 0,
    );

    await assertQueriesMatch(/\/\* that tells jokes \*\//, undefined, false, async () => {
      await pirate.parrotWithAnnotation;
    });
  });

  it("has and belongs to many with annotation includes a query comment", async () => {
    const pirate = (await SpacePirateAnnotated.first()) as any;
    expect(pirate).toBeTruthy();

    const log = await captureSql(async () => {
      await pirate.parrots.first();
    });
    assertNotPredicate(log, (l: string[]) => l.length === 0);
    assertPredicate(
      log.filter((query) => /\/\*/.test(query)),
      (l: string[]) => l.length === 0,
    );

    await assertQueriesMatch(/\/\* that are very colorful \*\//, undefined, false, async () => {
      await pirate.parrotsWithAnnotation.first();
    });
  });

  it("has one with annotation includes a query comment", async () => {
    const pirate = (await SpacePirateAnnotated.first()) as any;
    expect(pirate).toBeTruthy();

    const log = await captureSql(async () => {
      await pirate.ship;
    });
    assertNotPredicate(log, (l: string[]) => l.length === 0);
    assertPredicate(
      log.filter((query) => /\/\*/.test(query)),
      (l: string[]) => l.length === 0,
    );

    await assertQueriesMatch(/\/\* that is a rocket \*\//, undefined, false, async () => {
      await pirate.shipWithAnnotation;
    });
  });

  it("has many with annotation includes a query comment", async () => {
    const pirate = (await SpacePirateAnnotated.first()) as any;
    expect(pirate).toBeTruthy();

    const log = await captureSql(async () => {
      await pirate.birds.first();
    });
    assertNotPredicate(log, (l: string[]) => l.length === 0);
    assertPredicate(
      log.filter((query) => /\/\*/.test(query)),
      (l: string[]) => l.length === 0,
    );

    await assertQueriesMatch(/\/\* that are also parrots \*\//, undefined, false, async () => {
      await pirate.birdsWithAnnotation.first();
    });
  });

  it("has many through with annotation includes a query comment", async () => {
    const pirate = (await SpacePirateAnnotated.first()) as any;
    expect(pirate).toBeTruthy();

    const log = await captureSql(async () => {
      await pirate.treasureEstimates.first();
    });
    assertNotPredicate(log, (l: string[]) => l.length === 0);
    assertPredicate(
      log.filter((query) => /\/\*/.test(query)),
      (l: string[]) => l.length === 0,
    );

    await assertQueriesMatch(/\/\* yarrr \*\//, undefined, false, async () => {
      await pirate.treasureEstimatesWithAnnotation.first();
    });
  });

  it("has many through with annotation includes a query comment when eager loading", async () => {
    const pirate = (await SpacePirateAnnotated.first()) as any;
    expect(pirate).toBeTruthy();

    const log = await captureSql(async () => {
      await pirate.treasureEstimates.first();
    });
    assertNotPredicate(log, (l: string[]) => l.length === 0);
    assertPredicate(
      log.filter((query) => /\/\*/.test(query)),
      (l: string[]) => l.length === 0,
    );

    await assertQueriesMatch(/\/\* yarrr \*\//, undefined, false, async () => {
      await SpacePirateAnnotated.includes("treasureEstimatesWithAnnotation", "treasures").first();
    });
  });
});

describe("AssociationsTest", () => {
  const { companies, authors, shardedBlogs, shardedBlogPosts, shardedComments, cpkOrders } =
    fixtures([
      "companies",
      "authors",
      "authorFavorites",
      "shardedBlogs",
      "shardedBlogPosts",
      "shardedComments",
      "shardedTags",
      "shardedBlogPostsTags",
      "cpkOrders",
      "cpkBooks",
    ]);

  let Author: typeof AuthorT;
  let AuthorFavorite: typeof Base;
  let Firm: typeof FirmT;
  let Client: typeof Base;
  let Tag: typeof TagT;
  let Tagging: typeof TaggingT;
  let Developer: typeof DeveloperT;
  let Project: typeof Base;
  let ShardedBlog: typeof Base;
  let ShardedBlogPost: typeof Base;
  let ShardedBlogPostWithRevision: typeof Base;
  let ShardedComment: typeof Base;
  let ShardedTag: typeof Base;
  let ShardedBlogPostTag: typeof Base;
  let Company: typeof Base;
  let Account: typeof Base;
  let Liquid: typeof Base;
  let Molecule: typeof Base;
  let Electron: typeof Base;
  let Ship: typeof Base;
  let ShipPart: typeof Base;
  let CpkOrder: typeof Base;
  let CpkBook: typeof Base;
  let CpkOrderAgreement: typeof Base;
  let CpkOrderWithPrimaryKeyAssociatedBook: typeof Base;
  let CpkCar: typeof Base;
  let CpkCarReview: typeof Base;
  let Person: typeof Base;
  let Reader: typeof Base;
  let Post: typeof Base;

  beforeAll(async () => {
    const shardedMod = await import("./test-helpers/models/sharded.js");
    ShardedBlog = shardedMod.ShardedBlog as never;
    ShardedBlogPost = shardedMod.ShardedBlogPost as never;
    ShardedBlogPostWithRevision = shardedMod.ShardedBlogPostWithRevision as never;
    if (!reflectOnAssociation(ShardedBlogPostWithRevision, "commentsWithoutQueryConstraints")) {
      (ShardedBlogPostWithRevision as any).hasMany("commentsWithoutQueryConstraints", {
        primaryKey: ["blog_id", "id"],
        className: "ShardedComment",
      });
    }
    ShardedComment = shardedMod.ShardedComment as never;
    ShardedTag = shardedMod.ShardedTag as never;
    ShardedBlogPostTag = shardedMod.ShardedBlogPostTag as never;
    const authorMod = await import("./test-helpers/models/author.js");
    Author = authorMod.Author as never;
    AuthorFavorite = authorMod.AuthorFavorite as never;
    const companyMod = await import("./test-helpers/models/company.js");
    Company = companyMod.Company as never;
    Firm = companyMod.Firm as never;
    Client = companyMod.Client as never;
    Tag = (await import("./test-helpers/models/tag.js")).Tag as never;
    Tagging = (await import("./test-helpers/models/tagging.js")).Tagging as never;
    Developer = (await import("./test-helpers/models/developer.js")).Developer as never;
    Project = (await import("./test-helpers/models/project.js")).Project as never;
    Account = (await import("./test-helpers/models/account.js")).Account as never;
    Liquid = (await import("./test-helpers/models/liquid.js")).Liquid as never;
    Molecule = (await import("./test-helpers/models/molecule.js")).Molecule as never;
    Electron = (await import("./test-helpers/models/electron.js")).Electron as never;
    const shipMod = await import("./test-helpers/models/ship.js");
    Ship = shipMod.Ship as never;
    ShipPart = (await import("./test-helpers/models/ship-part.js")).ShipPart as never;
    const cpkMod = await import("./test-helpers/models/cpk.js");
    CpkOrder = cpkMod.CpkOrder as never;
    CpkBook = cpkMod.CpkBook as never;
    CpkOrderAgreement = cpkMod.CpkOrderAgreement as never;
    CpkOrderWithPrimaryKeyAssociatedBook = cpkMod.CpkOrderWithPrimaryKeyAssociatedBook as never;
    CpkCar = cpkMod.CpkCar as never;
    CpkCarReview = cpkMod.CpkCarReview as never;
    Person = (await import("./test-helpers/models/person.js")).Person as never;
    Reader = (await import("./test-helpers/models/reader.js")).Reader as never;
    Post = (await import("./test-helpers/models/post.js")).Post as never;
  });

  beforeEach(() => {
    registerModel("Author", Author);
    registerModel("AuthorFavorite", AuthorFavorite);
    registerModel("Firm", Firm);
    registerModel("Client", Client);
    registerModel("Tag", Tag);
    registerModel("Tagging", Tagging);
    registerModel("Developer", Developer);
    registerModel("Project", Project);
    registerModel("ShardedBlog", ShardedBlog);
    registerModel("ShardedBlogPost", ShardedBlogPost);
    registerModel("ShardedBlogPostWithRevision", ShardedBlogPostWithRevision);
    registerModel("ShardedComment", ShardedComment);
    registerModel("ShardedTag", ShardedTag);
    registerModel("ShardedBlogPostTag", ShardedBlogPostTag);
    registerModel("Company", Company);
    registerModel("Account", Account);
    registerModel("Liquid", Liquid);
    registerModel("Molecule", Molecule);
    registerModel("Electron", Electron);
    registerModel("Ship", Ship);
    registerModel("ShipPart", ShipPart);
    registerModel("CpkOrder", CpkOrder);
    registerModel("CpkBook", CpkBook);
    registerModel("CpkOrderAgreement", CpkOrderAgreement);
    registerModel("CpkOrderWithPrimaryKeyAssociatedBook", CpkOrderWithPrimaryKeyAssociatedBook);
    registerModel("CpkCar", CpkCar);
    registerModel("CpkCarReview", CpkCarReview);
    registerModel("Person", Person);
    registerModel("Reader", Reader);
    registerModel("Post", Post);
  });

  it("eager loading should not change count of children", async () => {
    const liquid = await Liquid.create({ name: "salty" });
    const molecule = await (liquid as any).molecules.create({ name: "molecule_1" });
    await molecule.electrons.create({ name: "electron_1" });
    await molecule.electrons.create({ name: "electron_2" });

    const liquids = await Liquid.includes({ ":molecules": ":electrons" })
      .references("molecules")
      .where("molecules.id is not null");
    expect((await (liquids[0] as any).molecules.toArray()).length).toBe(1);
  });

  it("should construct new finder sql after create", async () => {
    const person = Person.new({ first_name: "clark" });
    expect(await association(person, "readers")).toEqual([]);
    await person.save();
    const reader = await Reader.create({
      person,
      post: Post.new({ title: "foo", body: "bar" }),
    });
    expect(await association(person, "readers").find((reader as any).id)).toBeTruthy();
  });

  it("subselect", async () => {
    const author = authors("david") as any;
    const favs = await author.authorFavorites.toArray();
    const fav2 = await author.authorFavorites
      .where({ author: Author.where({ id: author.id }) })
      .toArray();
    expect(favs.map((f: Base) => f.id)).toEqual(fav2.map((f: Base) => f.id));
  });

  it("loading the association target should keep child records marked for destruction", async () => {
    const ship = (await Ship.createBang({ name: "The good ship Dollypop" })) as any;
    const part = await ship.parts.createBang({ name: "Mast" });
    part.markForDestruction();
    assertPredicate((await ship.parts.toArray())[0], (p: any) => p.markedForDestruction());
  });

  it("loading the association target should load most recent attributes for child records marked for destruction", async () => {
    const ship = await Ship.create({ name: "The good ship Dollypop" });
    const part = await (ship as any).parts.create({ name: "Mast" });
    part.markForDestruction();
    const reloaded = await ShipPart.find(part.id as number);
    await reloaded.updateColumn("name", "Deck");
    const parts = await (ship as any).parts.toArray();
    expect(parts[0].name).toBe("Deck");
  });

  it("include with order works", async () => {
    await assertNothingRaised(() => Account.all().order("id").includes("firm").first());
    await assertNothingRaised(() => Account.all().order("id").includes("firm").first());
  });

  it("bad collection keys", () => {
    expect(() => {
      class AnonCollectionKeys extends Base {}
      (AnonCollectionKeys as any).hasMany("wheels", { name: "wheels" });
    }).toThrow();
  });

  it("using limitable reflections helper", () => {
    const usingLimitableReflections = (reflections: any[]) =>
      (Tagging.all() as any).usingLimitableReflections(reflections);
    const belongsToReflections = [
      Tagging.reflectOnAssociation("tag"),
      Tagging.reflectOnAssociation("superTag"),
    ];
    const hasManyReflections = [
      Tag.reflectOnAssociation("taggings"),
      Developer.reflectOnAssociation("projects"),
    ];
    const mixedReflections = [...new Set([...belongsToReflections, ...hasManyReflections])];
    expect(usingLimitableReflections(belongsToReflections)).toBeTruthy();
    assertNot(
      usingLimitableReflections(hasManyReflections),
      "All has many style associations are not limitable",
    );
    assertNot(
      usingLimitableReflections(mixedReflections),
      "No collection associations (has many style) should pass",
    );
  });

  it("association with references", async () => {
    const firm = companies("first_firm");
    const scope = association(firm, "associationWithReferences").scope();
    expect(scope.referencesValues).toEqual([":foo"]);
  });

  it("force reload", async () => {
    const firm = new Firm({ name: "A New Firm, Inc" }) as any;
    await firm.save();
    for (const _ of await firm.clients.toArray()) void _;
    assertPredicate(
      await firm.clients.isEmpty(),
      (e: boolean) => e,
      "New firm shouldn't have client objects",
    );
    expect(await firm.clients.size()).toBe(0);

    const client = new Client({ name: "TheClient.com", firm_id: firm.id });
    await client.save();

    assertPredicate(
      await firm.clients.isEmpty(),
      (e: boolean) => e,
      "New firm should have cached no client objects",
    );
    expect(await firm.clients.size()).toBe(0);

    await firm.clients.reload();

    assertNot(await firm.clients.isEmpty(), "New firm should have reloaded client objects");
    expect(await firm.clients.size()).toBe(1);
  });

  it("append composite foreign key has many association", async () => {
    const blogPost = shardedBlogPosts("great_post_blog_one");
    const comment = new ShardedComment({ body: "Great post! :clap:" });
    await comment.save();
    await association(blogPost, "comments").push(comment);

    const comments = await association(blogPost, "comments");
    expect(comments.map((c: any) => c.id)).toContain((comment as any).id);
    expect(Number((comment as any).blog_post_id)).toBe(Number((blogPost as any).id));
    expect((comment as any).blog_id).toBe((blogPost as any).blog_id);
  });

  it("belongs to a model with composite foreign key finds associated record", async () => {
    const comment = shardedComments("great_comment_blog_post_one") as any;
    const blogPost = shardedBlogPosts("great_post_blog_one");

    expect(blogPost.equals(await comment.blogPost)).toBe(true);
  });

  it("belongs to a model with composite primary key uses composite pk in sql", async () => {
    const comment = shardedComments("great_comment_blog_post_one") as any;

    const sql = (
      await captureSql(async () => {
        await comment.blogPost;
      })
    )[0];

    expect(sql).toMatch(
      new RegExp(`${regexpEscape(quoteTableName("sharded_blog_posts.blog_id"))} =`),
    );
    expect(sql).toMatch(new RegExp(`${regexpEscape(quoteTableName("sharded_blog_posts.id"))} =`));
  });

  it("querying by whole associated records using query constraints", async () => {
    const comments = [
      shardedComments("great_comment_blog_post_one"),
      shardedComments("great_comment_blog_post_two"),
    ];

    const blogPosts = await ShardedBlogPost.where({ comments });

    const expectedPosts = [
      shardedBlogPosts("great_post_blog_one"),
      shardedBlogPosts("great_post_blog_two"),
    ];
    expect(blogPosts.map((p: any) => Number(p.id)).sort((a: number, b: number) => a - b)).toEqual(
      expectedPosts.map((p: any) => Number(p.id)).sort((a: number, b: number) => a - b),
    );
  });

  it("querying by single associated record works using query constraints", async () => {
    const comments = [
      shardedComments("great_comment_blog_post_one"),
      shardedComments("great_comment_blog_post_two"),
    ];

    const blogPosts = await ShardedBlogPost.where({
      comments: comments[comments.length - 1],
    });

    const expectedPosts = [shardedBlogPosts("great_post_blog_two")];
    expect(blogPosts.map((p: any) => Number(p.id)).sort((a: number, b: number) => a - b)).toEqual(
      expectedPosts.map((p: any) => Number(p.id)).sort((a: number, b: number) => a - b),
    );
  });

  it("querying by relation with composite key", async () => {
    const expectedPosts = [
      shardedBlogPosts("great_post_blog_one"),
      shardedBlogPosts("great_post_blog_two"),
    ];

    const blogPosts = await ShardedBlogPost.where({
      comments: ShardedComment.where({ body: "I really enjoyed the post!" }),
    });

    expect(blogPosts.map((p: any) => Number(p.id)).sort((a: number, b: number) => a - b)).toEqual(
      expectedPosts.map((p: any) => Number(p.id)).sort((a: number, b: number) => a - b),
    );
  });

  it("has many association with composite foreign key loads records", async () => {
    const blogPost = shardedBlogPosts("great_post_blog_one");

    const comments = await (blogPost as any).comments;
    const ids = comments.map((c: any) => c.id);
    expect(ids).toContain((shardedComments("wow_comment_blog_post_one") as any).id);
    expect(ids).toContain((shardedComments("great_comment_blog_post_one") as any).id);
  });

  it("has many association from a model with query constraints different from the association", async () => {
    let blogPost: any = shardedBlogPosts("great_post_blog_one");
    blogPost = await ShardedBlogPostWithRevision.find(blogPost.id);
    let comments: Base[] = [];
    const expectedComments = await ShardedComment.where({
      blog_id: blogPost.blog_id,
      blog_post_id: blogPost.id,
    });

    const sql = (
      await captureSql(async () => {
        comments = await blogPost.comments.toArray();
      })
    )[0];

    expect(sql).toMatch(
      new RegExp(`WHERE .*${regexpEscape(quoteTableName("sharded_comments.blog_id"))} =`),
    );
    assertNotEmpty(comments);
    expect(expectedComments.map((c) => c.id).sort()).toEqual(comments.map((c) => c.id).sort());
  });

  it("query constraints over three without defining explicit foreign key query constraints raises", async () => {
    let blogPost: any = shardedBlogPosts("great_post_blog_one");
    blogPost = await ShardedBlogPostWithRevision.find(blogPost.id);

    const error = await assertRaises([ArgumentError], {}, () =>
      blogPost.commentsWithoutQueryConstraints.toArray(),
    );

    expect(error.message).toEqual(
      `The query constraints list on the \`${ShardedBlogPostWithRevision.name}\` model has more than 2 attributes. Active Record is unable to derive the query constraints for the association. You need to explicitly define the query constraints for this association.`,
    );
  });

  it("model with composite query constraints has many association sql", async () => {
    const blogPost = shardedBlogPosts("great_post_blog_one") as any;

    const sql = (
      await captureSql(async () => {
        await blogPost.comments.toArray();
      })
    )[0];

    expect(sql).toMatch(
      new RegExp(`${regexpEscape(quoteTableName("sharded_comments.blog_post_id"))} =`),
    );
    expect(sql).toMatch(
      new RegExp(`${regexpEscape(quoteTableName("sharded_comments.blog_id"))} =`),
    );
  });

  it("preloads model with query constraints by explicitly configured fk and pk", async () => {
    let comment: any = shardedComments("great_comment_blog_post_one");
    const comments = await ShardedComment.where({ id: comment.id }).preload("blogPostById");
    comment = comments[0];
    expect((await comment.blogPostById).equals(await comment.blogPost)).toBe(true);
  });

  it("append composite foreign key has many association with autosave", async () => {
    const blogPost = shardedBlogPosts("great_post_blog_one") as any;
    const comment = new ShardedComment({ body: "Great post! :clap:" }) as any;
    await blogPost.comments.push(comment);

    assertPredicate(comment, (c: any) => c.isPersisted());
    expect(await blogPost.comments.toArray()).toContain(comment);
    expect(blogPost.id).toEqual(comment.blog_post_id);
    expect(blogPost.blog_id).toEqual(comment.blog_id);
  });

  it("append composite has many through association", async () => {
    const blogPost = shardedBlogPosts("great_post_blog_one") as any;
    const tag = new ShardedTag({ name: "Ruby on Rails", blog_id: blogPost.blog_id }) as any;
    await tag.save();

    await blogPost.tags.push(tag);

    const tags = await (await blogPost.reload()).tags.toArray();
    expect(tags).toContain(tags.find((t: Base) => t.equals(tag)));
    assertPredicate(
      await ShardedBlogPostTag.where({
        blog_post_id: blogPost.id,
        blog_id: blogPost.blog_id,
        tag_id: tag.id,
      }).exists(),
      (e: boolean) => e,
    );
  });

  it("append composite has many through association with autosave", async () => {
    const blogPost = shardedBlogPosts("great_post_blog_one") as any;
    const tag = new ShardedTag({ name: "Ruby on Rails", blog_id: blogPost.blog_id }) as any;

    await blogPost.tags.push(tag);

    const tags = await (await blogPost.reload()).tags.toArray();
    expect(tags).toContain(tags.find((t: Base) => t.equals(tag)));
    assertPredicate(
      await ShardedBlogPostTag.where({
        blog_post_id: blogPost.id,
        blog_id: blogPost.blog_id,
        tag_id: tag.id,
      }).exists(),
      (e: boolean) => e,
    );
  });

  it("nullify composite foreign key has many association", async () => {
    const blogPost = shardedBlogPosts("great_post_blog_one") as any;
    let comment: any = shardedComments("great_comment_blog_post_one");

    assertNotEmpty(await blogPost.comments.toArray());
    await blogPost.comments.replace([]);

    comment = await ShardedComment.find(comment.id);
    expect(comment.blog_post_id).toBeNull();
    expect(comment.blog_id).toBeNull();

    assertEmpty(await blogPost.comments.toArray());
    assertEmpty(await (await blogPost.reload()).comments.toArray());
  });

  it("assign persisted composite foreign key belongs to association", async () => {
    const comment = shardedComments("great_comment_blog_post_one");
    const anotherBlog = shardedBlogs("sharded_blog_two");
    expect((comment as any).blog_id).not.toBe((anotherBlog as any).id);

    const blogPost = new ShardedBlogPost({ title: "New post", blog_id: (anotherBlog as any).id });
    await blogPost.save();
    await (comment.association("blogPost") as SingularAssociation).writer(blogPost);

    const loaded = await (comment as any).blogPost;
    expect(loaded.id).toBe((blogPost as any).id);
    expect((comment as any).blog_id).toBe((blogPost as any).blog_id);
    expect(Number((comment as any).blog_id)).toBe(Number((anotherBlog as any).id));
    expect(Number((comment as any).blog_post_id)).toBe(Number((blogPost as any).id));
  });

  it("nullify composite foreign key belongs to association", async () => {
    const comment = shardedComments("great_comment_blog_post_one");
    expect(await (comment as any).blogPost).not.toBeNull();

    await (comment.association("blogPost") as SingularAssociation).writer(null);
    expect((comment as any).blog_id).toBeNull();
    expect((comment as any).blog_post_id).toBeNull();

    await comment.save();
    expect(await (comment as any).blogPost).toBeNull();
    const reloaded = await ShardedComment.find((comment as any).id);
    expect(await (reloaded as any).blogPost).toBeNull();
  });

  it("assign composite foreign key belongs to association", async () => {
    const comment = shardedComments("great_comment_blog_post_one");
    const anotherBlog = shardedBlogs("sharded_blog_two");
    expect((comment as any).blog_id).not.toBe((anotherBlog as any).id);

    const blogPost = new ShardedBlogPost({ title: "New post", blog_id: (anotherBlog as any).id });
    await (comment.association("blogPost") as SingularAssociation).writer(blogPost);

    const loaded = (comment.association("blogPost") as any).target;
    expect(loaded).toBe(blogPost);
    expect((comment as any).blog_id).toBe((blogPost as any).blog_id);
    expect(Number((comment as any).blog_id)).toBe(Number((anotherBlog as any).id));
  });

  it("assign composite foreign key belongs to association with autosave", async () => {
    const comment = shardedComments("great_comment_blog_post_one") as any;
    const anotherBlog = shardedBlogs("sharded_blog_two");
    expect(comment.blog_id).not.toEqual(anotherBlog.id);

    const blogPost = new ShardedBlogPost({ title: "New post", blog_id: anotherBlog.id }) as any;
    await (comment.association("blogPost") as SingularAssociation).writer(blogPost);
    await comment.save();

    assertPredicate(blogPost, (p: any) => p.isPersisted());
    expect(blogPost.equals(await comment.blogPost)).toBe(true);
    expect(comment.blog_id).toEqual(blogPost.blog_id);
    expect(anotherBlog.id).toEqual(comment.blog_id);
    expect(comment.blog_post_id).toEqual(blogPost.id);
  });

  it("belongs to association does not use parent query constraints if not configured to", async () => {
    const comment = shardedComments("great_comment_blog_post_one") as any;
    const blogPost = new ShardedBlogPost({
      blog_id: comment.blog_id,
      title: "Following best practices",
    });

    await (comment.association("blogPostById") as SingularAssociation).writer(blogPost);

    await comment.save();

    assertPredicate(blogPost, (p: Base) => p.isPersisted());
    expect(blogPost.equals(await comment.blogPostById)).toBe(true);
  });

  it("polymorphic belongs to uses parent query constraints", async () => {
    const parentPost = shardedBlogPosts("great_post_blog_one");
    const childPost = new ShardedBlogPost({
      title: "Child post",
      blog_id: (parentPost as any).blog_id,
    });
    await (childPost.association("parent") as SingularAssociation).writer(parentPost);
    await childPost.save();

    const reloaded = await ShardedBlogPost.find((childPost as any).id);
    const loaded = await (reloaded as any).parent;
    expect(loaded.id).toBe((parentPost as any).id);
  });

  it("belongs to a cpk model by id attribute", async () => {
    const order = cpkOrders("cpk_groceries_order_1");
    const orderId = (order as any).id[1];
    const agreement = await CpkOrderAgreement.create({ order_id: orderId, signature: "signed" });

    const loaded = await (agreement as any).order;
    expect(loaded.id).toEqual((order as any).id);
  });

  it("belongs to with explicit composite foreign key", async () => {
    const car = await CpkCar.create({ make: "Tesla", model: "Model S" });
    const review = (await CpkCarReview.create({ car, comment: "Great car!", rating: 5 })) as any;

    await review.reload();

    const sql = await captureSql(async () => {
      expect(car.equals(await review.car)).toBe(true);
    });

    expect(sql[0]).toMatch(new RegExp(`${regexpEscape(quoteTableName("cpk_cars.make"))} =`));
    expect(sql[0]).toMatch(new RegExp(`${regexpEscape(quoteTableName("cpk_cars.model"))} =`));
  });

  it("cpk model has many records by id attribute", async () => {
    const order = cpkOrders("cpk_groceries_order_1");
    const orderId = (order as any).id[1];
    const agreements = [];
    for (let i = 0; i < 2; i++) {
      agreements.push(await CpkOrderAgreement.create({ order_id: orderId, signature: "signed" }));
    }

    const loaded = await (order as any).orderAgreements.toArray();
    expect(loaded.map((a: any) => a.id).sort()).toEqual(agreements.map((a: any) => a.id).sort());
  });

  it("assign belongs to cpk model by id attribute", async () => {
    const order = cpkOrders("cpk_groceries_order_1");
    const agreement = new CpkOrderAgreement({ signature: "signed" });

    await (agreement.association("order") as SingularAssociation).writer(order);
    await agreement.save();

    await agreement.reload();
    const loaded = await (agreement as any).order;
    expect(loaded).not.toBeNull();
    expect((agreement as any).order_id).not.toBeNull();

    expect(loaded.id).toEqual((order as any).id);
    const orderId = (order as any).id[1];
    expect(Number((agreement as any).order_id)).toBe(Number(orderId));
  });

  it("query constraints that dont include the primary key raise with a single column", async () => {
    const original = (ShardedBlogPost as any)._queryConstraintsList;
    try {
      (ShardedBlogPost as any)._queryConstraintsList = ["title"];
      (ShardedBlogPost as any)._hasQueryConstraints = true;
      if (!reflectOnAssociation(ShardedBlogPost, "commentsWithoutSingleColumnQueryConstraints")) {
        (ShardedBlogPost as any).hasMany("commentsWithoutSingleColumnQueryConstraints", {
          primaryKey: ["blog_id", "id"],
          className: "ShardedComment",
        });
      }
      const blogPost = shardedBlogPosts("great_post_blog_one") as any;

      const error = await assertRaises([ArgumentError], {}, () =>
        blogPost.commentsWithoutSingleColumnQueryConstraints.toArray(),
      );

      expect(error.message).toEqual(
        `The query constraints on the \`${ShardedBlogPost.name}\` model does not include the primary key so Active Record is unable to derive the foreign key constraints for the association. You need to explicitly define the query constraints for this association.`,
      );
    } finally {
      (ShardedBlogPost as any)._queryConstraintsList = original;
    }
  });

  it("query constraints that dont include the primary key raise with multiple columns", async () => {
    const original = (ShardedBlogPost as any)._queryConstraintsList;
    try {
      (ShardedBlogPost as any)._queryConstraintsList = ["title", "revision"];
      (ShardedBlogPost as any)._hasQueryConstraints = true;
      if (!reflectOnAssociation(ShardedBlogPost, "commentsWithoutMultipleColumnQueryConstraints")) {
        (ShardedBlogPost as any).hasMany("commentsWithoutMultipleColumnQueryConstraints", {
          primaryKey: ["blog_id", "id"],
          className: "ShardedComment",
        });
      }
      const blogPost = shardedBlogPosts("great_post_blog_one") as any;

      const error = await assertRaises([ArgumentError], {}, () =>
        blogPost.commentsWithoutMultipleColumnQueryConstraints.toArray(),
      );

      expect(error.message).toEqual(
        `The query constraints on the \`${ShardedBlogPost.name}\` model does not include the primary key so Active Record is unable to derive the foreign key constraints for the association. You need to explicitly define the query constraints for this association.`,
      );
    } finally {
      (ShardedBlogPost as any)._queryConstraintsList = original;
    }
  });

  it("query constraints that dont include a composite primary key raise", async () => {
    const originalList = (ShardedBlogPost as any)._queryConstraintsList;
    const originalPk = (ShardedBlogPost as any)._primaryKey;
    const originalReflections = { ...((ShardedBlogPost as any)._reflections ?? {}) };
    try {
      (ShardedBlogPost as any)._primaryKey = ["blog_id", "id"];
      (ShardedBlogPost as any)._queryConstraintsList = ["blog_id", "id"];
      (ShardedBlogPost as any)._hasQueryConstraints = true;
      (ShardedBlogPost as any).hasMany("commentsWithCompositePkOwner", {
        primaryKey: ["blog_id", "id"],
        className: "ShardedComment",
      });
      const blogPost = shardedBlogPosts("great_post_blog_one");
      let error: unknown;
      try {
        await association(blogPost, "commentsWithCompositePkOwner");
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(ArgumentError);
      expect((error as Error).message).toContain("does not include the primary key");
    } finally {
      (ShardedBlogPost as any)._queryConstraintsList = originalList;
      (ShardedBlogPost as any)._primaryKey = originalPk;
      (ShardedBlogPost as any)._reflections = originalReflections;
      clearReflectionsCache(ShardedBlogPost as any);
    }
  });

  it("nullify composite has many through association", async () => {
    const blogPost = shardedBlogPosts("great_post_blog_one") as any;
    assertNotEmpty(await blogPost.tags.toArray());

    await blogPost.tags.replace([]);

    assertEmpty(await blogPost.tags.toArray());
    assertEmpty(await (await blogPost.reload()).tags.toArray());
    assertNotPredicate(
      await ShardedBlogPostTag.where({
        blog_post_id: blogPost.id,
        blog_id: blogPost.blog_id,
      }).exists(),
      (e: boolean) => e,
    );
  });

  it("has many loads via inline fallback resolving composite owner key from query constraints", async () => {
    const post = await ShardedBlogPost.create({ blog_id: 1, title: "Post" });
    await ShardedComment.create({ blog_id: 1, blog_post_id: (post as any).id, body: "A" });
    await ShardedComment.create({ blog_id: 1, blog_post_id: (post as any).id, body: "B" });
    await ShardedComment.create({ blog_id: 2, blog_post_id: (post as any).id, body: "Other" });
    const comments = await (post as any).comments;
    expect(comments).toHaveLength(2);
    expect(comments.map((c: Base) => (c as any).body).sort()).toEqual(["A", "B"]);
  });

  it("has many loads via inline fallback resolving composite owner key as id attribute", async () => {
    const order = (await CpkOrder.create({ shop_id: 1 })) as CpkOrder;
    const [, orderId] = order.id as [number, number];
    await CpkOrderAgreement.create({ order_id: orderId, signature: "abc" });
    await CpkOrderAgreement.create({ order_id: orderId, signature: "def" });
    const agreements = await order.orderAgreements;
    expect(agreements).toHaveLength(2);
    expect(agreements.map((a: Base) => (a as any).signature).sort()).toEqual(["abc", "def"]);
  });

  it("has one loads through a declared reflection with a composite foreign key", async () => {
    const order = (await CpkOrder.create({ shop_id: 1 })) as CpkOrder;
    const [shopId, orderId] = order.id as [number, number];
    await CpkBook.create({ id: [1, 90001], shop_id: shopId, order_id: orderId, title: "Only" });
    expect((await (order as any).book)?.title).toBe("Only");
  });

  it("has one loads through a declared reflection with a scalar foreign key on a composite primary key owner", async () => {
    const order = await CpkOrderWithPrimaryKeyAssociatedBook.create({ shop_id: 1 });
    const [, orderId] = order.id as [number, number];
    await CpkBook.create({ id: [1, 90002], order_id: orderId, title: "Only" });
    expect((await (order as any).book)?.title).toBe("Only");
  });

  it("has many loads via inline fallback ignoring enclosing current_scope", async () => {
    const order = (await CpkOrder.create({ shop_id: 1 })) as CpkOrder;
    const [, orderId] = order.id as [number, number];
    await CpkOrderAgreement.create({ order_id: orderId, signature: "abc" });
    await CpkOrderAgreement.create({ order_id: orderId, signature: "def" });
    await (CpkOrderAgreement as any).where("1=0").scoping(async () => {
      const agreements = await order.orderAgreements;
      expect(agreements).toHaveLength(2);
      expect(agreements.map((a: Base) => (a as any).signature).sort()).toEqual(["abc", "def"]);
    });
  });

  it("delete single composite has many through join row", async () => {
    const blogPost = shardedBlogPosts("great_post_blog_one");
    const tag = await ShardedTag.create({ name: "shared", blog_id: (blogPost as any).blog_id });
    await ShardedBlogPostTag.create({
      blog_id: (blogPost as any).blog_id,
      blog_post_id: (blogPost as any).id,
      tag_id: (tag as any).id,
    });

    const otherBlogId = (shardedBlogs("sharded_blog_two") as any).id;
    await ShardedBlogPostTag.create({
      blog_id: otherBlogId,
      blog_post_id: (blogPost as any).id,
      tag_id: (tag as any).id,
    });

    await association(blogPost, "tags").delete(tag);

    expect(
      await ShardedBlogPostTag.where({
        blog_id: (blogPost as any).blog_id,
        blog_post_id: (blogPost as any).id,
        tag_id: (tag as any).id,
      }),
    ).toHaveLength(0);
    expect(
      await ShardedBlogPostTag.where({
        blog_id: otherBlogId,
        blog_post_id: (blogPost as any).id,
        tag_id: (tag as any).id,
      }),
    ).toHaveLength(1);
    expect(await ShardedTag.where({ id: (tag as any).id })).not.toHaveLength(0);
  });

  it("loading cpk association when persisted and in memory differ", async () => {
    const order = (await CpkOrder.create({ id: [1, 2], status: "paid" })) as CpkOrder;
    await CpkBook.create({
      id: [3, 4],
      shop_id: 1,
      order_id: 2,
      title: "Book",
    });
    await CpkBook.where({ author_id: 3, id: 4 }).updateAll({ title: "A different title" });
    const books = await order.books;
    expect(books[0].id).toEqual([3, 4]);
  });
});
