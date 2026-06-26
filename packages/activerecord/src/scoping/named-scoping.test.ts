/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 * Mirrors: activerecord/test/cases/scoping/named_scoping_test.rb
 *
 * Every Rails test is ported with a faithful body against the canonical
 * `Topic`/`Post`/`Comment`/`Reply`/`Author`/`Developer` models and the real
 * `topics`/`posts`/`authors`/`comments` fixtures (the named scopes live on the
 * canonical models, exactly as Rails defines them on `topic.rb`/`post.rb`).
 * Cases that exercise behavior the engine does not yet implement (scope-body
 * callability guard, reserved/conflicting scope-name guard, positional
 * stats-mutating scopes) are kept as `it.skip` with a one-line note rather than
 * fabricated passing stubs, so their names stay tracked by test:compare.
 */
import { describe, it, expect } from "vitest";
import "../index.js";
import { registerModel } from "../index.js";
import { captureSql } from "../testing/sql-capture.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { adapterType } from "../test-adapter.js";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { Topic } from "../test-helpers/models/topic.js";
import { Reply } from "../test-helpers/models/reply.js";
import { Post, SpecialPost } from "../test-helpers/models/post.js";
import { Comment, SpecialComment, OopsError } from "../test-helpers/models/comment.js";
import { Author } from "../test-helpers/models/author.js";
import { Developer } from "../test-helpers/models/developer.js";

registerModel(Topic);
registerModel(Reply);
registerModel(Post);
registerModel(SpecialPost);
registerModel(Comment);
registerModel(SpecialComment);
registerModel(Author);
registerModel(Developer);

const ids = (rows: any[]) => rows.map((r) => r.id);
const sortedIds = (rows: any[]) => ids(rows).sort((a, b) => Number(a) - Number(b));
// Rails capture_sql(include_schema: false): drop introspection queries so the
// query counts match Rails' assert_queries_count.
const capSql = (fn: () => unknown) =>
  captureSql(fn as () => Promise<void>, { includeSchema: false });

describe("NamedScopingTest", () => {
  const { topics, posts, authors } = useHandlerFixtures(
    ["topics", "posts", "authors", "comments", "authorAddresses"],
    { schema: canonicalSchema },
  );

  it("implements enumerable", async () => {
    expect((await Topic.all().toArray()).length).toBeGreaterThan(0);
    expect(ids(await Topic.base().toArray())).toEqual(ids(await Topic.all().toArray()));
    expect((await (Topic as any).base().first()).id).toBe(((await Topic.first()) as any).id);
  });

  it("found items are cached", async () => {
    const allPosts = Topic.base();
    const sql = await capSql(async () => {
      await allPosts.toArray();
      await allPosts.toArray();
    });
    expect(sql.length).toBe(1);
  });

  it("reload expires cache of found items", async () => {
    const allPosts = Topic.base();
    await allPosts.toArray();

    const newPost = (await Topic.create({})) as any;
    expect(ids(await allPosts.toArray())).not.toContain(newPost.id);
    await allPosts.reload();
    expect(ids(await allPosts.toArray())).toContain(newPost.id);
  });

  it("delegates finds and calculations to the base class", async () => {
    expect((await Topic.all().toArray()).length).toBeGreaterThan(0);
    expect(ids(await Topic.base().toArray())).toEqual(ids(await Topic.all().toArray()));
    expect((await Topic.count()) as number).toBe(await Topic.base().count());
  });

  it("calling merge at first in scope", async () => {
    Topic.scope("callingMergeAtFirstInScope", (q: any) => q.merge(Topic.replied()));
    expect(ids(await (Topic as any).callingMergeAtFirstInScope().toArray())).toEqual(
      ids(await Topic.replied().toArray()),
    );
  });

  it("method missing priority when delegating", async () => {
    // Rails: klazz.to.since.to_a == klazz.since.to.to_a — chaining the two
    // scopes in either order yields the same conjunction/result set.
    const epoch = Temporal.Instant.fromEpochMilliseconds(0);
    const now = Temporal.Now.instant();
    Topic.scope("since", (q: any) => q.where("written_on >= ?", epoch));
    Topic.scope("to", (q: any) => q.where("written_on <= ?", now));
    expect(sortedIds(await (Topic as any).to().since().toArray())).toEqual(
      sortedIds(await (Topic as any).since().to().toArray()),
    );
  });

  it("define scope for reserved words", async () => {
    expect((await Topic.true().toArray()).every((t: any) => t.approved === true)).toBe(true);
    expect((await Topic.false().toArray()).every((t: any) => t.approved !== true)).toBe(true);
  });

  it("scope should respond to own methods and methods of the proxy", () => {
    const approved = Topic.approved();
    expect(typeof approved.limit).toBe("function");
    expect(typeof approved.count).toBe("function");
  });

  it("scopes with options limit finds to those matching the criteria specified", async () => {
    expect((await Topic.where({ approved: true }).toArray()).length).toBeGreaterThan(0);
    expect(sortedIds(await Topic.approved().toArray())).toEqual(
      sortedIds(await Topic.where({ approved: true }).toArray()),
    );
    expect(await Topic.approved().count()).toBe(await Topic.where({ approved: true }).count());
  });

  it("scopes with string name can be composed", async () => {
    expect(ids(await (Topic as any).replied().approved().toArray())).toEqual(
      ids(await (Topic as any).replied().approvedAsString().toArray()),
    );
  });

  it("scopes are composable", async () => {
    const approved = sortedIds(await Topic.where({ approved: true }).toArray());
    const replied = sortedIds(await Topic.where("replies_count > 0").toArray());
    expect(approved).not.toEqual(replied);
    expect(sortedIds(await (Topic as any).approved().replied().toArray())).toEqual(
      approved.filter((id) => replied.includes(id)),
    );
  });

  it("procedural scopes", async () => {
    const third = topics("third");
    const second = topics("second");
    const beforeThird = sortedIds(await Topic.where("written_on < ?", third.written_on).toArray());
    const beforeSecond = sortedIds(
      await Topic.where("written_on < ?", second.written_on).toArray(),
    );
    expect(beforeThird).not.toEqual(beforeSecond);
    expect(sortedIds(await Topic.writtenBefore(third.written_on).toArray())).toEqual(beforeThird);
    expect(sortedIds(await Topic.writtenBefore(second.written_on).toArray())).toEqual(beforeSecond);
  });

  it("procedural scopes returning nil", async () => {
    expect(sortedIds(await Topic.writtenBefore(null).toArray())).toEqual(
      sortedIds(await Topic.all().toArray()),
    );
  });

  // Rails' `scope_stats`/`klass_stats` mutate a passed stats hash with a `count`
  // side-effect and return the relation/self. trails counts asynchronously, so
  // the canonical Topic's `scopeStats` scope and `klassStats` class method are
  // async — the lone faithful divergence from Rails' synchronous `count`.
  it("positional scope method", async () => {
    const stats: { count?: number } = {};
    // scopeStats returns the relation (`self`); awaiting the async scope through
    // the thenable relation hydrates it, so `rows.length` is the relation count.
    const rows = await (Topic as any).all().scopeStats(stats);
    expect(rows.length).toBe(stats.count);
  });

  it("positional klass method", async () => {
    const stats: { count?: number } = {};
    const topics = await (Topic as any).all().klassStats(stats);
    expect(await topics.count()).toBe(stats.count);
  });

  it("scope with object", async () => {
    const objects = await Topic.withObject().toArray();
    expect(objects.length).toBeGreaterThan(0);
    expect(objects.every((t: any) => t.approved === true)).toBe(true);
  });

  it("scope with kwargs", async () => {
    const approved = await Topic.withKwargs(true).toArray();
    expect(approved.length).toBeGreaterThan(0);
    expect(approved.every((t: any) => t.approved === true)).toBe(true);

    const none = await Topic.withKwargs().toArray();
    expect(none.every((t: any) => t.approved !== true)).toBe(true);
  });

  it("has many associations have access to scopes", async () => {
    const containingA = await (Post as any).containingTheLetterA().toArray();
    expect(containingA.length).toBeGreaterThan(0);
    const david = authors("david");
    const davidPosts = await ((await Author.find(david.id)) as any).posts.toArray();
    expect(ids(davidPosts)).not.toEqual(ids(containingA));
    const expected = sortedIds(davidPosts.filter((p: any) => ids(containingA).includes(p.id)));
    const got = sortedIds(
      await ((await Author.find(david.id)) as any).posts.containingTheLetterA().toArray(),
    );
    expect(got).toEqual(expected);
  });

  it("scope with STI", async () => {
    expect(await (Post as any).containingTheLetterA().count()).toBe(
      await Post.where("body LIKE '%a%'").count(),
    );
    expect(await (SpecialPost as any).containingTheLetterA().count()).toBe(
      await SpecialPost.where("body LIKE '%a%'").count(),
    );
  });

  it("has many through associations have access to scopes", async () => {
    const containingE = await (Comment as any).containingTheLetterE().toArray();
    expect(containingE.length).toBeGreaterThan(0);
    const david = authors("david");
    const davidComments = await ((await Author.find(david.id)) as any).comments.toArray();
    const expected = sortedIds(davidComments.filter((c: any) => ids(containingE).includes(c.id)));
    const got = sortedIds(
      await ((await Author.find(david.id)) as any).comments.containingTheLetterE().toArray(),
    );
    expect(got).toEqual(expected);
  });

  // Rails: `Post.top(limit)` is `def self.top(limit); ranked_by_comments.limit_by(limit); end`,
  // so the bare `ranked_by_comments` call honors whatever current scope is in
  // effect — `authors(:david).posts.top(5)` ranks only david's posts. The class
  // method delegated onto a relation/association installs the relation as the
  // current scope for the duration of the call.
  it("scopes honor current scopes from when defined", async () => {
    const david = (await Author.find(authors("david").id)) as any;
    const postRanked = await (Post as any).rankedByComments().limitBy(5).toArray();
    const davidRanked = await david.posts.rankedByComments().limitBy(5).toArray();
    const postTop = await Post.top(5).toArray();
    const davidTop = await david.posts.top(5).toArray();

    expect(postRanked.length).toBeGreaterThan(0);
    expect(davidRanked.length).toBeGreaterThan(0);
    expect(ids(postRanked)).not.toEqual(ids(davidRanked));
    expect(ids(postTop)).not.toEqual(ids(davidTop));
    expect(sortedIds(davidRanked)).toEqual(sortedIds(davidTop));
    expect(ids(postRanked)).toEqual(ids(postTop));
  });

  it("scopes body is a callable", () => {
    const klass = class extends Post {};
    expect(() =>
      (klass as any).scope("containingTheLetterZ", Post.where("body LIKE '%z%'")),
    ).toThrow("The scope body needs to be callable.");
  });

  it("scopes name is relation method", () => {
    // trails Relation method names (Rails: records/to_ary/to_sql/explain).
    const conflicts = ["records", "toArray", "toSql", "explain"];
    for (const name of conflicts) {
      const klass = class extends Post {};
      expect(() => (klass as any).scope(name, (q: any) => q.where({ approved: true }))).toThrow(
        new RegExp(`You tried to define a scope named "${name}" on the model`),
      );
    }
  });

  it("active records have scope named  all  ", async () => {
    expect((await Topic.all().toArray()).length).toBeGreaterThan(0);
    expect(ids(await Topic.base().toArray())).toEqual(ids(await Topic.all().toArray()));
  });

  it("active records have scope named  scoped  ", async () => {
    const scope = Topic.where("content LIKE '%Have%'");
    expect((await scope.toArray()).length).toBeGreaterThan(0);
  });

  it("first and last should allow integers for limit", async () => {
    const ordered = await Topic.base().order("id").toArray();
    const first2 = await Topic.base().first(2);
    expect(ids(first2)).toEqual(ids(ordered.slice(0, 2)));
    const last2 = await Topic.base().last(2);
    expect(ids(last2)).toEqual(ids(ordered.slice(-2)));
  });

  it("first and last should not use query when results are loaded", async () => {
    const t = Topic.base();
    await t.load();
    const sql = await capSql(async () => {
      await t.first();
      await t.last();
    });
    expect(sql.length).toBe(0);
  });

  it("empty should not load results", async () => {
    const t = Topic.base();
    const sql = await capSql(async () => {
      await t.isEmpty(); // count query
      await t.load(); // force load
      await t.isEmpty(); // loaded, no query
    });
    expect(sql.length).toBe(2);
  });

  it("any should not load results", async () => {
    const t = Topic.base();
    const sql = await capSql(async () => {
      await t.isAny(); // count query
      await t.load(); // force load
      await t.isAny(); // loaded, no query
    });
    expect(sql.length).toBe(2);
  });

  it("any should call proxy found if using a block", async () => {
    // Rails: `topics.any? { true }` runs one query and never calls `empty?`.
    const t = Topic.base();
    const sql = await capSql(async () => {
      await t.isAny();
    });
    expect(sql.length).toBe(1);
  });

  it("any should not fire query if scope loaded", async () => {
    const t = Topic.base();
    await t.load();
    const sql = await capSql(async () => {
      expect(await t.isAny()).toBe(true);
    });
    expect(sql.length).toBe(0);
  });

  it("model class should respond to any", async () => {
    expect(await Topic.isAny()).toBe(true);
    await Topic.deleteAll();
    expect(await Topic.isAny()).toBe(false);
  });

  it("many should not load results", async () => {
    const t = Topic.base();
    const sql = await capSql(async () => {
      await t.isMany(); // count query
      await t.load(); // force load
      await t.isMany(); // loaded, no query
    });
    expect(sql.length).toBe(2);
  });

  it("many should call proxy found if using a block", async () => {
    const t = Topic.base();
    const sql = await capSql(async () => {
      await t.isMany();
    });
    expect(sql.length).toBe(1);
  });

  it("many should not fire query if scope loaded", async () => {
    const t = Topic.base();
    await t.load();
    const sql = await capSql(async () => {
      expect(await t.isMany()).toBe(true);
    });
    expect(sql.length).toBe(0);
  });

  it("many should return false if none or one", async () => {
    expect(await Topic.base().where({ id: 0 }).isMany()).toBe(false);
    expect(await Topic.base().where({ id: 1 }).isMany()).toBe(false);
  });

  it("many should return true if more than one", async () => {
    expect(await Topic.base().isMany()).toBe(true);
  });

  it("model class should respond to many", async () => {
    await Topic.deleteAll();
    expect(await Topic.isMany()).toBe(false);
    await Topic.create({});
    expect(await Topic.isMany()).toBe(false);
    await Topic.create({});
    expect(await Topic.isMany()).toBe(true);
  });

  it("should build on top of scope", async () => {
    const topic = Topic.approved().build({});
    expect(topic.approved).toBe(true);
  });

  it("should build new on top of scope", async () => {
    const topic = Topic.approved().new({});
    expect(topic.approved).toBe(true);
  });

  it("should create on top of scope", async () => {
    const topic = await Topic.approved().create({});
    expect(topic.approved).toBe(true);
  });

  it("should create with bang on top of scope", async () => {
    const topic = await Topic.approved().create({});
    expect(topic.approved).toBe(true);
  });

  it("should build on top of chained scopes", async () => {
    const topic = (Topic as any).approved().byLifo().build({});
    expect(topic.approved).toBe(true);
    expect(topic.author_name).toBe("lifo");
  });

  it("reserved scope names", () => {
    class ReservedKlass extends Topic {
      static pub() {}
      static pri() {}
      static pro() {}
    }
    (ReservedKlass as any).scope("approved", (q: any) => q.where({ approved: true }));
    class ReservedSubklass extends ReservedKlass {}

    const conflicts = [
      "create",
      "relation",
      "new",
      "all",
      "public",
      "protected",
      "private",
      "name",
      "superclass",
    ];
    for (const name of conflicts) {
      const re = new RegExp(`You tried to define a scope named "${name}" on the model`);
      expect(() =>
        (ReservedKlass as any).scope(name, (q: any) => q.where({ approved: true })),
      ).toThrow(re);
      expect(() =>
        (ReservedSubklass as any).scope(name, (q: any) => q.where({ approved: true })),
      ).toThrow(re);
    }

    const nonConflicts = ["findByTitle", "approved", "pub", "pri", "pro", "open"];
    for (const name of nonConflicts) {
      expect(() =>
        (ReservedKlass as any).scope(name, (q: any) => q.where({ approved: true })),
      ).not.toThrow();
      expect(() =>
        (ReservedSubklass as any).scope(name, (q: any) => q.where({ approved: true })),
      ).not.toThrow();
    }
  });

  it("spaces in scope names", async () => {
    // Rails defines `scope :"title containing space", ->(space: " ") { ... }`
    // and dispatches via `public_send(:"title containing space", space: " ")`.
    Topic.scope("title containing space", (q: any, opts: { space?: string } = {}) =>
      q.where(`title LIKE '%${opts.space ?? " "}%'`),
    );
    const expected = sortedIds(await Topic.where("title LIKE '% %'").toArray());
    const got = sortedIds(await (Topic as any)["title containing space"]({ space: " " }).toArray());
    expect(got).toEqual(expected);
    // (2) chained onto an already-constrained relation: the space-named scope
    // must not reset the prior `approved` condition.
    const chainedExpected = sortedIds(await Topic.approved().where("title LIKE '% %'").toArray());
    const chainedGot = sortedIds(
      await (Topic as any).approved()["title containing space"]({ space: " " }).toArray(),
    );
    expect(chainedGot).toEqual(chainedExpected);
  });

  // Permanently descoped: Rails asserts `to_a.select(&:approved) ==
  // to_a.find_all(&:approved)` — i.e. Ruby Array#select and Array#find_all are
  // aliases. trails materializes to a plain JS array with only `.filter`, so
  // there is no distinct relation method to compare; the case has no meaningful
  // trails analog and never will.
  it.skip("find all should behave like select", () => {});

  it("rand should select a random object from proxy", async () => {
    const randomFn = adapterType === "mysql" ? "RAND()" : "RANDOM()";
    const sample = await Topic.approved().order(randomFn).first();
    expect(sample).toBeInstanceOf(Topic);
  });

  it("should use where in query for scope", async () => {
    const byName = sortedIds(await Developer.where({ name: "Jamis" }).toArray());
    const byScope = sortedIds(
      await Developer.where({ id: Developer.jamises().select("id") }).toArray(),
    );
    expect(byScope).toEqual(byName);
  });

  it("size should use count when results are not loaded", async () => {
    const t = Topic.base();
    const sql = await capSql(async () => {
      await t.size();
    });
    expect(sql.length).toBe(1);
    expect(sql[0]).toMatch(/COUNT/i);
  });

  it("size should use length when results are loaded", async () => {
    const t = Topic.base();
    await t.load();
    const sql = await capSql(async () => {
      await t.size();
    });
    expect(sql.length).toBe(0);
  });

  it("should not duplicates where values", () => {
    // Rails: relation.where_clause == relation.scope_with_lambda.where_clause —
    // calling the scope on the already-conditioned relation must not duplicate
    // the WHERE clause.
    const relation = Topic.where("1=1");
    expect(relation.toSql()).toBe((relation as any).scopeWithLambda().toSql());
  });

  it("chaining with duplicate joins", async () => {
    const join = "INNER JOIN comments ON comments.post_id = posts.id";
    const post = (await Post.find(1)) as any;
    const expected = await post.comments.size();
    const got = await Post.joins(join).joins(join).where(`posts.id = ${post.id}`).size();
    expect(got).toBe(expected);
  });

  it("chaining applies last conditions when creating", () => {
    expect(Topic.rejected().new({}).approved).toBe(false);
    expect((Topic as any).rejected().approved().new({}).approved).toBe(true);
    expect((Topic as any).approved().rejected().new({}).approved).toBe(false);
    expect((Topic as any).approved().rejected().approved().new({}).approved).toBe(true);
  });

  it("chaining combines conditions when searching", async () => {
    // Normal hash conditions
    expect(sortedIds(await (Topic as any).rejected().approved().toArray())).toEqual(
      sortedIds(await Topic.where({ approved: false }).where({ approved: true }).toArray()),
    );
    expect(sortedIds(await (Topic as any).approved().rejected().toArray())).toEqual(
      sortedIds(await Topic.where({ approved: true }).where({ approved: false }).toArray()),
    );
    // Nested hash conditions with same keys
    expect(await (Post as any).withSpecialComments().withVerySpecialComments().toArray()).toEqual(
      [],
    );
    // Nested hash conditions with different keys
    const sti = posts("sti_comments");
    const uniq = [...new Set(ids(await (Post as any).withSpecialComments().withPost(4).toArray()))];
    expect(uniq).toEqual([sti.id]);
  });

  it("class method in scope", async () => {
    // Reply.ordered = `-> { Reply.order(:id) }` references the class, escaping
    // the approved_replies association's parent_id constraint, so it returns
    // BOTH approved replies (second + fourth) regardless of parent.
    const first = (await Topic.find(topics("first").id)) as any;
    const rows = await first.approvedReplies.ordered().toArray();
    expect(ids(rows)).toEqual([topics("second").id, topics("fourth").id]);
  });

  it("chaining doesnt leak conditions to another scopes", async () => {
    const expected = Topic.where({ approved: false }).where({
      id: Topic.children().select("parent_id"),
    });
    expect(sortedIds(await (Topic as any).rejected().hasChildren().toArray())).toEqual(
      sortedIds(await expected.toArray()),
    );
  });

  // Rails: `Topic.rejected.nested_scoping(expected)` where
  // `def self.nested_scoping(scope); scope.base; end`. The class method, called
  // on the `rejected` relation, returns `scope.base` (the passed relation under
  // its own `base`/`all` scope) — independent of the receiver's `rejected` scope.
  it("nested scoping", async () => {
    const expected = Reply.approved();
    const got = await (Topic as any).rejected().nestedScoping(expected).toArray();
    expect(ids(got)).toEqual(ids(await expected.toArray()));
  });

  it("scopes batch finders", async () => {
    const approvedCount = await Topic.approved().count();
    const collected: any[] = [];
    for await (const t of Topic.approved().findEach({ batchSize: 1 })) {
      expect(t.approved).toBe(true);
      collected.push(t);
    }
    expect(collected.length).toBe(approvedCount);

    // Rails also exercises find_in_batches(batch_size: 2) over the same scope.
    const grouped: any[] = [];
    for await (const group of Topic.approved().findInBatches({ batchSize: 2 })) {
      for (const t of group) {
        expect(t.approved).toBe(true);
        grouped.push(t);
      }
    }
    expect(grouped.length).toBe(approvedCount);
  });

  it("table names for chaining scopes with and without table name included", async () => {
    // Rails assert_nothing_raised: the chained scopes (one bare column, one
    // table-qualified) must build and execute without raising.
    const rows = await (Comment as any).forFirstPost().forFirstAuthor().toArray();
    expect(Array.isArray(rows)).toBe(true);
  });

  it("scopes on relations", async () => {
    const approvedTopics = (Topic as any).all().approved().order("id DESC");
    expect((await approvedTopics.first()).id).toBe(topics("fifth").id);
    const repliedApproved = approvedTopics.replied();
    expect((await repliedApproved.first()).id).toBe(topics("third").id);
  });

  it("index on scope", async () => {
    const approved = Topic.approved().order("id ASC");
    const arr = await approved.toArray();
    expect(arr[0].id).toBe(topics("second").id);
    expect(approved.isLoaded).toBe(true);
  });

  it("nested scopes queries size", async () => {
    const sql = await capSql(async () => {
      await (Topic as any)
        .approved()
        .byLifo()
        .replied()
        .writtenBefore(Temporal.Now.instant())
        .toArray();
    });
    expect(sql.length).toBe(1);
  });

  it("scopes are cached on associations", async () => {
    const post = (await Post.find(posts("welcome").id)) as any;
    await Post.cache(async () => {
      const first = await capSql(async () => {
        await post.comments.containingTheLetterE().toArray();
      });
      expect(first.length).toBe(1);

      const second = await capSql(async () => {
        await post.comments.containingTheLetterE().toArray();
      });
      expect(second.length).toBe(0);
    });
  });

  it("scopes with arguments are cached on associations", async () => {
    const post = (await Post.find(posts("welcome").id)) as any;
    await Post.cache(async () => {
      let one: any[] = [];
      const firstOne = await capSql(async () => {
        one = await post.comments.limitBy(1).toArray();
      });
      expect(firstOne.length).toBe(1);
      expect(one.length).toBe(1);

      let two: any[] = [];
      const firstTwo = await capSql(async () => {
        two = await post.comments.limitBy(2).toArray();
      });
      expect(firstTwo.length).toBe(1);
      expect(two.length).toBe(2);

      const cachedOne = await capSql(async () => {
        await post.comments.limitBy(1).toArray();
      });
      expect(cachedOne.length).toBe(0);

      const cachedTwo = await capSql(async () => {
        await post.comments.limitBy(2).toArray();
      });
      expect(cachedTwo.length).toBe(0);
    });
  });

  // Rails' `newest` is a `comments` association-extension method on Post
  // (`has_many :comments do def newest; created.last; end end`,
  // post.rb:81-83), body `created.last` — `created` is the `Comment.created`
  // named scope resolved on the extension's `self`.
  it("scopes to get newest", async () => {
    const post = (await Post.find(posts("welcome").id)) as any;
    const oldLastComment = await post.comments.newest();
    const newComment = await post.comments.create({ body: "My new comment" });
    expect((await post.comments.newest()).id).toBe(newComment.id);
    expect((await post.comments.newest()).id).not.toBe(oldLastComment.id);
  });

  it("scopes are reset on association reload", async () => {
    const post = (await Post.find(posts("welcome").id)) as any;

    for (const method of ["destroyAll", "reset", "deleteAll"] as const) {
      const before = post.comments.containingTheLetterE();
      // trails-specific (RFC 0030): trails memoizes named-scope relations per
      // association load, so a second call before the reset hands back the SAME
      // object. (Rails rebuilds each call, so this `toBe` would NOT hold there —
      // it asserts trails' added cache.) This is what gives the post-reset
      // `not.toBe` below its teeth; without the cache it would pass trivially.
      expect(post.comments.containingTheLetterE()).toBe(before);
      // Mirror Rails' `post.association(:comments).public_send(method)`: drive
      // the reset through the association object, not the proxy reader.
      await post.association("comments")[method]();
      // Rails' `assert_not_same`; here the reset invalidates trails' named-scope
      // memo so the next call rebuilds a fresh relation.
      expect(post.comments.containingTheLetterE()).not.toBe(before);
    }

    // Guard the destructive methods actually ran (not dead calls): destroyAll +
    // deleteAll removed every comment on `welcome`.
    expect(await Comment.where({ post_id: post.id }).count()).toBe(0);
  });

  it("scoped are lazy loaded if table still does not exist", async () => {
    // Rails: `assert_nothing_raised { require "models/without_table" }` — the
    // default_scope lambda must not query the (absent) table at definition
    // time. Importing the model (declaring the class + default scope) must not
    // throw.
    const mod = await import("../test-helpers/models/without-table.js");
    expect(mod.WithoutTable).toBeDefined();
  });

  it("eager default scope relations are remove", () => {
    const welcome = posts("welcome");
    const klass = class extends Post {};
    expect(() => (klass as any).defaultScope(Post.where({ id: welcome.id }))).toThrow();
  });

  it("subclass merges scopes properly", async () => {
    expect(await (SpecialComment as any).where({ body: "go wild" }).created().count()).toBe(1);
  });

  it("model class should respond to extending", () => {
    // Rails: Comment.unscoped.oops_comments.destroy_all raises OopsError from
    // the OopsExtension `destroy_all` override the scope extends onto its
    // relation.
    expect(() => (Comment as any).unscoped().oopsComments().destroyAll()).toThrow(OopsError);
  });

  it("model class should respond to none", async () => {
    expect(await Topic.isNone()).toBe(false);
    await Topic.deleteAll();
    expect(await Topic.isNone()).toBe(true);
  });

  it("model class should respond to one", async () => {
    expect(await Topic.isOne()).toBe(false);
    await Topic.deleteAll();
    expect(await Topic.isOne()).toBe(false);
    await Topic.create({});
    expect(await Topic.isOne()).toBe(true);
  });

  it("scope with annotation", async () => {
    Topic.scope("includingAnnotateInScope", (q: any) => q.annotate("from-scope"));
    const sql = (Topic as any).includingAnnotateInScope().toSql();
    expect(sql).toContain("from-scope");
    // Rails also asserts the annotation does not filter records.
    expect(sortedIds(await (Topic as any).includingAnnotateInScope().toArray())).toEqual(
      sortedIds(await Topic.all().toArray()),
    );
  });
});
