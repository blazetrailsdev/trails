import { describe, it, expect, afterEach, beforeAll, beforeEach, vi } from "vitest";
import { Base, association, reflectOnAssociation, registerModel, NameError, pp } from "./index.js";
import { ArgumentError } from "@blazetrails/activemodel";
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

function expectQuotedColumnInSql(
  sql: string,
  qualifiedColumn: string,
  options: { inWhere?: boolean } = {},
): void {
  const quoted = (Base.connection as { quoteTableName(n: string): string }).quoteTableName(
    qualifiedColumn,
  );
  if (options.inWhere) {
    expect(sql).toMatch(new RegExp(`WHERE[\\s\\S]*${regexpEscape(quoted)} =`));
  } else {
    expect(sql).toContain(`${quoted} =`);
  }
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
    expect(josh.posts.loaded).toBe(true);
    expect(await josh.posts.size()).toBe(1);
  });

  it("append behaves like push", async () => {
    const josh = new Author({ name: "Josh" }) as any;
    await josh.posts.append(new Post({ title: "New on Edge", body: "More cool stuff!" }));
    expect(josh.posts.loaded).toBe(true);
    expect(await josh.posts.size()).toBe(1);
  });

  it("prepend is not defined", async () => {
    const josh = new Author({ name: "Josh" }) as any;
    expect(() => josh.posts.prepend(new Post())).toThrow(NoMethodError);
  });

  it("load does load target", async () => {
    const david = developers("david") as any;
    expect(david.projects.loaded).toBe(false);
    await david.projects.load();
    expect(david.projects.loaded).toBe(true);
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
    const proxyAssociation = david.projects.proxyAssociation;
    expect(proxyAssociation.owner).toBe(david);
    expect(proxyAssociation.reflection.name).toBe("projects");
  });

  it("scoped allows conditions", async () => {
    const david = developers("david") as any;
    const sql = david.projects.merge(Project.where("foo")).toSql();
    expect(sql).toContain("foo");
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
    const expected = await david.firstPosts.first();
    await david.firstPosts.reload();
    const sqls = await captureSql(async () => {
      const first = await david.firstPosts.firstBang();
      expect(first.id).toBe(expected!.id);
    });
    expect(sqls).toHaveLength(0);
    expect(david.firstPosts.loaded).toBe(true);
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
    expect(await member.favoriteMemberships.isEmpty()).toBe(true);
    const membership = await member.favoriteMemberships.createBang({});
    await membership.updateBang({ favorite: false });
    expect(await member.favoriteMemberships.size()).toBe(0);
    expect(await member.favoriteMemberships.size()).toBe(0);
  });

  it("push does not load target", async () => {
    const david = authors("david") as any;
    const post = new Post({ title: "New on Edge", body: "More cool stuff!" });
    await david.posts.push(post);
    expect(david.posts.loaded).toBe(false);
    expect(await david.posts.isInclude(post)).toBe(true);
  });
  it("push has many through does not load target", async () => {
    const david = authors("david") as any;
    const technology = categories("technology") as any;
    await david.categories.push(technology);
    expect(david.categories.loaded).toBe(false);
    expect(await david.categories.isInclude(technology)).toBe(true);
  });
  it("push followed by save does not load target", async () => {
    const david = authors("david") as any;
    const post = new Post({ title: "New on Edge", body: "More cool stuff!" });
    await david.posts.push(post);
    expect(david.posts.loaded).toBe(false);
    await david.save();
    expect(david.posts.loaded).toBe(false);
    expect(await david.posts.isInclude(post)).toBe(true);
  });
  it("save on parent does not load target", async () => {
    const david = developers("david") as any;
    expect(david.projects.loaded).toBe(false);
    await david.updateColumns({ salary: 80_000 });
    expect(david.projects.loaded).toBe(false);
  });
  it("inspect does not reload a not yet loaded target", async () => {
    const andreas = new Developer({ name: "Andreas" });
    (andreas as any).log = "new developer added";
    expect(andreas.auditLogs.loaded).toBe(false);
    expect(await andreas.auditLogs.inspect()).toMatch(/message: "new developer added"/);
    expect(andreas.auditLogs.loaded).toBe(true);
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
    const once = await david.projects.reload();
    const reloaded = await once.reload();
    expect(await reloaded.toArray()).toEqual(await david.projects.toArray());
    expect(david.projects.loaded).toBe(true);
  });
  it("getting a scope from an association", async () => {
    const david = developers("david") as any;
    const scope = david.projects.scope();
    const results = (await scope.toArray()).map((r: any) => r.id).sort();
    const expected = (await david.projects.toArray()).map((r: any) => r.id).sort();
    expect(results).toEqual(expected);
  });
  it("inverses get set of subsets of the association", async () => {
    const human = await Human.create({});
    await (human as any).interests.create({});
    const found = await Human.find((human as any).id);
    const subset = await (found as any).interests.where("1=1").first();
    expect(subset).not.toBeNull();
    expect(subset._associationCache("human")?.target).toBe(found);
  });
  it("pluck uses loaded target", async () => {
    const david = authors("david") as any;
    const expected = await david.firstPosts.pluck("title");
    const loaded = await david.firstPosts.load();
    expect(david.firstPosts.loaded).toBe(true);
    expect(loaded.length).toBeGreaterThan(0);
    const sqls = await captureSql(async () => {
      expect(await david.firstPosts.pluck("title")).toEqual(expected);
    });
    expect(sqls).toHaveLength(0);
  });
  it("pick uses loaded target", async () => {
    const david = authors("david") as any;
    const expected = await david.firstPosts.pick("title");
    await david.firstPosts.load();
    expect(david.firstPosts.loaded).toBe(true);
    const sqls = await captureSql(async () => {
      expect(await david.firstPosts.pick("title")).toEqual(expected);
    });
    expect(sqls).toHaveLength(0);
  });
  it("reset unloads target", async () => {
    const david = authors("david") as any;
    await david.posts.reload();
    expect(david.posts.loaded).toBe(true);
    david.posts.reset();
    expect(david.posts.loaded).toBe(false);
  });
  it("target merging ignores persisted in memory records", async () => {
    const david = authors("david") as any;
    expect(await david.thinkingPosts.isInclude(posts("thinking") as any)).toBe(true);
    await david.thinkingPosts.createBang({
      title: "Something else entirely",
      body: "Does not matter.",
    });
    expect(await david.thinkingPosts.size()).toBe(1);
    expect((await david.thinkingPosts.toArray()).length).toBe(1);
  });
  it("target merging ignores persisted in memory records when loaded records are empty", async () => {
    const member = members("blarpy_winkup") as any;
    expect(await member.favoriteMemberships.isEmpty()).toBe(true);
    const membership = await member.favoriteMemberships.createBang({});
    await membership.updateBang({ favorite: false });
    expect((await member.favoriteMemberships.toArray()).length).toBe(0);
  });
  it("target merging recognizes updated in memory records", async () => {
    const member = members("blarpy_winkup") as any;
    const membership = await member.createMembershipBang({ favorite: false });
    expect(await member.favoriteMemberships.isEmpty()).toBe(true);
    await membership.updateBang({ favorite: true });
    expect((await member.favoriteMemberships.toArray()).length).toBeGreaterThan(0);
  });
  it("load preserves in-memory instances added via push", async () => {
    const david = authors("david") as any;
    const post = await Post.create({ title: "original", body: "b" });
    await david.posts.push(post);
    post.title = "mutated";
    const loaded = await david.posts.load();
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
    const post = posts("welcome");
    await new Preloader({
      records: [post],
      associations: ["comments"],
      scope: Comment.where({ body: "Thank you for the welcome" }),
    }).call();
    const loaded = (post as any).association("comments").target as Base[];
    expect(loaded.map((c) => c.id)).toEqual([comments("greetings").id]);
  });

  it("preload makes correct number of queries on array", async () => {
    const post = posts("welcome");
    const sqls = await captureSql(async () => {
      await new Preloader({ records: [post], associations: ["comments"] }).call();
    });
    expect(sqls).toHaveLength(1);
  });

  it("preload makes correct number of queries on relation", async () => {
    const post = posts("welcome");
    const relation = Post.where({ id: post.id });
    let preloader: Preloader;
    const sqls = await captureSql(
      async () => {
        preloader = new Preloader({ records: relation, associations: "comments" });
        await preloader.call();
      },
      { includeSchema: false },
    );
    const preloaded = (relation as any)._records;
    expect(preloaded).toHaveLength(1);
    expect(preloaded[0].association("comments").isLoaded()).toBe(true);
    expect(sqls).toHaveLength(2);
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
    const post = posts("welcome");
    await Comment.create({ post_id: post.id, body: "A new comment" });
    await new Preloader({ records: [post], associations: ["comments"] }).call();
    await new Preloader({ records: [post], associations: ["comments"] }).call();
    const loaded = (post as any).association("comments").target;
    expect(loaded.length).toBe(Number(await Comment.where({ post_id: post.id }).count()));
  });

  it("preload for hmt with conditions", async () => {
    const post = posts("welcome");
    await CategoryPost.create({
      category_id: (await Category.create({ name: "Normal" })).id,
      post_id: post.id,
    });
    const specialCat = await SpecialCategory.create({ name: "Special" });
    await CategoryPost.create({ category_id: specialCat.id, post_id: post.id });
    await new Preloader({ records: [post], associations: ["hmtSpecialCategories"] }).call();
    const loaded = (post as any).association("hmtSpecialCategories").target;
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe(specialCat.id);
  });

  it("preload groups queries with same scope", async () => {
    const book = books("awdr");
    const post = posts("welcome");
    const sqls = await captureSql(async () => {
      await new Preloader({ records: [book, post], associations: ["author"] }).call();
    });
    expect(sqls).toHaveLength(1);
    const noQueriesAfter = await captureSql(async () => {
      void (book as any).association("author").target;
      void (post as any).association("author").target;
    });
    expect(noQueriesAfter).toHaveLength(0);
    expect((book as any).association("author").target.id).toBe((book as any).author_id);
    expect((post as any).association("author").target.id).toBe((post as any).author_id);
  });

  it("preload grouped queries with already loaded records", async () => {
    const author = authors("david");
    const book = books("awdr");
    const post = posts("welcome");
    const bookLoaded = (await Book.where({ id: book.id }).includes(":author"))[0];
    const postFresh = (await Post.where({ id: post.id }))[0];
    const sqls = await captureSql(async () => {
      await new Preloader({ records: [bookLoaded, postFresh], associations: ["author"] }).call();
      void (bookLoaded as any).association("author").target;
      void (postFresh as any).association("author").target;
    });
    expect(sqls).toHaveLength(0);
    expect((bookLoaded as any).association("author").target.id).toBe(author.id);
    expect((postFresh as any).association("author").target.id).toBe(author.id);
  });
  it("preload grouped queries of middle records", async () => {
    const records = [
      comments("eager_sti_on_associations_s_comment1"),
      comments("eager_sti_on_associations_s_comment2"),
    ];

    const spy = vi.spyOn(LoaderQuery.prototype, "loadRecordsInBatch");
    await new Preloader({ records, associations: ["author", "ordinaryPost"] }).call();
    expect(spy).toHaveBeenCalledTimes(2);
  });
  it("preload grouped queries of through records", async () => {
    const author = authors("david");

    const spy = vi.spyOn(LoaderQuery.prototype, "loadRecordsInBatch");
    await new Preloader({
      records: [author],
      associations: ["helloPostComments", "comments"],
    }).call();
    expect(spy).toHaveBeenCalledTimes(3);
  });
  it("preload through records with already loaded middle record", async () => {
    const member = members("groucho") as any;
    const expectedMemberDetailIds = ((await member.organizationMemberDetails_2) as Base[])
      .map((d) => Number(d.id))
      .sort();

    await member.reload();
    await member.loadHasOne("organization");

    const sqls = await captureSql(async () => {
      await new Preloader({
        records: [member],
        associations: "organizationMemberDetails_2",
      }).call();
    });
    expect(sqls).toHaveLength(1);

    const reads = await captureSql(async () => {
      const loaded = member.association("organizationMemberDetails_2").target as Base[];
      expect(loaded.map((d) => Number(d.id)).sort()).toEqual(expectedMemberDetailIds);
    });
    expect(reads).toHaveLength(0);
  });

  it("preload with instance dependent scope", async () => {
    const david = authors("david");
    const david2 = await Author.create({ name: "David" });
    const bob = authors("bob");
    const post1 = await Post.create({
      author_id: david.id,
      title: "test post",
      body: "this post is about david",
    });
    const post2 = await Post.create({
      author_id: david.id,
      title: "test post 2",
      body: "this post is also about david",
    });

    await new Preloader({
      records: [david, david2, bob],
      associations: ["postsMentioningAuthor"],
    }).call();

    const davidPosts = (david as any).association("postsMentioningAuthor").target as any[];
    const david2Posts = (david2 as any).association("postsMentioningAuthor").target as any[];
    const bobPosts = (bob as any).association("postsMentioningAuthor").target as any[];

    expect(davidPosts.map((p: any) => p.id).sort()).toEqual([post1.id, post2.id].sort());
    expect(david2Posts).toEqual([]);
    expect(bobPosts).toEqual([]);
  });
  it("preload with instance dependent through scope", async () => {
    const david = authors("david");
    const david2 = await Author.create({ name: "David" });
    const bob = authors("bob");
    const davidPost = posts("welcome");
    const comment1 = await Comment.create({ post_id: davidPost.id, body: "Hi david!" });
    const comment2 = await Comment.create({
      post_id: davidPost.id,
      body: "This comment mentions david",
    });

    await new Preloader({
      records: [david, david2, bob],
      associations: ["commentsMentioningAuthor"],
    }).call();

    const davidComments = (david as any).association("commentsMentioningAuthor").target as any[];
    const david2Comments = (david2 as any).association("commentsMentioningAuthor").target as any[];
    const bobComments = (bob as any).association("commentsMentioningAuthor").target as any[];

    expect(davidComments.map((c: any) => c.id).sort()).toEqual([comment1.id, comment2.id].sort());
    expect(david2Comments).toEqual([]);
    expect(bobComments).toEqual([]);
  });
  it("preload with through instance dependent scope", async () => {
    const david = authors("david");
    const david2 = await Author.create({ name: "David" });
    const bob = authors("bob");
    const davidPost = await Post.create({
      author_id: david.id,
      title: "test post",
      body: "this post is about david",
    });
    await Post.create({
      author_id: david.id,
      title: "test post 2",
      body: "this post is also about david",
    });
    const bobPost = await Post.create({
      author_id: bob.id,
      title: "test post 3",
      body: "this post is about bob",
    });
    const comment1 = await Comment.create({ post_id: davidPost.id, body: "hi!" });
    const comment2 = await Comment.create({ post_id: davidPost.id, body: "hello!" });
    const comment3 = await Comment.create({ post_id: bobPost.id, body: "HI BOB!" });

    await new Preloader({
      records: [david, david2, bob],
      associations: ["commentsOnPostsMentioningAuthor"],
    }).call();

    const davidComments = (david as any).association("commentsOnPostsMentioningAuthor")
      .target as any[];
    const david2Comments = (david2 as any).association("commentsOnPostsMentioningAuthor")
      .target as any[];
    const bobComments = (bob as any).association("commentsOnPostsMentioningAuthor").target as any[];

    expect(davidComments.map((c: any) => c.id).sort()).toEqual([comment1.id, comment2.id].sort());
    expect(david2Comments).toEqual([]);
    expect(bobComments.map((c: any) => c.id)).toEqual([comment3.id]);
  });

  it("some already loaded associations", async () => {
    const itemDiscount = await Discount.create({ amount: 5 });
    const shippingDiscount = await Discount.create({ amount: 20 });
    const invoice = await Invoice.create({});
    const lineItem = await LineItem.create({ amount: 20, invoice_id: invoice.id });
    await LineItemDiscountApplication.create({
      line_item_id: lineItem.id,
      discount_id: itemDiscount.id,
    });
    const shippingLine = await ShippingLine.create({ amount: 50, invoice_id: invoice.id });
    await ShippingLineDiscountApplication.create({
      shipping_line_id: shippingLine.id,
      discount_id: shippingDiscount.id,
    });

    const nested = [
      { lineItems: { discountApplications: "discount" } },
      { shippingLines: { discountApplications: "discount" } },
    ];
    const readDiscounts = (inv: Base) => {
      const li = (inv as any).association("lineItems").target[0];
      const sl = (inv as any).association("shippingLines").target[0];
      expect(li.association("discountApplications").target[0].discount).not.toBeNull();
      expect(sl.association("discountApplications").target[0].discount).not.toBeNull();
    };

    const fresh = (await Invoice.where({ id: invoice.id }))[0];
    const firstSqls = await captureSql(async () => {
      await new Preloader({ records: [fresh], associations: nested }).call();
    });
    expect(firstSqls).toHaveLength(5);
    const firstReads = await captureSql(async () => readDiscounts(fresh));
    expect(firstReads).toHaveLength(0);

    const reloaded = (await Invoice.where({ id: invoice.id }))[0];
    const lineItems = await (reloaded as any).lineItems;
    for (const li of lineItems) await li.discountApplications;
    const secondSqls = await captureSql(async () => {
      await new Preloader({ records: [reloaded], associations: nested }).call();
    });
    expect(secondSqls).toHaveLength(3);
    const secondReads = await captureSql(async () => readDiscounts(reloaded));
    expect(secondReads).toHaveLength(0);
  });

  it("preload through", async () => {
    const records = [
      comments("eager_sti_on_associations_s_comment1"),
      comments("eager_sti_on_associations_s_comment2"),
    ];

    const spy = vi.spyOn(LoaderQuery.prototype, "loadRecordsInBatch");
    await new Preloader({ records, associations: ["author", "post"] }).call();
    expect(spy).toHaveBeenCalledTimes(2);

    const reads = await captureSql(async () => {
      for (const comment of records) void (comment as any).association("author").target;
    });
    expect(reads).toHaveLength(0);
  });

  it("preload groups queries with same scope at second level", async () => {
    const a = await Author.create({ name: "David" });
    const tp = await Post.create({ title: "So I was thinking", body: "body", author_id: a.id });
    const wp = await Post.create({ title: "Welcome to the weblog", body: "body", author_id: a.id });
    await Comment.create({ body: "c1", post_id: tp.id });
    await Comment.create({ body: "c2", post_id: wp.id });
    const spy = vi.spyOn(LoaderQuery.prototype, "loadRecordsInBatch");
    await new Preloader({
      records: [a],
      associations: [{ thinkingPosts: "comments" }, { welcomePosts: "comments" }],
    }).call();
    expect(spy).toHaveBeenCalledTimes(3);
  });
  it("preload groups queries with same sql at second level", async () => {
    const a = await Author.create({ name: "David" });
    const tp = await Post.create({ title: "So I was thinking", body: "body", author_id: a.id });
    const wp = await Post.create({ title: "Welcome to the weblog", body: "body", author_id: a.id });
    await Comment.create({ body: "c1", post_id: tp.id });
    await Comment.create({ body: "c2", post_id: wp.id });
    const spy = vi.spyOn(LoaderQuery.prototype, "loadRecordsInBatch");
    await new Preloader({
      records: [a],
      associations: [{ thinkingPosts: "comments" }, { welcomePosts: "commentsWithExtending" }],
    }).call();
    expect(spy).toHaveBeenCalledTimes(3);
  });
  it("preload with grouping sets inverse association", async () => {
    const mary = authors("mary");
    const bob = authors("bob");
    await AuthorFavorite.create({ author_id: mary.id, favorite_author_id: bob.id });
    const favorites = await AuthorFavorite.all();
    const spy = vi.spyOn(LoaderQuery.prototype, "loadRecordsInBatch");
    await new Preloader({
      records: favorites,
      associations: ["author", "favoriteAuthor"],
    }).call();
    expect(spy).toHaveBeenCalledTimes(1);
    const fav = favorites[0] as any;
    expect(fav.association("author").target.name).toBe("Mary");
    expect(fav.association("favoriteAuthor").target.name).toBe("Bob");
    spy.mockClear();
    const reloadedAuthor = await fav.author;
    const reloadedFavorite = await fav.favoriteAuthor;
    expect(reloadedAuthor.name).toBe("Mary");
    expect(reloadedFavorite.name).toBe("Bob");
    expect(spy).not.toHaveBeenCalled();
  });
  it("preload can group separate levels", async () => {
    const mary = authors("mary");
    const bob = authors("bob");
    await AuthorFavorite.create({ author_id: mary.id, favorite_author_id: bob.id });
    const spy = vi.spyOn(LoaderQuery.prototype, "loadRecordsInBatch");
    await new Preloader({
      records: [mary],
      associations: ["posts", { favoriteAuthors: "posts" }],
    }).call();
    expect(spy).toHaveBeenCalledTimes(3);
  });
  it("preload can group multi level ping pong through", async () => {
    const mary = authors("mary");
    const bob = authors("bob");
    await AuthorFavorite.create({ author_id: mary.id, favorite_author_id: bob.id });

    const associations = [
      { similarPosts: "comments" },
      { favoriteAuthors: { similarPosts: "comments" } },
    ];

    const spy = vi.spyOn(LoaderQuery.prototype, "loadRecordsInBatch");
    await new Preloader({ records: [mary], associations }).call();
    const preloadCalls = spy.mock.calls.length;
    expect(preloadCalls).toBe(9);

    const marySimilar = (mary as any).association("similarPosts").target as Base[];
    expect(marySimilar.length).toBeGreaterThan(0);
    for (const post of marySimilar) void (post as any).association("comments").target;
    const maryFavs = (mary as any).association("favoriteAuthors").target as Base[];
    expect(maryFavs.map((a) => a.id)).toEqual([bob.id]);
    const bobSimilar = (maryFavs[0] as any).association("similarPosts").target as Base[];
    for (const post of bobSimilar) void (post as any).association("comments").target;
    expect(spy.mock.calls.length).toBe(preloadCalls);
  });
  it("preload does not group same class different scope", async () => {
    const post = posts("welcome");
    const postesque = await PostesquePL.create({ author_name: (authors("david") as any).name });

    let spy = vi.spyOn(LoaderQuery.prototype, "loadRecordsInBatch");
    await new Preloader({
      records: [post, postesque],
      associations: ["authorWithTheLetterA"],
    }).call();
    expect(spy).toHaveBeenCalledTimes(2);

    (post as any)._resetAssociationCaches();
    (postesque as any)._resetAssociationCaches();

    spy = vi.spyOn(LoaderQuery.prototype, "loadRecordsInBatch");
    await new Preloader({
      records: [post, postesque],
      associations: ["authorWithAddress"],
    }).call();
    expect(spy).toHaveBeenCalledTimes(3);
  });
  it("preload does not group same scope different key name", async () => {
    const post = posts("welcome");
    const postesque = await PostesquePL.create({ author_name: (authors("david") as any).name });
    const spy = vi.spyOn(LoaderQuery.prototype, "loadRecordsInBatch");
    await new Preloader({
      records: [post, postesque],
      associations: ["author"],
    }).call();
    expect(spy).toHaveBeenCalledTimes(2);
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
    const post = posts("welcome");
    const david = authors("david");

    const sqls = await captureSql(async () => {
      await new Preloader({
        records: [post],
        associations: "author",
        availableRecords: [[david]],
      }).call();
      expect(post.association("author").isLoaded()).toBe(true);
      expect(post.association("author").target).toBe(david);
    });
    expect(sqls).toHaveLength(0);
  });

  it("preload with available records sti", async () => {
    const book = await (Book as any).create({});
    const essaySpecial = await (EssaySpecial as any).create({ book_id: book.id });

    expect(book.association("essay").isLoaded()).toBe(false);

    const sqls = await captureSql(async () => {
      await new Preloader({
        records: [book],
        associations: "essay",
        availableRecords: [[essaySpecial]],
      }).call();
    });
    expect(sqls).toHaveLength(0);

    expect(book.association("essay").isLoaded()).toBe(true);
    expect(book.association("essay").target).toBe(essaySpecial);
  });

  it("preload with only some records available", async () => {
    const bobPost = posts("misc_by_bob");
    const maryPost = posts("misc_by_mary");
    const bob = authors("bob");
    const mary = authors("mary");

    const sqls = await captureSql(async () => {
      await new Preloader({
        records: [bobPost, maryPost],
        associations: "author",
        availableRecords: [bob],
      }).call();
    });
    expect(sqls).toHaveLength(1);

    const reads = await captureSql(async () => {
      expect(bobPost.association("author").target).toBe(bob);
      expect((maryPost.association("author").target as any).id).toBe(mary.id);
    });
    expect(reads).toHaveLength(0);
  });

  it("preload with some records already loaded", async () => {
    const bobPost = posts("misc_by_bob");
    const maryPost = posts("misc_by_mary");
    const mary = authors("mary");

    const loadedBob = (await bobPost.author) as Author;
    expect(bobPost.association("author").isLoaded()).toBe(true);
    expect(maryPost.association("author").isLoaded()).toBe(false);

    const sqls = await captureSql(async () => {
      await new Preloader({ records: [bobPost, maryPost], associations: "author" }).call();
    });
    expect(sqls).toHaveLength(1);

    const reads = await captureSql(async () => {
      expect(bobPost.association("author").target).toBe(loadedBob);
      expect((maryPost.association("author").target as any).id).toBe(mary.id);
    });
    expect(reads).toHaveLength(0);
  });

  it("preload with available records with through association", async () => {
    const author = authors("david");
    const allCategories = await Category.all();

    const spy = vi.spyOn(LoaderQuery.prototype, "loadRecordsForKeys");
    await new Preloader({
      records: [author],
      associations: "essayCategory",
      availableRecords: allCategories,
    }).call();
    const queryCalls = spy.mock.calls.filter((c) => c[0].length > 0);
    expect(queryCalls).toHaveLength(1);
    expect((author as any).association("essayCategory").isLoaded()).toBe(true);
    const preloaded = (author as any).association("essayCategory").target;
    expect(allCategories).toContain(preloaded);
  });

  it("preload with only some records available with through associations", async () => {
    const mary = authors("mary");
    const maryEssay = essays("mary_stay_home");
    const tech = categories("technology");
    await (maryEssay as any).update({ category_id: (tech as any).name });

    const dave = authors("david");
    const general = categories("general");

    const spy = vi.spyOn(LoaderQuery.prototype, "loadRecordsForKeys");
    await new Preloader({
      records: [mary, dave],
      associations: "essayCategory",
      availableRecords: [tech],
    }).call();
    const queryCalls = spy.mock.calls.filter((c) => c[0].length > 0);
    expect(queryCalls).toHaveLength(2);
    const reads = await captureSql(async () => {
      expect((mary as any).association("essayCategory").reader).toBe(tech);
      expect((dave as any).association("essayCategory").reader.id).toBe(general.id);
    });
    expect(reads).toHaveLength(0);
  });

  it("preload with available records with multiple classes", async () => {
    const essay = essays("david_modest_proposal") as any;
    const general = categories("general");
    const david = authors("david");

    const sqls = await captureSql(async () => {
      await new Preloader({
        records: [essay],
        associations: ["category", "author"],
        availableRecords: [general, david],
      }).call();
      expect(essay.association("category").isLoaded()).toBe(true);
      expect(essay.association("author").isLoaded()).toBe(true);
      expect(essay.association("category").target).toBe(general);
      expect(essay.association("author").target).toBe(david);
    });
    expect(sqls).toHaveLength(0);
  });

  it("preload with available records queries when scoped", async () => {
    const post = posts("welcome") as any;
    const david = authors("david");

    const spy = vi.spyOn(LoaderQuery.prototype, "loadRecordsForKeys");
    await new Preloader({
      records: [post],
      associations: "author",
      scope: Author.where({ name: "David" }) as any,
      availableRecords: [david],
    }).call();
    const queryCalls = spy.mock.calls.filter((c) => c[0].length > 0);
    expect(queryCalls).toHaveLength(1);
    expect(post.association("author").isLoaded()).toBe(true);
    expect(post.association("author").target).not.toBe(david);
  });

  it("preload with available records queries when collection", async () => {
    const post = posts("welcome") as any;
    const allComments = await Comment.all();

    const spy = vi.spyOn(LoaderQuery.prototype, "loadRecordsForKeys");
    await new Preloader({
      records: [post],
      associations: "comments",
      availableRecords: allComments,
    }).call();
    const queryCalls = spy.mock.calls.filter((c) => c[0].length > 0);
    expect(queryCalls).toHaveLength(1);
    expect(post.association("comments").isLoaded()).toBe(true);
    const loaded = post.association("comments").target as Base[];
    expect(loaded.some((lc) => allComments.includes(lc))).toBe(false);
    expect(loaded.map((lc) => lc.id).sort()).toEqual(
      [comments("greetings").id, comments("more_greetings").id].sort(),
    );
  });

  it("preload with available records queries when incomplete", async () => {
    const post = posts("welcome") as any;
    const bob = authors("bob");
    const david = authors("david");

    const spy = vi.spyOn(LoaderQuery.prototype, "loadRecordsForKeys");
    await new Preloader({
      records: [post],
      associations: "author",
      availableRecords: [bob],
    }).call();
    const queryCalls = spy.mock.calls.filter((c) => c[0].length > 0);
    expect(queryCalls).toHaveLength(1);
    const preloaded = post.association("author").target;
    expect(preloaded?.id).toBe(david.id);
  });

  it("preload with unpersisted records no ops", async () => {
    const author = new Author({});
    const newPostWithAuthor = new Post({ author });
    const newPostWithoutAuthor = new Post({});
    const posts = [newPostWithAuthor, newPostWithoutAuthor];
    const sqls = await captureSql(async () => {
      await new Preloader({ records: posts, associations: ["author"] }).call();
      expect(newPostWithAuthor.association("author").target).toBe(author);
      expect(newPostWithoutAuthor.association("author").target).toBeNull();
    });
    expect(sqls).toHaveLength(0);
  });

  it("preload wont set the wrong target", async () => {
    const post = posts("welcome") as any;
    await post.update({ author_id: 54321 });
    const general = categories("general") as any;
    await general.update({ id: 54321 });

    expect(() => general.association("author")).toThrow();

    await new Preloader({
      records: [post],
      associations: "author",
      availableRecords: [[general]],
    }).call();
    expect(post.association("author").isLoaded()).toBe(true);
    expect(post.association("author").target).not.toBe(general);
  });

  it("preload has many association with composite foreign key", async () => {
    const blogPost = shardedBlogPosts("great_post_blog_one");
    const blogPosts = [blogPost, shardedBlogPosts("great_post_blog_two")];

    await new Preloader({ records: blogPosts, associations: ["comments"] }).call();

    expect((blogPost as any).association("comments").isLoaded()).toBe(true);
    const preloaded = (blogPost as any).association("comments").target as Base[];
    expect(preloaded.map((c) => c.id)).toContain(shardedComments("great_comment_blog_post_one").id);
  });

  it("preload belongs to association with composite foreign key", async () => {
    const comment = shardedComments("great_comment_blog_post_one");
    const comments = [comment, shardedComments("great_comment_blog_post_two")];

    await new Preloader({ records: comments, associations: "blogPost" }).call();

    expect((comment as any).association("blogPost").isLoaded()).toBe(true);
    expect((comment as any).association("blogPost").target.id).toBe(
      shardedBlogPosts("great_post_blog_one").id,
    );
  });

  it("preload loaded belongs to association with composite foreign key", async () => {
    const comment = shardedComments("great_comment_blog_post_one");

    await comment.blogPost;

    const sqls = await captureSql(async () => {
      await new Preloader({ records: [comment], associations: ["blogPost"] }).call();
    });
    expect(sqls).toHaveLength(0);
  });

  it("preload has many through association with composite query constraints", async () => {
    const tag = shardedTags("short_read_blog_one");
    const tags = [tag, shardedTags("breaking_news_blog_2")];

    await new Preloader({ records: tags, associations: "blogPosts" }).call();

    expect(tags.every((t) => (t as any).association("blogPosts").isLoaded())).toBe(true);

    const expectedBlogPostIds = await ShardedBlogPostTagPL.where(
      "blog_id = ? AND tag_id = ?",
      (tag as any).blog_id,
      tag.id,
    )
      .toArray()
      .then((rows) => rows.map((r) => Number((r as any).blog_post_id)).sort());
    expect(expectedBlogPostIds).not.toHaveLength(0);
    const preloaded = (tag as any).association("blogPosts").target;
    expect(preloaded.map((p: any) => Number(p.id)).sort()).toEqual(expectedBlogPostIds);
  });

  it("preloads has many on model with a composite primary key through id attribute", async () => {
    const order = cpkOrders("cpk_groceries_order_2");
    const [, orderId] = order.id as [number, number];
    const orderAgreements = await CpkOrderAgreementPL.where({ order_id: orderId });
    expect(orderAgreements).not.toHaveLength(0);

    let orders: any[];
    const sqls = await captureSql(async () => {
      orders = await CpkOrderPL.where("id = ?", orderId).includes(":orderAgreements");
    });
    expect(sqls).toHaveLength(2);
    const preloadSql = sqls[1];
    expectQuotedColumnInSql(preloadSql, "cpk_order_agreements.order_id", { inWhere: true });
    expect(orders![0].association("orderAgreements").isLoaded()).toBe(true);
    const loaded = orders![0].association("orderAgreements").target;
    expect(loaded.map((a: any) => a.id).sort()).toEqual(orderAgreements.map((a) => a.id).sort());
  });

  it("preloads belongs to a composite primary key model through id attribute", async () => {
    const ag = cpkOrderAgreements("order_agreement_three");
    const order = cpkOrders("cpk_groceries_order_2");
    const [, orderId] = order.id as [number, number];

    let agreements: any[];
    const sqls = await captureSql(async () => {
      agreements = await CpkOrderAgreementPL.where("id = ?", ag.id).includes(":order");
    });
    expect(sqls).toHaveLength(2);
    const preloadSql = sqls[1];
    expectQuotedColumnInSql(preloadSql, "cpk_orders.id", { inWhere: true });
    expect(agreements![0].association("order").isLoaded()).toBe(true);
    const loadedOrder = agreements![0].association("order").target;
    expect(loadedOrder).not.toBeNull();
    expect((loadedOrder.id as [number, number])[1]).toBe(orderId);
  });

  it("preload keeps built has many records no ops", async () => {
    const post = new (Post as any)();
    const comment = post.association("comments").build({ body: "built" });

    const sqls = await captureSql(async () => {
      await new Preloader({ records: [post], associations: ["comments"] }).call();
      expect(post.association("comments").target).toContain(comment);
    });
    expect(sqls).toHaveLength(0);
  });

  it("preload keeps built has many records after query", async () => {
    const post = posts("welcome");
    const comment = (post as any).association("comments").build({ body: "built" });

    const sqls = await captureSql(async () => {
      await new Preloader({ records: [post], associations: ["comments"] }).call();
      expect((post as any).association("comments").target).toContain(comment);
    });
    expect(sqls).toHaveLength(1);
  });

  it("preload keeps built belongs to records no ops", async () => {
    const post = new (Post as any)();
    const author = post.association("author").build({ name: "Built" });

    const sqls = await captureSql(async () => {
      await new Preloader({ records: [post], associations: ["author"] }).call();
      expect(post.association("author").target).toBe(author);
    });
    expect(sqls).toHaveLength(0);
  });

  it("preload keeps built belongs to records after query", async () => {
    const post = posts("welcome");
    const author = (post as any).association("author").build({ name: "Built" });

    const sqls = await captureSql(async () => {
      await new Preloader({ records: [post], associations: ["author"] }).call();
      expect((post as any).association("author").target).toBe(author);
    });
    expect(sqls).toHaveLength(0);
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
    expect((PeopleList as any).beforeAddForHasAndBelongsToMany).toHaveLength(1);
    expect((DifferentPeopleList as any).beforeAddForHasAndBelongsToMany).toEqual([]);
  });

  it("has many association redefinition callbacks should differ and not inherited", () => {
    expect((PeopleList as any).beforeAddForHasMany).toHaveLength(1);
    expect((DifferentPeopleList as any).beforeAddForHasMany).toEqual([]);
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
    class OaArgTest extends Base {
      static {
        this.hasMany("items");
      }
    }
    expect(reflectOnAssociation(OaArgTest, "items")).not.toBeNull();
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
    expect((await computer.loadBelongsTo("developer"))?.id).toBe(developer.id);
    expect((await computer.loadBelongsTo("developer"))?.id).toBe(developer.id);
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
    const pirate = await SpacePirateAnnotated.find(pirates("blackbeard").id);
    const plain = await captureSql(() => (pirate as any).loadBelongsTo("parrot"));
    expect(plain.length).toBeGreaterThan(0);
    expect(plain.every((s) => !s.includes("/*"))).toBe(true);
    const sqls = await captureSql(() => (pirate as any).loadBelongsTo("parrotWithAnnotation"));
    expect(sqls.some((s) => s.includes("that tells jokes"))).toBe(true);
  });

  it("has and belongs to many with annotation includes a query comment", async () => {
    const pirate = await SpacePirateAnnotated.find(pirates("blackbeard").id);
    const plain = await captureSql(async () => {
      await (pirate as any).parrots.first();
    });
    expect(plain.length).toBeGreaterThan(0);
    expect(plain.every((s) => !s.includes("/*"))).toBe(true);
    const sqls = await captureSql(async () => {
      await (pirate as any).parrotsWithAnnotation.first();
    });
    expect(sqls.some((s) => s.includes("that are very colorful"))).toBe(true);
  });

  it("has one with annotation includes a query comment", async () => {
    const pirate = await SpacePirateAnnotated.find(pirates("blackbeard").id);
    const plain = await captureSql(() => (pirate as any).loadHasOne("ship"));
    expect(plain.length).toBeGreaterThan(0);
    expect(plain.every((s) => !s.includes("/*"))).toBe(true);
    const sqls = await captureSql(() => (pirate as any).loadHasOne("shipWithAnnotation"));
    expect(sqls.some((s) => s.includes("that is a rocket"))).toBe(true);
  });

  it("has many with annotation includes a query comment", async () => {
    const pirate = await SpacePirateAnnotated.find(pirates("blackbeard").id);
    const plain = await captureSql(async () => {
      await (pirate as any).birds.first();
    });
    expect(plain.length).toBeGreaterThan(0);
    expect(plain.every((s) => !s.includes("/*"))).toBe(true);
    const sqls = await captureSql(async () => {
      await (pirate as any).birdsWithAnnotation.first();
    });
    expect(sqls.some((s) => s.includes("that are also parrots"))).toBe(true);
  });

  it("has many through with annotation includes a query comment", async () => {
    const pirate = await SpacePirateAnnotated.find(pirates("redbeard").id);
    const plain = await captureSql(async () => {
      await (pirate as any).treasureEstimates.first();
    });
    expect(plain.length).toBeGreaterThan(0);
    expect(plain.every((s) => !s.includes("/*"))).toBe(true);
    const sqls = await captureSql(async () => {
      await (pirate as any).treasureEstimatesWithAnnotation.first();
    });
    expect(sqls.some((s) => s.includes("yarrr"))).toBe(true);
  });

  it("has many through with annotation includes a query comment when eager loading", async () => {
    const plain = await captureSql(async () => {
      await SpacePirateAnnotated.includes(":treasureEstimates").first();
    });
    expect(plain.length).toBeGreaterThan(0);
    expect(plain.every((s) => !s.includes("/*"))).toBe(true);
    const sqls = await captureSql(async () => {
      await SpacePirateAnnotated.includes(":treasureEstimatesWithAnnotation").first();
    });
    expect(sqls.some((s) => s.includes("yarrr"))).toBe(true);
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
    const author = authors("david");
    const favs = await association(author, "authorFavorites");
    const fav2 = await association(author, "authorFavorites").where({
      author: Author.where({ id: author.id }),
    });
    expect(fav2.length).toEqual(favs.length);
    fav2.forEach((f: any, i: number) => {
      expect(f.equals(favs[i])).toBe(true);
    });
  });

  it("loading the association target should keep child records marked for destruction", async () => {
    const ship = await Ship.create({ name: "The good ship Dollypop" });
    const part = await (ship as any).parts.create({ name: "Mast" });
    part.markForDestruction();
    const parts = await (ship as any).parts.toArray();
    expect(parts[0].markedForDestruction()).toBe(true);
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
    let raised: unknown;
    try {
      await Account.all().order("id").includes(":firm").first();
      await Account.all().order({ id: "asc" }).includes(":firm").first();
    } catch (e) {
      raised = e;
    }
    expect(raised).toBeUndefined();
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
      reflectOnAssociation(Tagging, "tag"),
      reflectOnAssociation(Tagging, "superTag"),
    ];
    const hasManyReflections = [
      reflectOnAssociation(Tag, "taggings"),
      reflectOnAssociation(Developer, "projects"),
    ];
    const mixedReflections = [...belongsToReflections, ...hasManyReflections];
    expect(usingLimitableReflections(belongsToReflections)).toBe(true);
    expect(usingLimitableReflections(hasManyReflections)).toBe(false);
    expect(usingLimitableReflections(mixedReflections)).toBe(false);
  });

  it("association with references", async () => {
    const firm = companies("first_firm");
    const scope = association(firm, "associationWithReferences").scope();
    expect(scope.referencesValues).toEqual([":foo"]);
  });

  it("force reload", async () => {
    const firm = new Firm({ name: "A New Firm, Inc" });
    await firm.save();
    for (const _ of await firm.clients) {
      void _;
    }
    expect(await firm.clients.isEmpty()).toBe(true);
    expect(await firm.clients.size()).toBe(0);

    const client = new Client({ name: "TheClient.com", firm_id: firm.id });
    await client.save();

    expect(await firm.clients.isEmpty()).toBe(true);
    expect(await firm.clients.size()).toBe(0);

    await firm.clients.reload();

    expect(await firm.clients.isEmpty()).toBe(false);
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
    const comment = shardedComments("great_comment_blog_post_one");
    const blogPost = shardedBlogPosts("great_post_blog_one");

    const loaded = await (comment as any).loadBelongsTo("blogPost");
    expect(loaded.id).toBe((blogPost as any).id);
    expect(loaded.blog_id).toBe((blogPost as any).blog_id);
  });

  it("belongs to a model with composite primary key uses composite pk in sql", async () => {
    const comment = shardedComments("great_comment_blog_post_one");

    const sqls = await captureSql(async () => {
      await (comment as any).loadBelongsTo("blogPost");
    });
    const sql = sqls.find((s) => /sharded_blog_posts/.test(s))!;

    expectQuotedColumnInSql(sql, "sharded_blog_posts.blog_id");
    expectQuotedColumnInSql(sql, "sharded_blog_posts.id");
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
    const expectedComments = await ShardedComment.where({
      blog_id: blogPost.blog_id,
      blog_post_id: blogPost.id,
    });

    let comments: any[] = [];
    const sqls = await captureSql(async () => {
      comments = await blogPost.comments;
    });
    const sql = sqls.find((s) => /sharded_comments/.test(s))!;

    expectQuotedColumnInSql(sql, "sharded_comments.blog_id", { inWhere: true });
    expect(comments).not.toHaveLength(0);
    expect(comments.map((c: any) => Number(c.id)).sort((a: number, b: number) => a - b)).toEqual(
      expectedComments.map((c: any) => Number(c.id)).sort((a: number, b: number) => a - b),
    );
  });

  it("query constraints over three without defining explicit foreign key query constraints raises", async () => {
    let blogPost: any = shardedBlogPosts("great_post_blog_one");
    blogPost = await ShardedBlogPostWithRevision.find(blogPost.id);

    const proxy = blogPost.commentsWithoutQueryConstraints;
    await expect(proxy.toArray()).rejects.toThrow(
      /has more than 2 attributes\. Active Record is unable to derive the query constraints for the association\. You need to explicitly define the query constraints for this association\./,
    );
  });

  it("model with composite query constraints has many association sql", async () => {
    const blogPost = shardedBlogPosts("great_post_blog_one");

    const sqls = await captureSql(async () => {
      await (blogPost as any).comments;
    });
    const sql = sqls.find((s) => /sharded_comments/.test(s))!;

    expectQuotedColumnInSql(sql, "sharded_comments.blog_post_id");
    expectQuotedColumnInSql(sql, "sharded_comments.blog_id");
  });

  it("preloads model with query constraints by explicitly configured fk and pk", async () => {
    const comment = shardedComments("great_comment_blog_post_one");
    const comments = await ShardedComment.where({ id: (comment as any).id }).preload(
      ":blogPostById",
    );
    const loaded = comments[0];
    const preloaded = (loaded as any).association("blogPostById").target;
    expect(preloaded).toBeDefined();
    const byCompositeKey = await (loaded as any).loadBelongsTo("blogPost");
    expect(preloaded.id).toBe(byCompositeKey.id);
  });

  it("append composite foreign key has many association with autosave", async () => {
    const blogPost = shardedBlogPosts("great_post_blog_one");
    const comment = new ShardedComment({ body: "Great post! :clap:" });
    await association(blogPost, "comments").push(comment);

    expect(comment.isPersisted()).toBe(true);
    const comments = await association(blogPost, "comments");
    expect(comments.map((c: any) => c.id)).toContain((comment as any).id);
    expect(Number((comment as any).blog_post_id)).toBe(Number((blogPost as any).id));
    expect((comment as any).blog_id).toBe((blogPost as any).blog_id);
  });

  it("append composite has many through association", async () => {
    const blogPost = shardedBlogPosts("great_post_blog_one");
    const tag = new ShardedTag({
      name: "Ruby on Rails",
      blog_id: (blogPost as any).blog_id,
    });
    await tag.save();

    const otherBlogId = (shardedBlogs("sharded_blog_two") as any).id;
    const noiseTag = await ShardedTag.create({ name: "Other Blog Tag", blog_id: otherBlogId });
    await ShardedBlogPostTag.create({
      blog_id: otherBlogId,
      blog_post_id: (blogPost as any).id,
      tag_id: (noiseTag as any).id,
    });

    await association(blogPost, "tags").push(tag);

    await blogPost.reload();
    const reloadedTags = await association(blogPost, "tags");
    expect(reloadedTags.map((t: any) => t.id)).toContain((tag as any).id);
    expect(reloadedTags.map((t: any) => t.id)).not.toContain((noiseTag as any).id);
    const join = await ShardedBlogPostTag.where({
      blog_post_id: (blogPost as any).id,
      blog_id: (blogPost as any).blog_id,
      tag_id: (tag as any).id,
    });
    expect(join).toHaveLength(1);
  });

  it("append composite has many through association with autosave", async () => {
    const blogPost = shardedBlogPosts("great_post_blog_one");
    const tag = new ShardedTag({
      name: "Ruby on Rails",
      blog_id: (blogPost as any).blog_id,
    });
    expect(tag.isNewRecord()).toBe(true);

    await association(blogPost, "tags").push(tag);

    expect(tag.isPersisted()).toBe(true);
    await blogPost.reload();
    const reloadedTags = await association(blogPost, "tags");
    expect(reloadedTags.map((t: any) => t.id)).toContain((tag as any).id);
    const join = await ShardedBlogPostTag.where({
      blog_post_id: (blogPost as any).id,
      blog_id: (blogPost as any).blog_id,
      tag_id: (tag as any).id,
    });
    expect(join).toHaveLength(1);
  });

  it("nullify composite foreign key has many association", async () => {
    const blogPost = shardedBlogPosts("great_post_blog_one");
    let comment = shardedComments("great_comment_blog_post_one");

    expect(await association(blogPost, "comments")).not.toHaveLength(0);
    await association(blogPost, "comments").replace([]);

    comment = (await ShardedComment.find((comment as any).id)) as never;
    expect((comment as any).blog_post_id).toBeNull();
    expect((comment as any).blog_id).toBeNull();

    expect(await association(blogPost, "comments")).toHaveLength(0);
    await blogPost.reload();
    expect(await association(blogPost, "comments")).toHaveLength(0);
  });

  it("assign persisted composite foreign key belongs to association", async () => {
    const comment = shardedComments("great_comment_blog_post_one");
    const anotherBlog = shardedBlogs("sharded_blog_two");
    expect((comment as any).blog_id).not.toBe((anotherBlog as any).id);

    const blogPost = new ShardedBlogPost({ title: "New post", blog_id: (anotherBlog as any).id });
    await blogPost.save();
    (comment.association("blogPost") as any).writer(blogPost);

    const loaded = await (comment as any).loadBelongsTo("blogPost");
    expect(loaded.id).toBe((blogPost as any).id);
    expect((comment as any).blog_id).toBe((blogPost as any).blog_id);
    expect(Number((comment as any).blog_id)).toBe(Number((anotherBlog as any).id));
    expect(Number((comment as any).blog_post_id)).toBe(Number((blogPost as any).id));
  });

  it("nullify composite foreign key belongs to association", async () => {
    const comment = shardedComments("great_comment_blog_post_one");
    expect(await (comment as any).loadBelongsTo("blogPost")).not.toBeNull();

    (comment.association("blogPost") as any).writer(null);
    expect((comment as any).blog_id).toBeNull();
    expect((comment as any).blog_post_id).toBeNull();

    await comment.save();
    expect(await (comment as any).loadBelongsTo("blogPost")).toBeNull();
    const reloaded = await ShardedComment.find((comment as any).id);
    expect(await (reloaded as any).loadBelongsTo("blogPost")).toBeNull();
  });

  it("assign composite foreign key belongs to association", async () => {
    const comment = shardedComments("great_comment_blog_post_one");
    const anotherBlog = shardedBlogs("sharded_blog_two");
    expect((comment as any).blog_id).not.toBe((anotherBlog as any).id);

    const blogPost = new ShardedBlogPost({ title: "New post", blog_id: (anotherBlog as any).id });
    (comment.association("blogPost") as any).writer(blogPost);

    const loaded = (comment.association("blogPost") as any).target;
    expect(loaded).toBe(blogPost);
    expect((comment as any).blog_id).toBe((blogPost as any).blog_id);
    expect(Number((comment as any).blog_id)).toBe(Number((anotherBlog as any).id));
  });

  it("assign composite foreign key belongs to association with autosave", async () => {
    const comment = shardedComments("great_comment_blog_post_one");
    const anotherBlog = shardedBlogs("sharded_blog_two");
    expect((comment as any).blog_id).not.toBe((anotherBlog as any).id);

    const blogPost = new ShardedBlogPost({ title: "New post", blog_id: (anotherBlog as any).id });
    (comment.association("blogPost") as any).writer(blogPost);
    await comment.save();

    expect(blogPost.isPersisted()).toBe(true);
    const loaded = await (comment as any).loadBelongsTo("blogPost");
    expect(loaded.id).toBe((blogPost as any).id);
    expect((comment as any).blog_id).toBe((blogPost as any).blog_id);
    expect(Number((comment as any).blog_id)).toBe(Number((anotherBlog as any).id));
    expect(Number((comment as any).blog_post_id)).toBe(Number((blogPost as any).id));
  });

  it("belongs to association does not use parent query constraints if not configured to", async () => {
    const comment = shardedComments("great_comment_blog_post_one");
    const blogPost = new ShardedBlogPost({
      blog_id: (comment as any).blog_id,
      title: "Following best practices",
    });

    (comment.association("blogPostById") as any).writer(blogPost);
    await comment.save();

    expect(blogPost.isPersisted()).toBe(true);
    const loaded = await (comment as any).loadBelongsTo("blogPostById");
    expect(loaded.id).toBe((blogPost as any).id);
  });

  it("polymorphic belongs to uses parent query constraints", async () => {
    const parentPost = shardedBlogPosts("great_post_blog_one");
    const childPost = new ShardedBlogPost({
      title: "Child post",
      blog_id: (parentPost as any).blog_id,
    });
    (childPost.association("parent") as any).writer(parentPost);
    await childPost.save();

    const reloaded = await ShardedBlogPost.find((childPost as any).id);
    const loaded = await (reloaded as any).loadBelongsTo("parent");
    expect(loaded.id).toBe((parentPost as any).id);
  });

  it("belongs to a cpk model by id attribute", async () => {
    const order = cpkOrders("cpk_groceries_order_1");
    const orderId = (order as any).id[1];
    const agreement = await CpkOrderAgreement.create({ order_id: orderId, signature: "signed" });

    const loaded = await (agreement as any).loadBelongsTo("order");
    expect(loaded.id).toEqual((order as any).id);
  });

  it("belongs to with explicit composite foreign key", async () => {
    const car = await CpkCar.create({ make: "Tesla", model: "Model S" });
    const review = await CpkCarReview.create({ car, comment: "Great car!", rating: 5 });

    await review.reload();

    let loaded: any;
    const sqls = await captureSql(async () => {
      loaded = await (review as any).loadBelongsTo("car");
    });
    expect(loaded.id).toEqual((car as any).id);

    const sql = sqls.find((s) => /cpk_cars/.test(s))!;
    expectQuotedColumnInSql(sql, "cpk_cars.make");
    expectQuotedColumnInSql(sql, "cpk_cars.model");
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

    (agreement.association("order") as any).writer(order);
    await agreement.save();

    await agreement.reload();
    const loaded = await (agreement as any).loadBelongsTo("order");
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
      const blogPost = shardedBlogPosts("great_post_blog_one");
      let error: unknown;
      try {
        await association(blogPost, "commentsWithoutSingleColumnQueryConstraints");
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(ArgumentError);
      expect((error as Error).message).toContain("does not include the primary key");
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
      const blogPost = shardedBlogPosts("great_post_blog_one");
      let error: unknown;
      try {
        await association(blogPost, "commentsWithoutMultipleColumnQueryConstraints");
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(ArgumentError);
      expect((error as Error).message).toContain("does not include the primary key");
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
    const blogPost = shardedBlogPosts("great_post_blog_one");
    expect((await association(blogPost, "tags")).length).toBeGreaterThan(0);

    await association(blogPost, "tags").replace([]);

    expect(await association(blogPost, "tags")).toEqual([]);
    await association(blogPost, "tags").reload();
    expect(await association(blogPost, "tags")).toEqual([]);
    expect(
      await ShardedBlogPostTag.where({
        blog_post_id: (blogPost as any).id,
        blog_id: (blogPost as any).blog_id,
      }).exists(),
    ).toBe(false);
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
    expect((await (order as any).loadHasOne("book"))?.title).toBe("Only");
  });

  it("has one loads through a declared reflection with a scalar foreign key on a composite primary key owner", async () => {
    const order = await CpkOrderWithPrimaryKeyAssociatedBook.create({ shop_id: 1 });
    const [, orderId] = order.id as [number, number];
    await CpkBook.create({ id: [1, 90002], order_id: orderId, title: "Only" });
    expect((await (order as any).loadHasOne("book"))?.title).toBe("Only");
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
