/**
 * Associations tests — mirrors Rails activerecord/test/cases/associations_test.rb
 *
 * Covers the test classes that file defines: AssociationsTest,
 * AssociationProxyTest, PreloaderTest, OverridingAssociationsTest,
 * GeneratedMethodsTest, and WithAnnotationsTest.
 */
import { describe, it, expect, afterEach, beforeAll, beforeEach, vi } from "vitest";
import { Base, association, reflectOnAssociation, registerModel, NameError, pp } from "./index.js";
import { ArgumentError } from "@blazetrails/activemodel";
import { captureSql } from "./testing/sql-capture.js";
import { fixtures, setupFixtures } from "./test-helpers/fixtures.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
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
registerModel(Comment);
registerModel(Computer);
import { Project } from "./test-helpers/models/project.js";
import { Category } from "./test-helpers/models/category.js";
import { Categorization } from "./test-helpers/models/categorization.js";
import { Member } from "./test-helpers/models/member.js";
import { Membership } from "./test-helpers/models/membership.js";
import { Human } from "./test-helpers/models/human.js";
import { Interest } from "./test-helpers/models/interest.js";
import { buildHasManyRelation, loadBelongsTo, loadHasMany, loadHasOne } from "./associations.js";
import "./test-helpers/models/ship.js";
import "./test-helpers/models/bird.js";
import "./test-helpers/models/treasure.js";
import "./test-helpers/models/price-estimate.js";

import { markForDestruction, isMarkedForDestruction } from "./autosave-association.js";
import { Preloader } from "./associations/preloader.js";
import { Batch } from "./associations/preloader/batch.js";
import { LoaderQuery } from "./associations/preloader/association.js";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Mirrors Rails `assert_match(/#{Regexp.escape(quote_table_name(col))} =/, sql)`:
// build the adapter's own quoted `"table"."column"` form so the assertion holds
// across sqlite/pg/mysql quoting. With `{ inWhere: true }` it mirrors Rails'
// `/WHERE .*#{...} =/` form, requiring the predicate to live in the WHERE clause.
function expectQuotedColumnInSql(
  sql: string,
  qualifiedColumn: string,
  options: { inWhere?: boolean } = {},
): void {
  const quoted = (Base.connection as { quoteTableName(n: string): string }).quoteTableName(
    qualifiedColumn,
  );
  if (options.inWhere) {
    expect(sql).toMatch(new RegExp(`WHERE[\\s\\S]*${escapeRegExp(quoted)} =`));
  } else {
    expect(sql).toContain(`${quoted} =`);
  }
}

describe("AssociationsTest", () => {
  setupFixtures();
  useHandlerTransactionalFixtures();
  beforeAll(() => {
    registerModel("CpkOrder", CpkOrder);
    registerModel("CpkBook", CpkBook);
  });

  it("loading cpk association when persisted and in memory differ", async () => {
    // Mirrors vendor/rails/activerecord/test/cases/associations_test.rb:84
    // book is created THROUGH order.books so it lives in the association's
    // in-memory target before the reload — exercises the CPK reconciliation path.
    const order = await CpkOrder.create({ shop_id: 1, status: "paid" });
    const book = await (order as any).books.create({ author_id: 3, id: 4, title: "Book" });
    // Update the book in DB behind the in-memory instance so persisted/in-memory diverge
    const dbBook = await CpkBook.where({ author_id: 3, id: 4 }).first();
    await dbBook!.updateColumns({ title: "A different title" });
    // Reload the association — must reconcile the existing in-memory book by CPK
    await (order as any).books.load();
    // CPK identity of the in-memory book is preserved after reload
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
  const { authors, developers, members, posts, categories } = fixtures(
    [
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
    ],
    { schema: canonicalSchema },
  );

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
    expect(() => josh.posts.prepend(new Post())).toThrow();
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
    // Rails defines a singleton method on the proxy and asserts the cached
    // proxy keeps it; the trails proxy is cached (same object), so a property
    // assigned to it survives across accessor reads.
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
    // CollectionAssociation#size has different behavior when loaded vs. non-loaded:
    // the first call marks the association as loaded and the second call takes a
    // different code path, so it's important to keep both assertions.
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
    // update_columns on parent should not trigger association loading.
    await david.updateColumns({ salary: 80_000 });
    expect(david.projects.loaded).toBe(false);
  });
  it("inspect does not reload a not yet loaded target", async () => {
    // Mirrors developer.rb `log=`: building an audit_log without loading.
    const andreas = new Developer({ name: "Andreas" });
    (andreas as any).log = "new developer added";
    expect(andreas.auditLogs.loaded).toBe(false);
    expect(await andreas.auditLogs.inspect()).toMatch(/message: "new developer added"/);
    expect(andreas.auditLogs.loaded).toBe(true);
  });
  it("pretty_print does not reload a not yet loaded target", async () => {
    // Mirrors test_pretty_print_does_not_reload_a_not_yet_loaded_target: PP.pp
    // on an unloaded proxy renders the built (in-memory) target without forcing
    // a reload. trails has no Ruby `PP` library; `pp(obj, io)` drives the same
    // pretty-printer protocol (CollectionProxy#prettyPrint → record#prettyPrint)
    // rather than #inspect.
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
    expect(reloaded).toBe(david.projects);
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
    // Rails: human.interests.where("1=1").first.human should not re-query —
    // automatic inverse_of wires the parent onto each loaded child.
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
    // Rails: assert_no_queries { david.first_posts.pluck(:title) } — pluck reads
    // the loaded target rather than issuing a fresh SELECT.
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
    // Rails: assert_no_queries { david.first_posts.pick(:title) } — pick reads
    // the loaded target rather than issuing a fresh SELECT.
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
    // Mutate the in-memory instance.
    post.title = "mutated";
    // load() should preserve the in-memory instance, not replace with a fresh DB copy.
    const loaded = await david.posts.load();
    const found = loaded.find((r: any) => r.readAttribute("id") === post.id);
    expect(found).toBe(post);
    expect(found.title).toBe("mutated");
  });
});

describe("PreloaderTest", () => {
  setupFixtures();
  useHandlerTransactionalFixtures();

  afterEach(() => vi.restoreAllMocks());

  // Canonical model handles for wave-1 PreloaderTest conversions
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
    registerModel("EssaySpecial", EssaySpecial);
    registerModel("Postesque", PostesquePL);
    registerModel("AuthorAddress", AuthorAddress);

    // A reflection memoizes the resolved target class in `_klassCache` (and the
    // through/source reflection it derives from it) the first time it's touched,
    // keyed by class NAME via the global modelRegistry. When a sibling test file
    // that shares this worker registers a bespoke model under a canonical name
    // (e.g. nested-through-associations.test.ts registers a `Tagging` with no
    // `tag` source) and that resolution happens first, the canonical reflection
    // caches the wrong class permanently — surfacing here as
    // `HasManyThroughSourceAssociationNotFoundError` on Post.tags. The registry
    // entries above are already corrected to the canonical models; drop the stale
    // klass/through/source caches so resolution re-runs against them. Covers every
    // model this beforeEach re-registers (not just the Post→taggings→tag chain that
    // fails today) so a future file-size reschedule poisoning a different canonical
    // name — Sharded*, Cpk*, Essay, … — is hardened too. (FK/PK caches are
    // intentionally left intact — they don't depend on cross-model name resolution
    // and resetting them mid-suite regresses unrelated tests.)
    const preloaderModels = [
      Author,
      AuthorFavorite,
      Post,
      CategoryPost,
      Comment,
      Book,
      Category,
      SpecialCategory,
      Tag,
      Tagging,
      Essay,
      Invoice,
      LineItem,
      LineItemDiscountApplication,
      ShippingLine,
      ShippingLineDiscountApplication,
      Discount,
      ShardedBlogPL,
      ShardedBlogPostPL,
      ShardedCommentPL,
      ShardedTagPL,
      ShardedBlogPostTagPL,
      CpkOrderPL,
      CpkOrderAgreementPL,
      Dog,
      EssaySpecial,
      PostesquePL,
      AuthorAddress,
    ];
    for (const M of preloaderModels) {
      const reflections = (M as { _reflections?: Record<string, unknown> })._reflections ?? {};
      for (const reflection of Object.values(reflections) as Record<string, unknown>[]) {
        reflection._klassCache = null;
        if ("_throughReflectionCache" in reflection) reflection._throughReflectionCache = undefined;
        if ("_sourceReflectionCache" in reflection) reflection._sourceReflectionCache = undefined;
        if ("_sourceReflectionNameCache" in reflection)
          reflection._sourceReflectionNameCache = undefined;
      }
    }
  });

  it("preload with scope", async () => {
    const author = await Author.create({ name: "David" });
    const post = await Post.create({ title: "Welcome", body: "body", author_id: author.id });
    await Comment.create({ post_id: post.id, body: "Thank you for the welcome" });
    await Comment.create({ post_id: post.id, body: "Other comment" });
    await new Preloader({
      records: [post],
      associations: ["comments"],
      scope: Comment.where({ body: "Thank you for the welcome" }),
    }).call();
    const loaded = (post as any).association("comments").target;
    expect(loaded).toHaveLength(1);
    expect(loaded[0].body).toBe("Thank you for the welcome");
  });

  it("preload makes correct number of queries on array", async () => {
    const author = await Author.create({ name: "David" });
    const post = await Post.create({ title: "Welcome", body: "body", author_id: author.id });
    const sqls = await captureSql(async () => {
      await new Preloader({ records: [post], associations: ["comments"] }).call();
    });
    expect(sqls).toHaveLength(1);
  });

  it("preload makes correct number of queries on relation", async () => {
    const author = await Author.create({ name: "David" });
    const post = await Post.create({ title: "Welcome", body: "body", author_id: author.id });
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
    // Materialized once: a subsequent call() issues no preload query.
    const sqls = await captureSql(async () => {
      await preloader.call();
    });
    expect(sqls).toHaveLength(0);
  });

  it("isEmpty reports false for a non-empty relation", async () => {
    const author = await Author.create({ name: "David" });
    const post = await Post.create({ title: "Welcome", body: "body", author_id: author.id });
    const relation = Post.where({ id: post.id });
    const preloader = new Preloader({ records: relation, associations: "comments" });
    expect(await preloader.isEmpty()).toBe(false);
  });

  it("preload does not concatenate duplicate records", async () => {
    const author = await Author.create({ name: "David" });
    const post = await Post.create({ title: "Welcome", body: "body", author_id: author.id });
    await Comment.create({ post_id: post.id, body: "A new comment" });
    // Preload once (mirrors Rails' post.comments.create! which loads the association)
    await new Preloader({ records: [post], associations: ["comments"] }).call();
    // Preload again on the same record — a naive concat-on-top would double the count
    await new Preloader({ records: [post], associations: ["comments"] }).call();
    const loaded = (post as any).association("comments").target;
    expect(loaded.length).toBe(Number(await Comment.where({ post_id: post.id }).count()));
  });

  // STI filtering via className is not applied in ThroughAssociation preloader:
  // both Category and SpecialCategory rows are returned instead of only SpecialCategory.
  // TODO(store-full-sti-class-name): remove it.fails when that story fixes the gap.
  it.fails("preload for hmt with conditions", async () => {
    const author = await Author.create({ name: "David" });
    const post = await Post.create({ title: "Welcome", body: "body", author_id: author.id });
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
    const author = await Author.create({ name: "David" });
    const book = await Book.create({ author_id: author.id, name: "A Book" });
    const post = await Post.create({ title: "Welcome", body: "body", author_id: author.id });
    const sqls = await captureSql(async () => {
      await new Preloader({ records: [book, post], associations: ["author"] }).call();
    });
    expect(sqls).toHaveLength(1);
    const noQueriesAfter = await captureSql(async () => {
      void (book as any).association("author").target;
      void (post as any).association("author").target;
    });
    expect(noQueriesAfter).toHaveLength(0);
    expect((book as any).association("author").target.id).toBe(author.id);
    expect((post as any).association("author").target.id).toBe(author.id);
  });

  it("preload grouped queries with already loaded records", async () => {
    const author = await Author.create({ name: "David" });
    const book = await Book.create({ author_id: author.id, name: "A Book" });
    const post = await Post.create({ title: "Welcome", body: "body", author_id: author.id });
    const bookLoaded = (await Book.where({ id: book.id }).includes("author"))[0];
    const postFresh = (await Post.where({ id: post.id }))[0];
    // book's author already loaded; post shares the same author_id →
    // the Preloader finds the key in alreadyLoadedByKey and issues 0 DB queries
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
    const post1 = await Post.create({ title: "P1", body: "b1" });
    const post2 = await Post.create({ title: "P2", body: "b2" });
    const tag1 = await Tag.create({ name: "ruby" });
    const tag2 = await Tag.create({ name: "rails" });
    await Tagging.create({ taggable_id: post1.id, taggable_type: "Post", tag_id: tag1.id });
    await Tagging.create({ taggable_id: post2.id, taggable_type: "Post", tag_id: tag2.id });
    // Two separate preloaders for a through association — middle-record (taggings) loaders
    // from both branches share the same scope/key and are coalesced into 1 batch call
    const spy = vi.spyOn(LoaderQuery.prototype, "loadRecordsInBatch");
    const p1 = new Preloader({ records: [post1], associations: ["tags"] });
    const p2 = new Preloader({ records: [post2], associations: ["tags"] });
    await new Batch([p1, p2]).call();
    // 3 batch calls: grouped taggings loaders, grouped tag loaders, and the
    // tag→tagging preload from Tagging#tag's `includes(:tagging)` scope.
    expect(spy).toHaveBeenCalledTimes(3);
    expect((post1 as any).association("tags").target.map((t: any) => t.name)).toEqual(["ruby"]);
    expect((post2 as any).association("tags").target.map((t: any) => t.name)).toEqual(["rails"]);
  });
  it("preload grouped queries of through records", async () => {
    const post1 = await Post.create({ title: "P1", body: "b1" });
    const post2 = await Post.create({ title: "P2", body: "b2" });
    const tag1 = await Tag.create({ name: "ruby" });
    const tag2 = await Tag.create({ name: "rails" });
    await Tagging.create({ taggable_id: post1.id, taggable_type: "Post", tag_id: tag1.id });
    await Tagging.create({ taggable_id: post2.id, taggable_type: "Post", tag_id: tag2.id });
    // includes() creates one Preloader; source (tag) loaders for both posts share the
    // same scope and are coalesced — 3 batch calls total (taggings, tags, and the
    // tag→tagging preload from Tagging#tag's `includes(:tagging)` scope), not 5.
    const spy = vi.spyOn(LoaderQuery.prototype, "loadRecordsInBatch");
    const posts = await Post.where({ id: [post1.id, post2.id] }).includes("tags");
    expect(spy).toHaveBeenCalledTimes(3);
    const p1tags = (posts.find((p: any) => p.title === "P1") as any).association("tags").target;
    const p2tags = (posts.find((p: any) => p.title === "P2") as any).association("tags").target;
    expect(p1tags[0].name).toBe("ruby");
    expect(p2tags[0].name).toBe("rails");
  });
  it("preload through records with already loaded middle record", async () => {
    const post1 = await Post.create({ title: "P1", body: "b1" });
    const post2 = await Post.create({ title: "P2", body: "b2" });
    const tag1 = await Tag.create({ name: "ruby" });
    const tag2 = await Tag.create({ name: "rails" });
    await Tagging.create({ taggable_id: post1.id, taggable_type: "Post", tag_id: tag1.id });
    await Tagging.create({ taggable_id: post2.id, taggable_type: "Post", tag_id: tag2.id });
    // Pre-load middle records (taggings) for post1 only
    const p1 = (await Post.where({ title: "P1" }).includes("taggings"))[0];
    const p2 = (await Post.where({ title: "P2" }))[0];
    // Preload tags for both posts. The through-preloader's tagging loader finds p1's key
    // already loaded (LoaderRecords merge path) and only queries DB for p2's taggings
    const spy = vi.spyOn(LoaderQuery.prototype, "loadRecordsForKeys");
    await new Preloader({ records: [p1, p2], associations: ["tags"] }).call();
    // First call is for taggings: only p2's key goes to DB (p1's already loaded)
    const taggingKeys = spy.mock.calls[0]?.[0];
    expect(taggingKeys).toHaveLength(1);
    expect((p1 as any).association("tags").target.map((t: any) => t.name)).toEqual(["ruby"]);
    expect((p2 as any).association("tags").target.map((t: any) => t.name)).toEqual(["rails"]);
  });
  it("preload with instance dependent scope", async () => {
    const david = await Author.create({ name: "David" });
    const david2 = await Author.create({ name: "David" });
    const bob = await Author.create({ name: "Bob" });
    const post1 = await Post.create({ author_id: david.id, title: "Post 1", body: "david" });
    const post2 = await Post.create({ author_id: david.id, title: "Post 2", body: "david" });

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
    const david = await Author.create({ name: "David" });
    const david2 = await Author.create({ name: "David" });
    const bob = await Author.create({ name: "Bob" });
    const davidPost = await Post.create({ author_id: david.id, title: "Post", body: "body" });
    // Lowercased so LIKE '%david%' matches on MariaDB (case-sensitive collation).
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
    const david = await Author.create({ name: "David" });
    const david2 = await Author.create({ name: "David" });
    const bob = await Author.create({ name: "Bob" });
    const davidPost = await Post.create({
      author_id: david.id,
      title: "test post",
      // Lowercased so the `postsMentioningAuthor` LIKE `%david%` scope matches
      // regardless of the column collation (MariaDB CI uses a case-sensitive one).
      body: "this post is about david",
    });
    // Second david post also matches the body scope but has no comments.
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
      const li = association(inv, "lineItems").target[0];
      const sl = association(inv, "shippingLines").target[0];
      expect(association(li, "discountApplications").target[0].discount).not.toBeNull();
      expect(association(sl, "discountApplications").target[0].discount).not.toBeNull();
    };

    // First preload: nothing loaded, so all five levels query —
    // line_items, shipping_lines, both discount_applications, and discounts.
    const fresh = (await Invoice.where({ id: invoice.id }))[0];
    const firstSqls = await captureSql(async () => {
      await new Preloader({ records: [fresh], associations: nested }).call();
    });
    expect(firstSqls).toHaveLength(5);
    const firstReads = await captureSql(async () => readDiscounts(fresh));
    expect(firstReads).toHaveLength(0);

    // Reload, then force-load the line_items branch (line_items +
    // line_item_discount_applications). The second preload must skip that branch
    // and issue only the three shipping/discount queries.
    const reloaded = (await Invoice.where({ id: invoice.id }))[0];
    const lineItems = await loadHasMany(reloaded, "lineItems", {});
    for (const li of lineItems) await loadHasMany(li, "discountApplications", {});
    const secondSqls = await captureSql(async () => {
      await new Preloader({ records: [reloaded], associations: nested }).call();
    });
    expect(secondSqls).toHaveLength(3);
    const secondReads = await captureSql(async () => readDiscounts(reloaded));
    expect(secondReads).toHaveLength(0);
  });

  it("preload through", async () => {
    const post = await Post.create({ title: "Hello", body: "body" });
    const tag1 = await Tag.create({ name: "ruby" });
    const tag2 = await Tag.create({ name: "rails" });
    await Tagging.create({ taggable_id: post.id, taggable_type: "Post", tag_id: tag1.id });
    await Tagging.create({ taggable_id: post.id, taggable_type: "Post", tag_id: tag2.id });

    const posts = await Post.where({ id: post.id }).includes("taggings");
    expect(posts).toHaveLength(1);
    const preloaded = (posts[0] as any).association("taggings").target;
    expect(preloaded).toHaveLength(2);
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
    // 3 batched DB calls: thinking_posts, welcome_posts, then ONE coalesced comments call.
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
    // 3 batched DB calls: thinking_posts, welcome_posts, then ONE coalesced
    // comments call shared by comments and commentsWithExtending (extending excluded from SQL fingerprint).
    expect(spy).toHaveBeenCalledTimes(3);
  });
  it("preload with grouping sets inverse association", async () => {
    const mary = await Author.create({ name: "Mary" });
    const bob = await Author.create({ name: "Bob" });
    await AuthorFavorite.create({ author_id: mary.id, favorite_author_id: bob.id });
    const favorites = await AuthorFavorite.all();
    const spy = vi.spyOn(LoaderQuery.prototype, "loadRecordsInBatch");
    await new Preloader({
      records: favorites,
      associations: ["author", "favoriteAuthor"],
    }).call();
    // Both belongs_to loaders hit the same table with the same scope/key →
    // coalesced into 1 batched query.
    expect(spy).toHaveBeenCalledTimes(1);
    const fav = favorites[0] as any;
    expect(fav.association("author").target.name).toBe("Mary");
    expect(fav.association("favoriteAuthor").target.name).toBe("Bob");
    // Mirrors Rails `test_preload_with_grouping_sets_inverse_association`
    // (associations_test.rb:1120): after the coalesced preload, both belongs_to
    // targets are reachable with no further queries. The has_many inverse
    // (`mary.authorFavorites`) is intentionally NOT back-populated — Rails gates
    // that on `has_many_inversing` (BelongsToAssociation#invertible_for?), which
    // is unset here, so the loaded author carries no inverse collection.
    spy.mockClear();
    const reloadedAuthor = (await loadBelongsTo(fav, "author", {
      inverseOf: "authorFavorites",
    })) as any;
    const reloadedFavorite = (await loadBelongsTo(fav, "favoriteAuthor", {})) as any;
    expect(reloadedAuthor.name).toBe("Mary");
    expect(reloadedFavorite.name).toBe("Bob");
    expect(spy).not.toHaveBeenCalled();
  });
  it("preload can group separate levels", async () => {
    const mary = await Author.create({ name: "Mary" });
    const bob = await Author.create({ name: "Bob" });
    await AuthorFavorite.create({ author_id: mary.id, favorite_author_id: bob.id });
    await Post.create({ title: "M1", body: "b", author_id: mary.id });
    await Post.create({ title: "B1", body: "b", author_id: bob.id });
    const spy = vi.spyOn(LoaderQuery.prototype, "loadRecordsInBatch");
    await new Preloader({
      records: [mary],
      associations: ["posts", { favoriteAuthors: "posts" }],
    }).call();
    // Rails: 3 queries. Through-target authors share the authorFavorites
    // load, and the two posts loaders (mary's + bob's) coalesce into one
    // batched call.
    expect(spy).toHaveBeenCalledTimes(3);
  });
  it("preload can group multi level ping pong through", async () => {
    // Author#similarPosts "ping pongs" back to posts:
    //   Author → posts → taggings → tags  (has_many :tags, through: :posts)
    //   Tag    → taggings → taggable(Post) (has_many :taggedPosts, source_type)
    //   Author → tags → taggedPosts        (has_many :similarPosts)
    // and favoriteAuthors loops the same chain a level down, so the preloader
    // has to coalesce the repeated posts/comments levels across both branches.
    const mary = await Author.create({ name: "Mary" });
    const bob = await Author.create({ name: "Bob" });
    await AuthorFavorite.create({ author_id: mary.id, favorite_author_id: bob.id });
    const maryPost = await Post.create({ title: "M1", body: "b", author_id: mary.id });
    const bobPost = await Post.create({ title: "B1", body: "b", author_id: bob.id });
    const tag = await Tag.create({ name: "ruby" });
    await Tagging.create({
      tag_id: tag.id,
      taggable_id: maryPost.id,
      taggable_type: "Post",
    });
    await Tagging.create({ tag_id: tag.id, taggable_id: bobPost.id, taggable_type: "Post" });
    await Comment.create({ body: "on mary post", post_id: maryPost.id });
    await Comment.create({ body: "on bob post", post_id: bobPost.id });

    const associations = [
      { similarPosts: "comments" },
      { favoriteAuthors: { similarPosts: "comments" } },
    ];

    const spy = vi.spyOn(LoaderQuery.prototype, "loadRecordsInBatch");
    await new Preloader({ records: [mary], associations }).call();
    // Both branches walk the same posts→taggings→tags→taggedPosts→comments
    // levels, so the preloader coalesces them rather than re-querying each
    // branch independently. Rails' `assert_queries_count(9)` — the count drops
    // to 8 only with automatic scope inversing (Tagging#tag's `includes(:tagging)`
    // scope reusing its inverse), which this test doesn't enable.
    const preloadCalls = spy.mock.calls.length;
    expect(preloadCalls).toBe(9);

    // assert_no_queries: every level is now preloaded, so re-walking the whole
    // ping-pong chain reads from the cache without issuing further loads.
    const marySimilar = (mary as any).association("similarPosts").target;
    expect(marySimilar.map((p: any) => p.id).sort()).toEqual([maryPost.id, bobPost.id].sort());
    for (const post of marySimilar) {
      expect(post.association("comments").target.length).toBe(1);
    }
    const maryFavs = (mary as any).association("favoriteAuthors").target;
    expect(maryFavs.map((a: any) => a.id)).toEqual([bob.id]);
    const bobSimilar = maryFavs[0].association("similarPosts").target;
    expect(bobSimilar.map((p: any) => p.id).sort()).toEqual([maryPost.id, bobPost.id].sort());
    for (const post of bobSimilar) {
      expect(post.association("comments").target.length).toBe(1);
    }
    // Walking the cached graph above triggered no new batched loads.
    expect(spy.mock.calls.length).toBe(preloadCalls);
  });
  it("preload does not group same class different scope", async () => {
    const alice = await Author.create({ name: "Alice" });
    const post = await Post.create({ title: "P1", body: "body", author_id: alice.id });
    const postesque = await PostesquePL.create({ author_name: alice.name });

    // Sub-scenario 1: scopes differ in generated SQL.
    // Post#authorWithTheLetterA has `name LIKE '%a%'`; Postesque#authorWithTheLetterA has none.
    let spy = vi.spyOn(LoaderQuery.prototype, "loadRecordsInBatch");
    await new Preloader({
      records: [post, postesque],
      associations: ["authorWithTheLetterA"],
    }).call();
    expect(spy).toHaveBeenCalledTimes(2);

    (post as any)._resetAssociationCaches();
    (postesque as any)._resetAssociationCaches();

    // Sub-scenario 2: SQL is identical but Post#authorWithAddress carries a preload value
    // (includes authorAddress) while Postesque#authorWithAddress does not — the preload
    // difference still prevents coalescing, and the address load adds a third query.
    spy = vi.spyOn(LoaderQuery.prototype, "loadRecordsInBatch");
    await new Preloader({
      records: [post, postesque],
      associations: ["authorWithAddress"],
    }).call();
    expect(spy).toHaveBeenCalledTimes(3);
  });
  it("preload does not group same scope different key name", async () => {
    // Mirrors Rails Postesque.belongs_to :author, foreign_key: :author_name, primary_key: :name.
    // Same scope (no WHERE), same class, but distinct join-primary-key → must NOT coalesce.
    const author = await Author.create({ name: "Alice" });
    const post = await Post.create({ title: "P1", body: "body", author_id: author.id });
    const postesque = await PostesquePL.create({ author_name: author.name });
    const spy = vi.spyOn(LoaderQuery.prototype, "loadRecordsInBatch");
    await new Preloader({
      records: [post, postesque],
      associations: ["author"],
    }).call();
    expect(spy).toHaveBeenCalledTimes(2);
  });
  // Mirrors Rails' Dog (primary connection) and OtherDog (ARUnit2Model — a
  // second database), both backed by a table named `dogs`. A polymorphic
  // preload over comments pointing at each must run two queries rather than
  // batch them together, because LoaderQuery#hashKey distinguishes loaders by
  // connection identity.
  it("multi database polymorphic preload with same table name", async () => {
    // Second database base (Rails: ARUnit2Model connected to arunit2 DB).
    // Kept inline so connectsTo doesn't pollute the shared canonical ARUnit2Model.
    class AnimalsBase extends Base {
      static {
        this.abstractClass = true;
      }
    }
    class OtherDog extends AnimalsBase {
      static {
        this.tableName = "dogs";
      }
    }
    registerModel("OtherDog", OtherDog);

    const [secondaryPool] = AnimalsBase.connectsTo({
      database: { writing: { adapter: "sqlite3", database: ":memory:", pool: 1 } },
    });
    try {
      await secondaryPool.adapterReady;
      // Canonical dogs shape in the secondary database.
      await OtherDog.leaseConnection().executeMutation(
        "CREATE TABLE `dogs` (`id` INTEGER PRIMARY KEY, `trainer_id` INTEGER, " +
          "`breeder_id` INTEGER, `dog_lover_id` INTEGER, `alias` VARCHAR(255))",
      );

      const dogComment = new (Comment as any)({ origin_id: 1, origin_type: "Dog" });
      const otherDogComment = new (Comment as any)({ origin_id: 1, origin_type: "OtherDog" });

      // Same table name, same key, same id — these two loaders would coalesce
      // into a single query were it not for their distinct connections.
      const spy = vi.spyOn(LoaderQuery.prototype, "loadRecordsInBatch");
      await new Preloader({
        records: [dogComment, otherDogComment],
        associations: ["origin"],
      }).call();
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      Base.connectionHandler.removeConnectionPool("AnimalsBase");
    }
  });

  it("preload with available records", async () => {
    const david = await Author.create({ name: "David" });
    const post = await Post.create({ title: "Welcome", body: "body", author_id: david.id });

    // availableRecords supplies david, so the belongs_to preload runs no query
    // and attaches the supplied instance itself.
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
    const bob = await Author.create({ name: "Bob" });
    const mary = await Author.create({ name: "Mary" });
    const bobPost = await Post.create({ title: "misc by bob", body: "body", author_id: bob.id });
    const maryPost = await Post.create({ title: "misc by mary", body: "body", author_id: mary.id });

    // availableRecords satisfies bob from memory; only mary requires a query.
    const sqls = await captureSql(async () => {
      await new Preloader({
        records: [bobPost, maryPost],
        associations: "author",
        availableRecords: [bob],
      }).call();
    });
    expect(sqls).toHaveLength(1);

    const reads = await captureSql(async () => {
      // assert_same bob — the supplied instance; assert_equal mary — freshly loaded
      expect(bobPost.association("author").target).toBe(bob);
      expect((maryPost.association("author").target as any).id).toBe(mary.id);
    });
    expect(reads).toHaveLength(0);
  });

  it("preload with some records already loaded", async () => {
    const bob = await Author.create({ name: "Bob" });
    const mary = await Author.create({ name: "Mary" });
    const bobPostId = (await Post.create({ title: "misc by bob", body: "body", author_id: bob.id }))
      .id;
    const maryPostId = (
      await Post.create({ title: "misc by mary", body: "body", author_id: mary.id })
    ).id;
    // Fresh instances so association load state mirrors Rails' fixtures.
    const bobPost = (await Post.where({ id: bobPostId }))[0];
    const maryPost = (await Post.where({ id: maryPostId }))[0];

    // Force-load bob's author; mary's stays unloaded.
    const loadedBob = await loadBelongsTo(bobPost, "author", {});
    expect(bobPost.association("author").isLoaded()).toBe(true);
    expect(maryPost.association("author").isLoaded()).toBe(false);

    // Only mary's author is missing, so the preload runs a single query.
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
    const author = await Author.create({ name: "David" });
    await Category.create({ name: "General" });
    await Essay.create({
      name: "A Modest Proposal",
      writer_type: "Author",
      writer_id: "David",
      category_id: "General",
    });
    const categories = await Category.all();

    const spy = vi.spyOn(LoaderQuery.prototype, "loadRecordsForKeys");
    // One query to get the middle records (i.e. essays); categories come from availableRecords
    await new Preloader({
      records: [author],
      associations: "essayCategory",
      availableRecords: categories,
    }).call();
    const queryCalls = spy.mock.calls.filter((c) => c[0].length > 0);
    expect(queryCalls).toHaveLength(1);
    expect(association(author, "essayCategory").loaded).toBe(true);
    // Mirrors Rails' __id__ check: the preloaded category is the *same instance*
    // taken from availableRecords, not a freshly-loaded row. Read off the real
    // holder (RFC 0022) — a has_one :through holder exposes the single target
    // record (Rails stores the single record in `@association_cache`).
    const preloaded = (author as any).association("essayCategory").target;
    expect(categories).toContain(preloaded);
  });

  it("preload with only some records available with through associations", async () => {
    const mary = await Author.create({ name: "Mary" });
    const dave = await Author.create({ name: "David" });
    const tech = await Category.create({ name: "Technology" });
    const general = await Category.create({ name: "General" });
    await Essay.create({
      name: "Stay Home",
      writer_type: "Author",
      writer_id: "Mary",
      category_id: "Technology",
    });
    await Essay.create({
      name: "A Modest Proposal",
      writer_type: "Author",
      writer_id: "David",
      category_id: "General",
    });

    const spy = vi.spyOn(LoaderQuery.prototype, "loadRecordsForKeys");
    // One query for the middle (essay) records, one for the missing category (general)
    await new Preloader({
      records: [mary, dave],
      associations: "essayCategory",
      availableRecords: [tech],
    }).call();
    const queryCalls = spy.mock.calls.filter((c) => c[0].length > 0);
    expect(queryCalls).toHaveLength(2);
    // Mirrors Rails' assert_no_queries: preloaded associations are served from
    // cache on read, so the singular reader must not hit the DB. mary's category
    // comes from availableRecords (assert_same → toBe), dave's is freshly loaded
    // (assert_equal → value equality).
    const reads = await captureSql(async () => {
      expect(association(mary, "essayCategory").reader).toBe(tech);
      expect((association(dave, "essayCategory").reader as any).id).toBe(general.id);
    });
    expect(reads).toHaveLength(0);
  });

  it("preload with available records with multiple classes", async () => {
    // Essay belongs_to :author and :category (both primary_key: :name), so the
    // two available records are of different classes.
    const david = await Author.create({ name: "David" });
    const general = await Category.create({ name: "General" });
    const essay = await Essay.create({
      name: "A Modest Proposal",
      author_id: "David",
      category_id: "General",
    });

    // Both supplied from availableRecords → no queries, supplied instances attached.
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
    const david = await Author.create({ name: "David" });
    const post = await Post.create({ title: "P", body: "body", author_id: david.id });

    const spy = vi.spyOn(LoaderQuery.prototype, "loadRecordsForKeys");
    await new Preloader({
      records: [post],
      associations: "author",
      scope: Author.where({ name: "David" }) as any,
      availableRecords: [david],
    }).call();
    const queryCalls = spy.mock.calls.filter((c) => c[0].length > 0);
    // Scope present → availableRecords ignored, runs the query
    expect(queryCalls).toHaveLength(1);
    // The author is loaded from the query, NOT the supplied instance (Rails'
    // assert_not_equal david.__id__, post.author.__id__).
    expect(post.association("author").isLoaded()).toBe(true);
    expect(post.association("author").target).not.toBe(david);
  });

  it("preload with available records queries when collection", async () => {
    const post = await Post.create({ title: "P", body: "body" });
    const c1 = await Comment.create({ body: "c1", post_id: post.id });
    const comments = [c1];

    const spy = vi.spyOn(LoaderQuery.prototype, "loadRecordsForKeys");
    await new Preloader({
      records: [post],
      associations: "comments",
      availableRecords: comments,
    }).call();
    const queryCalls = spy.mock.calls.filter((c) => c[0].length > 0);
    // Collection association → availableRecords skipped, runs the query
    expect(queryCalls).toHaveLength(1);
    // The loaded comments come from the query, sharing no object identity with
    // the supplied availableRecords (Rails' assert_empty intersection).
    expect(post.association("comments").isLoaded()).toBe(true);
    const loaded = post.association("comments").target as any[];
    expect(loaded.some((lc) => comments.includes(lc))).toBe(false);
    expect(loaded.map((lc) => lc.id)).toEqual([(c1 as any).id]);
  });

  it("preload with available records queries when incomplete", async () => {
    const david = await Author.create({ name: "David" });
    const bob = await Author.create({ name: "Bob" });
    const post = await Post.create({ title: "P", body: "body", author_id: david.id });

    const spy = vi.spyOn(LoaderQuery.prototype, "loadRecordsForKeys");
    await new Preloader({
      records: [post],
      associations: "author",
      availableRecords: [bob],
    }).call();
    const queryCalls = spy.mock.calls.filter((c) => c[0].length > 0);
    // Bob doesn't match david's key → still 1 query
    expect(queryCalls).toHaveLength(1);
    const preloaded = post.association("author").target as any;
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
    // A wrong-class available record whose id matches post.author_id must NOT be
    // attached: the preloader keys loaders by class, so a Category can't satisfy
    // a belongs_to :author even when the foreign key value collides.
    const general = await Category.create({ name: "General" });
    const post = await Post.create({ title: "Welcome", body: "body", author_id: general.id });

    // Category has no :author association — mirrors Rails' assert_raises.
    expect(() => general.association("author")).toThrow();

    await new Preloader({
      records: [post],
      associations: "author",
      availableRecords: [[general]],
    }).call();
    expect(post.association("author").isLoaded()).toBe(true);
    // assert_not_equal some_other_record, post.author
    expect(post.association("author").target).not.toBe(general);
  });

  it("preload has many association with composite foreign key", async () => {
    const blog = await ShardedBlogPL.create({ name: "Blog" });
    const bp1 = await ShardedBlogPostPL.create({ blog_id: blog.id, title: "Post1" });
    const bp2 = await ShardedBlogPostPL.create({ blog_id: blog.id, title: "Post2" });
    const comment = await ShardedCommentPL.create({
      blog_id: blog.id,
      blog_post_id: bp1.id,
      body: "Great!",
    });

    const blogPosts = await ShardedBlogPostPL.all().includes("comments");
    expect(blogPosts).toHaveLength(2);
    const byTitle = new Map(blogPosts.map((bp) => [(bp as any).title, bp]));
    expect(byTitle.get("Post1")!.association("comments").isLoaded()).toBe(true);
    const preloaded = (byTitle.get("Post1") as any).association("comments").target;
    expect(preloaded).toHaveLength(1);
    expect(preloaded[0].id).toBe(comment.id);
  });

  it("preload belongs to association with composite foreign key", async () => {
    const blog = await ShardedBlogPL.create({ name: "Blog" });
    const bp1 = await ShardedBlogPostPL.create({ blog_id: blog.id, title: "Post1" });
    const bp2 = await ShardedBlogPostPL.create({ blog_id: blog.id, title: "Post2" });
    await ShardedCommentPL.create({ blog_id: blog.id, blog_post_id: bp1.id, body: "C1" });
    await ShardedCommentPL.create({ blog_id: blog.id, blog_post_id: bp2.id, body: "C2" });

    const comments = await ShardedCommentPL.all().includes("blogPost");
    expect(comments).toHaveLength(2);
    const byBody = new Map(comments.map((c) => [(c as any).body, c]));
    expect(byBody.get("C1")!.association("blogPost").isLoaded()).toBe(true);
    expect((byBody.get("C1") as any).association("blogPost").target.title).toBe("Post1");
    expect((byBody.get("C2") as any).association("blogPost").target.title).toBe("Post2");
  });

  it("preload loaded belongs to association with composite foreign key", async () => {
    const blog = await ShardedBlogPL.create({ name: "Blog" });
    const bp1 = await ShardedBlogPostPL.create({ blog_id: blog.id, title: "Post1" });
    const comment = await ShardedCommentPL.create({
      blog_id: blog.id,
      blog_post_id: bp1.id,
      body: "C1",
    });

    // Load the blogPost on the comment instance first (warms the association cache).
    await loadBelongsTo(comment, "blogPost", { className: "ShardedBlogPost" });

    // Preloading on the already-loaded record must not fire any SQL queries
    // (mirrors Rails' assert_no_queries block).
    const sqls = await captureSql(async () => {
      await new Preloader({ records: [comment], associations: ["blogPost"] }).call();
    });
    expect(sqls).toHaveLength(0);
  });

  it("preload has many through association with composite query constraints", async () => {
    const blog = await ShardedBlogPL.create({ name: "Blog" });
    const blog2 = await ShardedBlogPL.create({ name: "Blog2" });
    const bp1 = await ShardedBlogPostPL.create({ blog_id: blog.id, title: "Post1" });
    await ShardedBlogPostPL.create({ blog_id: blog2.id, title: "Post2" });
    const tag = await ShardedTagPL.create({ blog_id: blog.id, name: "Tag1" });
    const tag2 = await ShardedTagPL.create({ blog_id: blog2.id, name: "Tag2" });
    await ShardedBlogPostTagPL.create({ blog_id: blog.id, blog_post_id: bp1.id, tag_id: tag.id });

    const tags = await ShardedTagPL.all().includes("blogPosts");
    expect(tags).toHaveLength(2);
    expect(tags.every((t) => t.association("blogPosts").isLoaded())).toBe(true);

    const tag1 = tags.find((t) => (t as any).name === "Tag1")!;
    const expectedBlogPostIds = await ShardedBlogPostTagPL.where(
      "blog_id = ? AND tag_id = ?",
      blog.id,
      tag.id,
    )
      .toArray()
      .then((rows) => rows.map((r) => Number((r as any).blog_post_id)).sort());
    expect(expectedBlogPostIds).not.toHaveLength(0);
    const preloaded = (tag1 as any).association("blogPosts").target;
    expect(preloaded.map((p: any) => Number(p.id)).sort()).toEqual(expectedBlogPostIds);
  });

  it("preloads has many on model with a composite primary key through id attribute", async () => {
    const order = await CpkOrderPL.create({ shop_id: 1 });
    const [, orderId] = order.id as [number, number];
    const ag1 = await CpkOrderAgreementPL.create({ order_id: orderId, signature: "abc" });
    const ag2 = await CpkOrderAgreementPL.create({ order_id: orderId, signature: "def" });

    let orders: any[];
    const sqls = await captureSql(async () => {
      orders = await CpkOrderPL.where("id = ?", orderId).includes("orderAgreements");
    });
    expect(sqls).toHaveLength(2);
    const preloadSql = sqls[1];
    expectQuotedColumnInSql(preloadSql, "cpk_order_agreements.order_id", { inWhere: true });
    expect(orders![0].association("orderAgreements").isLoaded()).toBe(true);
    const loaded = orders![0].association("orderAgreements").target;
    expect(loaded.map((a: any) => a.signature).sort()).toEqual(["abc", "def"]);
  });

  it("preloads belongs to a composite primary key model through id attribute", async () => {
    const order = await CpkOrderPL.create({ shop_id: 1 });
    const [, orderId] = order.id as [number, number];
    const ag = await CpkOrderAgreementPL.create({ order_id: orderId, signature: "xyz" });

    let agreements: any[];
    const sqls = await captureSql(async () => {
      agreements = await CpkOrderAgreementPL.where("id = ?", ag.id).includes("order");
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
    // Mirrors vendor/rails/activerecord/test/cases/associations_test.rb:1535
    // New unsaved post with a built (unsaved) comment — preloader must issue no
    // queries and must preserve the in-memory built comment.
    const post = new (Post as any)();
    const comment = post.association("comments").build({ body: "built" });

    const sqls = await captureSql(async () => {
      await new Preloader({ records: [post], associations: ["comments"] }).call();
      expect(post.association("comments").target).toContain(comment);
    });
    expect(sqls).toHaveLength(0);
  });

  it("preload keeps built has many records after query", async () => {
    // Mirrors vendor/rails/activerecord/test/cases/associations_test.rb:1546
    // Persisted post with one built (unsaved) comment — preloader queries for
    // persisted comments but must also preserve the built comment in the result.
    const persistedPost = await Post.create({ title: "Welcome", body: "body" });
    const post = (await Post.where({ id: persistedPost.id }))[0];
    const comment = (post as any).association("comments").build({ body: "built" });

    const sqls = await captureSql(async () => {
      await new Preloader({ records: [post], associations: ["comments"] }).call();
      expect((post as any).association("comments").target).toContain(comment);
    });
    expect(sqls).toHaveLength(1);
  });

  it("preload keeps built belongs to records no ops", async () => {
    // Mirrors vendor/rails/activerecord/test/cases/associations_test.rb:1558
    // New unsaved post with a built (unsaved) author — preloader must issue no
    // queries and must preserve the exact same author instance.
    const post = new (Post as any)();
    const author = post.association("author").build({ name: "Built" });

    const sqls = await captureSql(async () => {
      await new Preloader({ records: [post], associations: ["author"] }).call();
      expect(post.association("author").target).toBe(author);
    });
    expect(sqls).toHaveLength(0);
  });

  it("preload keeps built belongs to records after query", async () => {
    // Mirrors vendor/rails/activerecord/test/cases/associations_test.rb:1569
    // Persisted post with a built (unsaved) author — preloader must issue no
    // queries (author already built in memory) and preserve the same instance.
    const persistedPost = await Post.create({ title: "Welcome", body: "body" });
    const post = (await Post.where({ id: persistedPost.id }))[0];
    const author = (post as any).association("author").build({ name: "Built" });

    const sqls = await captureSql(async () => {
      await new Preloader({ records: [post], associations: ["author"] }).call();
      expect((post as any).association("author").target).toBe(author);
    });
    expect(sqls).toHaveLength(0);
  });

  it("preload marks belongs_to association loaded on owner", async () => {
    const a = await Author.create({ name: "A" });
    await Post.create({ title: "P", body: "body", author_id: a.id });

    const posts = await Post.all().includes("author");
    expect(posts).toHaveLength(1);
    const assoc = (posts[0] as any).association("author");
    expect(assoc.isLoaded()).toBe(true);
    expect(assoc.target?.name).toBe("A");
  });

  it("preload sets has_many association target on owner", async () => {
    const a = await Author.create({ name: "A" });
    await Post.create({ title: "P1", body: "body", author_id: a.id });
    await Post.create({ title: "P2", body: "body", author_id: a.id });

    const authors = await Author.all().includes("posts");
    const owner = authors.find((x) => x.id === a.id)!;
    const assoc = (owner as any).association("posts");
    expect(assoc.isLoaded()).toBe(true);
    const titles = (assoc.target as Base[]).map((r: any) => r.title).sort();
    expect(titles).toEqual(["P1", "P2"]);
  });
});

describe("OverridingAssociationsTest", () => {
  // Tests are synchronous reflection checks — no DB queries. setupFixtures +
  // useHandlerTransactionalFixtures keep _skipGlobalResetDepth > 0 so the global
  // beforeEach does not call resetTestAdapterState() (dropAllTables) between tests,
  // which would silently drop canonical tables (cpk_order_agreements, cpk_cars, etc.)
  // needed by the later AssociationsTest describe block.
  setupFixtures();
  useHandlerTransactionalFixtures();

  // Mirrors Rails' nested DifferentPerson / PeopleList / DifferentPeopleList classes.
  // vendor/rails/activerecord/test/cases/associations_test.rb:710
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
    // Mirrors Rails: PeopleList.before_add_for_has_and_belongs_to_many.length == 1,
    //                DifferentPeopleList.before_add_for_has_and_belongs_to_many == []
    expect((PeopleList as any).beforeAddForHasAndBelongsToMany).toHaveLength(1);
    expect((DifferentPeopleList as any).beforeAddForHasAndBelongsToMany).toEqual([]);
  });

  it("has many association redefinition callbacks should differ and not inherited", () => {
    // Mirrors Rails: PeopleList.before_add_for_has_many.length == 1,
    //                DifferentPeopleList.before_add_for_has_many == []
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
    // Rails raises ArgumentError for belongs_to "author" (string literal, not symbol).
    // TypeScript has no symbols; the type system enforces this at compile time.
    // Verify that the runtime accepts a valid string name (cannot assert a compile-time error).
    class OaArgTest extends Base {
      static {
        this.hasMany("items");
      }
    }
    expect(reflectOnAssociation(OaArgTest, "items")).not.toBeNull();
  });

  it("associations raise with name error if associated to classes that do not exist", () => {
    // Mirrors vendor/rails/activerecord/test/cases/associations_test.rb:779-798.
    // Rails raises NameError synchronously in Association#initialize → check_validity! → klass,
    // so record.association(:name) itself throws — not load_target.
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
  const { computers, developers, posts, comments } = fixtures(
    ["computers", "developers", "posts", "comments"],
    { schema: canonicalSchema },
  );
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
    // Rails: `include MyModule` (def comments; :none end) BEFORE `has_many :comments`;
    // the module is inserted above GeneratedAssociationMethods in the ancestor chain so
    // the module method wins. JS equivalent: define as non-configurable before hasMany —
    // defineReaders' guard (`if (existing && !existing.configurable) return`) skips it,
    // matching Ruby's outcome that a pre-included method is not replaced by the association.
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
  // Mirrors Rails pirate.rb:SpacePirate (table "pirates") with annotated association scopes.
  // vendor/rails/activerecord/test/models/pirate.rb:108-118
  class SpacePirateAnnotated extends Base {
    static {
      this.tableName = "pirates";
      this.belongsTo("parrot", { className: "Parrot", foreignKey: "parrot_id" });
      this.belongsTo("parrotWithAnnotation", {
        scope: (q: any) => q.annotate("that tells jokes"),
        className: "Parrot",
        foreignKey: "parrot_id",
      });
      this.hasAndBelongsToMany("parrots", { className: "Parrot", foreignKey: "pirate_id" });
      this.hasAndBelongsToMany("parrotsWithAnnotation", {
        scope: (q: any) => q.annotate("that are very colorful"),
        className: "Parrot",
        foreignKey: "pirate_id",
      });
      this.hasOne("ship", { className: "Ship", foreignKey: "pirate_id" });
      this.hasOne("shipWithAnnotation", {
        scope: (q: any) => q.annotate("that is a rocket"),
        className: "Ship",
        foreignKey: "pirate_id",
      });
      this.hasMany("birds", { className: "Bird", foreignKey: "pirate_id" });
      this.hasMany("birdsWithAnnotation", {
        scope: (q: any) => q.annotate("that are also parrots"),
        className: "Bird",
        foreignKey: "pirate_id",
      });
      this.hasMany("treasures", { as: "looter" });
      this.hasMany("treasureEstimates", { through: "treasures", source: "priceEstimates" });
      this.hasMany("treasureEstimatesWithAnnotation", {
        scope: (q: any) => q.annotate("yarrr"),
        through: "treasures",
        source: "priceEstimates",
      });
    }
  }

  setupFixtures();
  const { pirates } = fixtures(
    ["pirates", "parrots", "parrotsPirates", "ships", "treasures", "priceEstimates"],
    { schema: canonicalSchema },
  );

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
      await SpacePirateAnnotated.includes("treasureEstimates").first();
    });
    expect(plain.length).toBeGreaterThan(0);
    expect(plain.every((s) => !s.includes("/*"))).toBe(true);
    const sqls = await captureSql(async () => {
      await SpacePirateAnnotated.includes("treasureEstimatesWithAnnotation").first();
    });
    expect(sqls.some((s) => s.includes("yarrr"))).toBe(true);
  });
});

// ==========================================================================
// AssociationsTest cases that rely on the canonical Rails fixtures
// (associations_test.rb test_subselect, test_using_limitable_reflections_helper,
// test_association_with_references). They live in a second `AssociationsTest`
// describe (same class name, so test:compare still maps them to the Rails
// AssociationsTest). The canonical model modules are imported dynamically in
// beforeAll — never at the top level — so their module-level side effects
// (Company STI subtree registration, Developer type registration) run during
// this block's execution rather than at collection time.
// ==========================================================================
describe("AssociationsTest", () => {
  // `authorFavorites` is declared so its rows are loaded (Rails: `fixtures
  // :author_favorites`); the subselect test reads them through the association.
  const { companies, authors, shardedBlogs, shardedBlogPosts, shardedComments, cpkOrders } =
    fixtures(
      [
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
      ],
      {
        schema: canonicalSchema,
      },
    );

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
    // Rails defines this association inline in
    // test_query_constraints_over_three_..._raises; its 3-attribute query
    // constraints make the FK underivable, so loading it raises. Declared once
    // here (a test-local mutation in Rails) to keep the conditional out of `it`.
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

    const liquids = await Liquid.includes({ molecules: "electrons" })
      .references("molecules")
      .where("molecules.id is not null");
    expect((await (liquids[0] as any).molecules.toArray()).length).toBe(1);
  });

  it("should construct new finder sql after create", async () => {
    const person = Person.new({ first_name: "clark" });
    expect(await association(person, "readers").toArray()).toEqual([]);
    await person.save();
    const reader = await Reader.create({
      person,
      post: Post.new({ title: "foo", body: "bar" }),
    });
    expect(await association(person, "readers").find((reader as any).id)).toBeTruthy();
  });

  it("subselect", async () => {
    const author = authors("david");
    const favs = await association(author, "authorFavorites").toArray();
    const fav2 = await association(author, "authorFavorites").where({
      author: Author.where({ id: author.id }),
    });
    // Rails: `assert_equal favs, fav2` compares arrays element-wise with AR
    // record `==` (class + id), not mapped ids. Mirror that with `equals`.
    expect(fav2.length).toEqual(favs.length);
    fav2.forEach((f: any, i: number) => {
      expect(f.equals(favs[i])).toBe(true);
    });
  });

  it("loading the association target should keep child records marked for destruction", async () => {
    const ship = await Ship.create({ name: "The good ship Dollypop" });
    const part = await (ship as any).parts.create({ name: "Mast" });
    markForDestruction(part);
    // Rails `ship.parts[0]` routes through load_target → merge_target_lists,
    // preserving in-memory records (marked-for-destruction kept); trails'
    // `toArray()` merges in-memory over DB rows the same way.
    const parts = await (ship as any).parts.toArray();
    expect(isMarkedForDestruction(parts[0])).toBe(true);
  });

  it("loading the association target should load most recent attributes for child records marked for destruction", async () => {
    const ship = await Ship.create({ name: "The good ship Dollypop" });
    const part = await (ship as any).parts.create({ name: "Mast" });
    markForDestruction(part);
    const reloaded = await ShipPart.find(part.id as number);
    await reloaded.updateColumn("name", "Deck");
    const parts = await (ship as any).parts.toArray();
    expect(parts[0].name).toBe("Deck");
  });

  it("include with order works", async () => {
    // Rails wraps both calls in `assert_nothing_raised` and runs two order
    // forms: `order: "id"` (raw SQL string) then `order: :id` (symbol → quoted
    // column reference). The hash form is the trails equivalent of the
    // symbol/column-reference form.
    let raised: unknown;
    try {
      await Account.all().order("id").includes("firm").first();
      await Account.all().order({ id: "asc" }).includes("firm").first();
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
    expect(scope._referencesValues).toEqual(["foo"]);
  });

  it("force reload", async () => {
    const firm = new Firm({ name: "A New Firm, Inc" });
    await firm.save();
    // forcing to load all clients
    for (const _ of await firm.clients.toArray()) {
      void _;
    }
    expect(await firm.clients.isEmpty()).toBe(true);
    expect(await firm.clients.size()).toBe(0);

    const client = new Client({ name: "TheClient.com", firm_id: firm.id });
    await client.save();

    // New firm should have cached no client objects / zero count.
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

    const comments = await association(blogPost, "comments").toArray();
    expect(comments.map((c: any) => c.id)).toContain((comment as any).id);
    expect(Number((comment as any).blog_post_id)).toBe(Number((blogPost as any).id));
    expect((comment as any).blog_id).toBe((blogPost as any).blog_id);
  });

  it("belongs to a model with composite foreign key finds associated record", async () => {
    const comment = shardedComments("great_comment_blog_post_one");
    const blogPost = shardedBlogPosts("great_post_blog_one");

    const loaded = await (comment as any).loadBelongsTo("blogPost");
    // Rails asserts full-record equality (assert_equal(blog_post, comment.blog_post));
    // check both composite-key components rather than just `id`.
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

    // Rails raises only when the association is loaded (`.to_a`), not when the
    // proxy is built — the FK is derived lazily inside `load_target`'s scope
    // build. Reading the accessor must NOT throw; awaiting/loading does.
    const proxy = blogPost.commentsWithoutQueryConstraints;
    await expect(proxy.toArray()).rejects.toThrow(
      // Full Rails message tail (omitting the owner class name, which differs
      // between Rails `Sharded::BlogPostWithRevision` and the trails class).
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
      "blogPostById",
    );
    const loaded = comments[0];
    // Rails reads `comment.blog_post_by_id` from the preloaded cache and compares
    // it to the directly-loaded `comment.blog_post`; read the preloaded record
    // rather than re-querying so the preload path is what gets verified.
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
    const comments = await association(blogPost, "comments").toArray();
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

    // Noise join row that collides on blog_post_id but not blog_id: a tag on a
    // different blog wired to this post's id via a deliberately cross-blog join
    // row. The composite through scope keys on [blog_id, blog_post_id], so it
    // must AND both columns — a regression to single-column (blog_post_id-only)
    // filtering would leak this row into `blogPost.tags`.
    const otherBlogId = (shardedBlogs("sharded_blog_two") as any).id;
    const noiseTag = await ShardedTag.create({ name: "Other Blog Tag", blog_id: otherBlogId });
    await ShardedBlogPostTag.create({
      blog_id: otherBlogId,
      blog_post_id: (blogPost as any).id,
      tag_id: (noiseTag as any).id,
    });

    await association(blogPost, "tags").push(tag);

    await blogPost.reload();
    const reloadedTags = await association(blogPost, "tags").toArray();
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
    // The autosave variant exists to prove `<<` saves the unsaved target before
    // building the join row (matching the canonical `append composite foreign key
    // has many association with autosave` above); assert that transition so the
    // test can't pass with a pre-persisted tag.
    expect(tag.isNewRecord()).toBe(true);

    await association(blogPost, "tags").push(tag);

    expect(tag.isPersisted()).toBe(true);
    await blogPost.reload();
    const reloadedTags = await association(blogPost, "tags").toArray();
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

    expect(await association(blogPost, "comments").toArray()).not.toHaveLength(0);
    await association(blogPost, "comments").replace([]);

    comment = (await ShardedComment.find((comment as any).id)) as never;
    expect((comment as any).blog_post_id).toBeNull();
    expect((comment as any).blog_id).toBeNull();

    expect(await association(blogPost, "comments").toArray()).toHaveLength(0);
    await blogPost.reload();
    expect(await association(blogPost, "comments").toArray()).toHaveLength(0);
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

    // Rails `comment.blog_post` returns the just-assigned in-memory target
    // (the new record is unsaved, so reading is from the association cache).
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

    // reload to forget the parent association
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
        await association(blogPost, "commentsWithoutSingleColumnQueryConstraints").toArray();
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
        await association(blogPost, "commentsWithoutMultipleColumnQueryConstraints").toArray();
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
    // Rails runs the primary-key-inclusion guard unconditionally: when the
    // owner has a composite PK, `owner_pk` is an array that is never an element
    // of the string-valued constraints list, so the guard always raises rather
    // than silently exempting composite-PK owners.
    const originalList = (ShardedBlogPost as any)._queryConstraintsList;
    const originalPk = (ShardedBlogPost as any)._primaryKey;
    const originalAssociations = [...((ShardedBlogPost as any)._associations ?? [])];
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
        await association(blogPost, "commentsWithCompositePkOwner").toArray();
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(ArgumentError);
      expect((error as Error).message).toContain("does not include the primary key");
    } finally {
      (ShardedBlogPost as any)._queryConstraintsList = originalList;
      (ShardedBlogPost as any)._primaryKey = originalPk;
      (ShardedBlogPost as any)._associations = originalAssociations;
    }
  });

  it("nullify composite has many through association", async () => {
    const blogPost = shardedBlogPosts("great_post_blog_one");
    expect((await association(blogPost, "tags").toArray()).length).toBeGreaterThan(0);

    await association(blogPost, "tags").replace([]);

    expect(await association(blogPost, "tags").toArray()).toEqual([]);
    await association(blogPost, "tags").reload();
    expect(await association(blogPost, "tags").toArray()).toEqual([]);
    expect(
      await ShardedBlogPostTag.where({
        blog_post_id: (blogPost as any).id,
        blog_id: (blogPost as any).blog_id,
      }).exists(),
    ).toBe(false);
  });

  // Exercises loadHasMany's inline (no-reflection) fallback against a
  // query_constraints owner: invoked with a composite FK and an unregistered
  // association name, the fallback must derive the owner key from the owner's
  // query_constraints (`[blog_id, id]`, mirroring
  // `reflection.activeRecordPrimaryKey`) rather than zipping the scalar `id`
  // against the 2-column FK (which would raise CompositePrimaryKeyMismatchError).
  it("has many loads via inline fallback resolving composite owner key from query constraints", async () => {
    const post = await ShardedBlogPost.create({ blog_id: 1, title: "Post" });
    await ShardedComment.create({ blog_id: 1, blog_post_id: (post as any).id, body: "A" });
    await ShardedComment.create({ blog_id: 1, blog_post_id: (post as any).id, body: "B" });
    await ShardedComment.create({ blog_id: 2, blog_post_id: (post as any).id, body: "Other" });
    const comments = await loadHasMany(post, "freshComments", {
      className: "ShardedComment",
      foreignKey: ["blog_id", "blog_post_id"],
    });
    expect(comments).toHaveLength(2);
    expect(comments.map((c) => (c as any).body).sort()).toEqual(["A", "B"]);
  });

  // Same no-reflection fallback path as the has_many case above, through loadHasOne.
  it("has one loads via inline fallback resolving composite owner key from query constraints", async () => {
    const post = await ShardedBlogPost.create({ blog_id: 7, title: "Post" });
    await ShardedComment.create({ blog_id: 7, blog_post_id: (post as any).id, body: "Only" });
    const comment = await loadHasOne(post, "freshComment", {
      className: "ShardedComment",
      foreignKey: ["blog_id", "blog_post_id"],
    });
    expect((comment as any)?.body).toBe("Only");
  });

  // Exercises the inline (no-reflection) fallback against a composite-PK owner
  // WITHOUT query_constraints (CpkOrder's PK is `[shop_id, id]`). Invoked with a
  // scalar FK and an unregistered association name, the fallback must collapse
  // the composite owner PK to `"id"` (mirroring the `composite_primary_key?`
  // branch of `reflection.activeRecordPrimaryKey`, reflection.rb:597-600) rather
  // than reading the whole `[shop_id, id]` array as a scalar attribute.
  it("has many loads via inline fallback resolving composite owner key as id attribute", async () => {
    const order = await CpkOrder.create({ shop_id: 1 });
    const [, orderId] = order.id as [number, number];
    await CpkOrderAgreement.create({ order_id: orderId, signature: "abc" });
    await CpkOrderAgreement.create({ order_id: orderId, signature: "def" });
    const agreements = await loadHasMany(order, "freshAgreements", {
      className: "CpkOrderAgreement",
      foreignKey: "order_id",
    });
    expect(agreements).toHaveLength(2);
    expect(agreements.map((a) => (a as any).signature).sort()).toEqual(["abc", "def"]);
  });

  // Same no-reflection fallback path as above, through loadHasOne.
  it("has one loads via inline fallback resolving composite owner key as id attribute", async () => {
    const order = await CpkOrder.create({ shop_id: 1 });
    const [, orderId] = order.id as [number, number];
    await CpkOrderAgreement.create({ order_id: orderId, signature: "only" });
    const agreement = await loadHasOne(order, "freshAgreement", {
      className: "CpkOrderAgreement",
      foreignKey: "order_id",
    });
    expect((agreement as any)?.signature).toBe("only");
  });

  // The inline (no-reflection) fallback must build from
  // `scope_for_association` (default scopes only), not the enclosing scoping
  // block's class `current_scope`. Inside `CpkOrderAgreement.where("1=0")
  // .scoping`, a `.all()`-based fallback would inherit `1=0` and return 0
  // agreements; Rails (and the converged reflection path) keep current_scope
  // off association reads, so both agreements still load.
  it("has many loads via inline fallback ignoring enclosing current_scope", async () => {
    const order = await CpkOrder.create({ shop_id: 1 });
    const [, orderId] = order.id as [number, number];
    await CpkOrderAgreement.create({ order_id: orderId, signature: "abc" });
    await CpkOrderAgreement.create({ order_id: orderId, signature: "def" });
    await (CpkOrderAgreement as any).where("1=0").scoping(async () => {
      const agreements = await loadHasMany(order, "freshAgreements", {
        className: "CpkOrderAgreement",
        foreignKey: "order_id",
      });
      expect(agreements).toHaveLength(2);
      expect(agreements.map((a) => (a as any).signature).sort()).toEqual(["abc", "def"]);
    });
  });

  // Exercises loadHasMany's inline (no-reflection) fallback for a POLYMORPHIC
  // (`as`) association on a query_constraints owner. The owner key must resolve
  // to the owner's query_constraints list (`[blog_id, id]`, mirroring
  // `reflection.activeRecordPrimaryKey`) and the scalar `parent_id` FK must
  // widen to the composite `[blog_id, parent_id]` (mirroring
  // `deriveFkQueryConstraints`) so a same-`parent_id` row in a DIFFERENT shard
  // is excluded — rather than keying on the scalar `id` alone, which would
  // wrongly include it.
  it("has many loads via inline fallback resolving polymorphic owner key from query constraints", async () => {
    const post = await ShardedBlogPost.create({ blog_id: 1, title: "Parent" });
    const pid = (post as any).id;
    await ShardedBlogPost.create({
      blog_id: 1,
      parent_id: pid,
      parent_type: "ShardedBlogPost",
      title: "match",
    });
    await ShardedBlogPost.create({
      blog_id: 2,
      parent_id: pid,
      parent_type: "ShardedBlogPost",
      title: "wrongShard",
    });
    const children = await loadHasMany(post, "freshChildren", {
      className: "ShardedBlogPost",
      as: "parent",
    });
    expect(children.map((c) => (c as any).title)).toEqual(["match"]);
  });

  // Same no-reflection polymorphic fallback path as above, through loadHasOne.
  it("has one loads via inline fallback resolving polymorphic owner key from query constraints", async () => {
    const post = await ShardedBlogPost.create({ blog_id: 7, title: "Parent" });
    const pid = (post as any).id;
    await ShardedBlogPost.create({
      blog_id: 7,
      parent_id: pid,
      parent_type: "ShardedBlogPost",
      title: "match",
    });
    await ShardedBlogPost.create({
      blog_id: 9,
      parent_id: pid,
      parent_type: "ShardedBlogPost",
      title: "wrongShard",
    });
    const child = await loadHasOne(post, "freshChild", {
      className: "ShardedBlogPost",
      as: "parent",
    });
    expect((child as any)?.title).toBe("match");
  });

  // `buildHasManyRelation` (the seeded scope behind CollectionProxy /
  // `.toSql()` / counts) shares `computeHasManyWhere`, which must apply the
  // same query_constraints widening: a polymorphic `as` scope on a
  // query_constraints owner keys on the composite `[blog_id, parent_id]` so a
  // cross-shard same-`parent_id` row is excluded from the relation itself,
  // not only from the AssociationScope load path.
  it("has many builds polymorphic relation keyed on owner query constraints", async () => {
    const post = await ShardedBlogPost.create({ blog_id: 1, title: "Parent" });
    const pid = (post as any).id;
    await ShardedBlogPost.create({
      blog_id: 1,
      parent_id: pid,
      parent_type: "ShardedBlogPost",
      title: "match",
    });
    await ShardedBlogPost.create({
      blog_id: 2,
      parent_id: pid,
      parent_type: "ShardedBlogPost",
      title: "wrongShard",
    });
    const rel = buildHasManyRelation(post, "freshChildren", {
      className: "ShardedBlogPost",
      as: "parent",
    });
    const rows: Base[] = await rel!.toArray();
    expect(rows.map((r) => (r as any).title)).toEqual(["match"]);
  });

  // The inline (no-reflection) polymorphic fallback mirrors
  // `deriveFkQueryConstraints` faithfully — including its ArgumentError raise
  // for an underivable query_constraints shape. A >2-attribute list
  // (`[blog_id, revision, id]` on `ShardedBlogPostWithRevision`) cannot be
  // derived, so the inline path must raise rather than silently scalar-keying.
  it("has many inline polymorphic fallback raises for underivable query constraints", async () => {
    const post = await ShardedBlogPostWithRevision.create({
      blog_id: 1,
      revision: 1,
      title: "Parent",
    });
    await expect(
      loadHasMany(post, "freshChildren", {
        className: "ShardedBlogPostWithRevision",
        as: "parent",
      }),
    ).rejects.toThrow(ArgumentError);
  });

  it("delete single composite has many through join row", async () => {
    // Covers the composite-aware delete on a has_many :through: the join lookup
    // must AND across both [blog_id, blog_post_id] columns so only the owning
    // join row is removed.
    const blogPost = shardedBlogPosts("great_post_blog_one");
    const tag = await ShardedTag.create({ name: "shared", blog_id: (blogPost as any).blog_id });
    await ShardedBlogPostTag.create({
      blog_id: (blogPost as any).blog_id,
      blog_post_id: (blogPost as any).id,
      tag_id: (tag as any).id,
    });

    // Noise join row colliding on blog_post_id + tag_id but a different blog_id;
    // a regression to single-column (blog_post_id-only) deletion would remove it.
    const otherBlogId = (shardedBlogs("sharded_blog_two") as any).id;
    await ShardedBlogPostTag.create({
      blog_id: otherBlogId,
      blog_post_id: (blogPost as any).id,
      tag_id: (tag as any).id,
    });

    await association(blogPost, "tags").delete(tag);

    // Only the owning composite join row is removed; the cross-blog noise row stays.
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
    // Target tag itself is untouched.
    expect(await ShardedTag.where({ id: (tag as any).id })).not.toHaveLength(0);
  });

  it("loading cpk association when persisted and in memory differ", async () => {
    const order = await CpkOrder.create({ shop_id: 1, id: 2, status: "paid" });
    await CpkBook.create({
      author_id: 3,
      id: 4,
      shop_id: 1,
      order_id: 2,
      title: "Book",
    });
    await CpkBook.where({ author_id: 3, id: 4 }).updateAll({ title: "A different title" });
    const books = await loadHasMany(order, "books", {
      foreignKey: ["shop_id", "order_id"],
      className: "CpkBook",
    });
    expect(books[0].id).toEqual([3, 4]);
  });
});
