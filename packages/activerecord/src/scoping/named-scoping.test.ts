import { describe, it, expect } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import {
  assertNotCalled,
  assertNotEmpty,
  assertNothingRaised,
  assertRaises,
  assertRespondTo,
} from "@blazetrails/activesupport";
import "../index.js";
import { registerModel } from "../index.js";
import {
  assertNoQueries,
  assertQueriesCount,
  assertQueriesMatch,
} from "../testing/query-assertions.js";
import { fixtures } from "../test-fixtures.js";
import { adapterType } from "../test-adapter.js";
import { Temporal } from "@blazetrails/date";
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

describe("NamedScopingTest", () => {
  const { topics, posts, authors } = fixtures([
    "topics",
    "posts",
    "authors",
    "comments",
    "authorAddresses",
  ]);

  it("implements enumerable", async () => {
    assertNotEmpty(await Topic.all());

    expect(ids(await Topic.base())).toEqual(ids(await Topic.all()));
    expect(ids(await Topic.base())).toEqual(ids(await Topic.all()));
    expect((await Topic.base().first())!.id).toBe((await Topic.first())!.id);
    expect(ids((await Topic.base()).map((i: any) => i))).toEqual(ids(await Topic.all()));
  });

  it("found items are cached", async () => {
    const allPosts = Topic.base();
    await assertQueriesCount(1, false, async () => {
      await allPosts;
      await allPosts;
    });
  });

  it("reload expires cache of found items", async () => {
    const allPosts = Topic.base();
    await allPosts;

    const newPost = (await Topic.create({})) as any;
    expect(ids(await allPosts)).not.toContain(newPost.id);
    await allPosts.reload();
    expect(ids(await allPosts)).toContain(newPost.id);
  });

  it("delegates finds and calculations to the base class", async () => {
    assertNotEmpty(await Topic.all());

    expect(ids(await Topic.base())).toEqual(ids(await Topic.all()));
    expect((await Topic.base().first())!.id).toBe((await Topic.first())!.id);
    expect((await Topic.count()) as number).toBe(await Topic.base().count());
    expect(await Topic.average("replies_count")).toEqual(
      await Topic.base().average("replies_count"),
    );
  });

  it("calling merge at first in scope", async () => {
    Topic.scope("callingMergeAtFirstInScope", function (this: any) {
      return this.merge(Topic.replied());
    });
    expect(ids(await (Topic as any).callingMergeAtFirstInScope().toArray())).toEqual(
      ids(await Topic.replied()),
    );
  });

  it("method missing priority when delegating", async () => {
    const epoch = Temporal.Instant.fromEpochMilliseconds(0);
    const now = Temporal.Now.instant();
    Topic.scope("since", function (this: any) {
      return this.where("written_on >= ?", epoch);
    });
    Topic.scope("to", function (this: any) {
      return this.where("written_on <= ?", now);
    });
    expect(sortedIds(await (Topic as any).to().since().toArray())).toEqual(
      sortedIds(await (Topic as any).since().to().toArray()),
    );
  });

  it("define scope for reserved words", async () => {
    expect((await Topic.true()).every((t: any) => t.approved === true)).toBeTruthy();
    expect((await Topic.false()).every((t: any) => t.approved !== true)).toBeTruthy();
  });

  it("scope should respond to own methods and methods of the proxy", () => {
    assertRespondTo(Topic.approved(), "limit");
    assertRespondTo(Topic.approved(), "count");
    assertRespondTo(Topic.approved(), "length");
  });

  it("scopes with options limit finds to those matching the criteria specified", async () => {
    assertNotEmpty(await Topic.where({ approved: true }));
    expect(sortedIds(await Topic.approved())).toEqual(
      sortedIds(await Topic.where({ approved: true })),
    );
    expect(await Topic.approved().count()).toBe(await Topic.where({ approved: true }).count());
  });

  it("scopes with string name can be composed", async () => {
    expect(ids(await (Topic as any).replied().approved().toArray())).toEqual(
      ids(await (Topic as any).replied().approvedAsString().toArray()),
    );
  });

  it("scopes are composable", async () => {
    const approved = sortedIds(await Topic.where({ approved: true }));
    expect(sortedIds(await Topic.approved())).toEqual(approved);
    const replied = sortedIds(await Topic.where("replies_count > 0"));
    expect(sortedIds(await Topic.replied())).toEqual(replied);
    expect(
      approved.length === replied.length && approved.every((id, i) => id === replied[i]),
    ).toBeFalsy();
    const both = approved.filter((id) => replied.includes(id));
    assertNotEmpty(both);

    expect(sortedIds(await (Topic as any).approved().replied().toArray())).toEqual(both);
  });

  it("procedural scopes", async () => {
    const third = topics("third");
    const second = topics("second");
    const beforeThird = sortedIds(await Topic.where("written_on < ?", third.written_on));
    const beforeSecond = sortedIds(await Topic.where("written_on < ?", second.written_on));
    expect(beforeThird).not.toEqual(beforeSecond);
    expect(sortedIds(await Topic.writtenBefore(third.written_on))).toEqual(beforeThird);
    expect(sortedIds(await Topic.writtenBefore(second.written_on))).toEqual(beforeSecond);
  });

  it("procedural scopes returning nil", async () => {
    expect(sortedIds(await Topic.writtenBefore(null))).toEqual(sortedIds(await Topic.all()));
  });

  it("positional scope method", async () => {
    const stats: { count?: number } = {};
    const rows = await (Topic as any).all().scopeStats(stats);
    expect(rows.length).toBe(stats.count);
  });

  it("positional klass method", async () => {
    const stats: { count?: number } = {};
    const topics = await (Topic as any).all().klassStats(stats);
    expect(await topics.count()).toBe(stats.count);
  });

  it("scope with object", async () => {
    const objects = await Topic.withObject();
    expect(objects.length).toBeGreaterThan(0);
    expect(objects.every((t: any) => t.approved === true)).toBeTruthy();
  });

  it("scope with kwargs", async () => {
    const approved = await Topic.withKwargs(true);
    expect(approved.length).toBeGreaterThan(0);
    expect(approved.every((t: any) => t.approved === true)).toBeTruthy();

    const none = await Topic.withKwargs();
    expect(none.length).toBeGreaterThan(0);
    expect(none.every((t: any) => t.approved !== true)).toBeTruthy();
  });

  it("has many associations have access to scopes", async () => {
    const containingA = await (Post as any).containingTheLetterA().toArray();
    assertNotEmpty(containingA);
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
    assertNotEmpty(containingE);
    const david = authors("david");
    const davidComments = await ((await Author.find(david.id)) as any).comments.toArray();
    expect(ids(davidComments)).not.toEqual(ids(containingE));
    const expected = sortedIds(davidComments.filter((c: any) => ids(containingE).includes(c.id)));
    const got = sortedIds(
      await ((await Author.find(david.id)) as any).comments.containingTheLetterE().toArray(),
    );
    expect(got).toEqual(expected);
  });

  it("scopes honor current scopes from when defined", async () => {
    const david = (await Author.find(authors("david").id)) as any;
    const postRanked = await (Post as any).rankedByComments().limitBy(5).toArray();
    const davidRanked = await david.posts.rankedByComments().limitBy(5).toArray();
    const postTop = await Post.top(5).toArray();
    const davidTop = await david.posts.top(5).toArray();

    assertNotEmpty(postRanked);
    assertNotEmpty(davidRanked);
    expect(ids(postRanked)).not.toEqual(ids(davidRanked));
    expect(ids(postTop)).not.toEqual(ids(davidTop));
    expect(sortedIds(davidRanked)).toEqual(sortedIds(davidTop));
    expect(ids(postRanked)).toEqual(ids(postTop));
  });

  it("scopes body is a callable", async () => {
    const klass = class extends Post {};
    const e = await assertRaises([ArgumentError], {}, () =>
      (klass as any).scope("containingTheLetterZ", Post.where("body LIKE '%z%'")),
    );
    expect(e.message).toBe("The scope body needs to be callable.");
  });

  it("scopes name is relation method", async () => {
    const conflicts = ["records", "toArray", "toSql", "explain"];
    for (const name of conflicts) {
      const klass = class extends Post {};
      const e = await assertRaises([ArgumentError], {}, () =>
        (klass as any).scope(name, function (this: any) {
          return this.where({ approved: true });
        }),
      );
      expect(e.message).toMatch(
        new RegExp(`You tried to define a scope named "${name}" on the model`),
      );
    }
  });

  it("active records have scope named  all  ", async () => {
    assertNotEmpty(await Topic.all());

    expect(ids(await Topic.base())).toEqual(ids(await Topic.all()));
  });

  it("active records have scope named  scoped  ", async () => {
    const scope = Topic.where("content LIKE '%Have%'");
    assertNotEmpty(await scope);

    expect(sortedIds(await scope)).toEqual(
      sortedIds(await Topic.all().mergeBang({ where: "content LIKE '%Have%'" })),
    );
  });

  it("first and last should allow integers for limit", async () => {
    const ordered = await Topic.base().order("id");
    const first2 = await Topic.base().first(2);
    expect(ids(first2)).toEqual(ids(ordered.slice(0, 2)));
    const last2 = await Topic.base().last(2);
    expect(ids(last2)).toEqual(ids(ordered.slice(-2)));
  });

  it("first and last should not use query when results are loaded", async () => {
    const t = Topic.base();
    await t.load();
    await assertNoQueries(false, async () => {
      await t.first();
      await t.last();
    });
  });

  it("empty should not load results", async () => {
    const t = Topic.base();
    await assertQueriesCount(2, false, async () => {
      await t.isEmpty();
      await t.load();
      await t.isEmpty();
    });
  });

  it("any should not load results", async () => {
    const t = Topic.base();
    await assertQueriesCount(2, false, async () => {
      await t.isAny();
      await t.load();
      await t.isAny();
    });
  });

  it("any should call proxy found if using a block", async () => {
    const t = Topic.base();
    await assertQueriesCount(1, false, async () => {
      await assertNotCalled(t, "isEmpty", null, async () => {
        await t.isAny(() => true);
      });
    });
  });

  it("any should not fire query if scope loaded", async () => {
    const t = Topic.base();
    await t.load();
    await assertNoQueries(false, async () => {
      expect(await t.isAny()).toBeTruthy();
    });
  });

  it("model class should respond to any", async () => {
    expect(await Topic.isAny()).toBeTruthy();
    await Topic.deleteAll();
    expect(await Topic.isAny()).toBeFalsy();
  });

  it("many should not load results", async () => {
    const t = Topic.base();
    await assertQueriesCount(2, false, async () => {
      await t.isMany();
      await t.load();
      await t.isMany();
    });
  });

  it("many should call proxy found if using a block", async () => {
    const t = Topic.base();
    await assertQueriesCount(1, false, async () => {
      await assertNotCalled(t, "size", null, async () => {
        await t.isMany(() => true);
      });
    });
  });

  it("many should not fire query if scope loaded", async () => {
    const t = Topic.base();
    await t.load();
    await assertNoQueries(false, async () => {
      expect(await t.isMany()).toBeTruthy();
    });
  });

  it("many should return false if none or one", async () => {
    expect(await Topic.base().where({ id: 0 }).isMany()).toBeFalsy();
    expect(await Topic.base().where({ id: 1 }).isMany()).toBeFalsy();
  });

  it("many should return true if more than one", async () => {
    expect(await Topic.base().isMany()).toBeTruthy();
  });

  it("model class should respond to many", async () => {
    await Topic.deleteAll();
    expect(await Topic.isMany()).toBeFalsy();
    await Topic.create({});
    expect(await Topic.isMany()).toBeFalsy();
    await Topic.create({});
    expect(await Topic.isMany()).toBeTruthy();
  });

  it("should build on top of scope", async () => {
    const topic = Topic.approved().build({});
    expect(topic.approved).toBeTruthy();
  });

  it("should build new on top of scope", async () => {
    const topic = Topic.approved().new({});
    expect(topic.approved).toBeTruthy();
  });

  it("should create on top of scope", async () => {
    const topic = await Topic.approved().create({});
    expect(topic.approved).toBeTruthy();
  });

  it("should create with bang on top of scope", async () => {
    const topic = await Topic.approved().createBang({});
    expect(topic.approved).toBeTruthy();
  });

  it("should build on top of chained scopes", async () => {
    const topic = (Topic as any).approved().byLifo().build({});
    expect(topic.approved).toBeTruthy();
    expect(topic.author_name).toBe("lifo");
  });

  it("reserved scope names", async () => {
    class ReservedKlass extends Topic {
      static pub() {}
      static pri() {}
      static pro() {}
    }
    (ReservedKlass as any).scope("approved", function (this: any) {
      return this.where({ approved: true });
    });
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
      let e = await assertRaises([ArgumentError], {}, () =>
        (ReservedKlass as any).scope(name, function (this: any) {
          return this.where({ approved: true });
        }),
      );
      expect(e.message).toMatch(re);

      e = await assertRaises([ArgumentError], {}, () =>
        (ReservedSubklass as any).scope(name, function (this: any) {
          return this.where({ approved: true });
        }),
      );
      expect(e.message).toMatch(re);
    }

    const nonConflicts = ["findByTitle", "approved", "pub", "pri", "pro", "open"];
    for (const name of nonConflicts) {
      await assertNothingRaised(() =>
        (ReservedKlass as any).scope(name, function (this: any) {
          return this.where({ approved: true });
        }),
      );

      await assertNothingRaised(() =>
        (ReservedSubklass as any).scope(name, function (this: any) {
          return this.where({ approved: true });
        }),
      );
    }
  });

  it("spaces in scope names", async () => {
    Topic.scope("title containing space", function (this: any, opts: { space?: string } = {}) {
      return this.where(`title LIKE '%${opts.space ?? " "}%'`);
    });
    const expected = sortedIds(await Topic.where("title LIKE '% %'"));
    const got = sortedIds(await (Topic as any)["title containing space"]({ space: " " }).toArray());
    expect(got).toEqual(expected);
    const chainedExpected = sortedIds(await Topic.approved().where("title LIKE '% %'"));
    const chainedGot = sortedIds(
      await (Topic as any).approved()["title containing space"]({ space: " " }).toArray(),
    );
    expect(chainedGot).toEqual(chainedExpected);
  });

  it.skip("find all should behave like select", () => {});

  it("rand should select a random object from proxy", async () => {
    const randomFn = adapterType === "mysql" ? "RAND()" : "RANDOM()";
    const sample = await Topic.approved().order(randomFn).first();
    expect(sample).toBeInstanceOf(Topic);
  });

  it("should use where in query for scope", async () => {
    const byName = sortedIds(await Developer.where({ name: "Jamis" }));
    const byScope = sortedIds(await Developer.where({ id: Developer.jamises().select("id") }));
    expect(byScope).toEqual(byName);
  });

  it("size should use count when results are not loaded", async () => {
    const t = Topic.base();
    await assertQueriesCount(1, false, async () => {
      await assertQueriesMatch(/COUNT/i, undefined, false, () => t.size());
    });
  });

  it("size should use length when results are loaded", async () => {
    const t = Topic.base();
    await t.load();
    await assertNoQueries(false, async () => {
      await t.size();
    });
  });

  it("should not duplicates where values", () => {
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
    let post = Topic.rejected().new({});
    expect(post.approved).toBeFalsy();

    post = (Topic as any).rejected().approved().new({});
    expect(post.approved).toBeTruthy();

    post = (Topic as any).approved().rejected().new({});
    expect(post.approved).toBeFalsy();

    post = (Topic as any).approved().rejected().approved().new({});
    expect(post.approved).toBeTruthy();
  });

  it("chaining combines conditions when searching", async () => {
    expect(sortedIds(await (Topic as any).rejected().approved().toArray())).toEqual(
      sortedIds(await Topic.where({ approved: false }).where({ approved: true })),
    );
    expect(sortedIds(await (Topic as any).approved().rejected().toArray())).toEqual(
      sortedIds(await Topic.where({ approved: true }).where({ approved: false })),
    );
    expect(await (Post as any).withSpecialComments().withVerySpecialComments().toArray()).toEqual(
      [],
    );
    const sti = posts("sti_comments");
    const uniq = [...new Set(ids(await (Post as any).withSpecialComments().withPost(4).toArray()))];
    expect(uniq).toEqual([sti.id]);
  });

  it("class method in scope", async () => {
    const first = (await Topic.find(topics("first").id)) as any;
    const rows = await first.approvedReplies.ordered().toArray();
    expect(ids(rows)).toEqual([topics("second").id, topics("fourth").id]);
  });

  it("chaining doesnt leak conditions to another scopes", async () => {
    const expected = Topic.where({ approved: false }).where({
      id: Topic.children().select("parent_id"),
    });
    expect(sortedIds(await (Topic as any).rejected().hasChildren().toArray())).toEqual(
      sortedIds(await expected),
    );
  });

  it("nested scoping", async () => {
    const expected = Reply.approved();
    const got = await (Topic as any).rejected().nestedScoping(expected).toArray();
    expect(ids(got)).toEqual(ids(await expected));
  });

  it("scopes batch finders", async () => {
    expect(await Topic.approved().count()).toBe(4);

    await assertQueriesCount(5, false, async () => {
      for await (const t of Topic.approved().findEach({ batchSize: 1 })) {
        expect(t.approved).toBeTruthy();
      }
    });

    await assertQueriesCount(3, false, async () => {
      for await (const group of Topic.approved().findInBatches({ batchSize: 2 })) {
        for (const t of group) expect(t.approved).toBeTruthy();
      }
    });
  });

  it("table names for chaining scopes with and without table name included", async () => {
    await assertNothingRaised(() => (Comment as any).forFirstPost().forFirstAuthor().toArray());
  });

  it("scopes on relations", async () => {
    const approvedTopics = (Topic as any).all().approved().order("id DESC");
    expect((await approvedTopics.first()).id).toBe(topics("fifth").id);
    const repliedApproved = approvedTopics.replied();
    expect((await repliedApproved.first()).id).toBe(topics("third").id);
  });

  it("index on scope", async () => {
    const approved = Topic.approved().order("id ASC");
    const arr = await approved;
    expect(arr[0].id).toBe(topics("second").id);
    expect(approved.isLoaded).toBeTruthy();
  });

  it("nested scopes queries size", async () => {
    await assertQueriesCount(1, false, async () => {
      await (Topic as any)
        .approved()
        .byLifo()
        .replied()
        .writtenBefore(Temporal.Now.instant())
        .toArray();
    });
  });

  it("scopes are cached on associations", async () => {
    const post = (await Post.find(posts("welcome").id)) as any;
    await Post.cache(async () => {
      await assertQueriesCount(1, false, async () => {
        await post.comments.containingTheLetterE().toArray();
      });
      await assertNoQueries(false, async () => {
        await post.comments.containingTheLetterE().toArray();
      });
    });
  });

  it("scopes with arguments are cached on associations", async () => {
    const post = (await Post.find(posts("welcome").id)) as any;
    await Post.cache(async () => {
      let one: any[] = [];
      await assertQueriesCount(1, false, async () => {
        one = await post.comments.limitBy(1).toArray();
      });
      expect(one.length).toBe(1);

      let two: any[] = [];
      await assertQueriesCount(1, false, async () => {
        two = await post.comments.limitBy(2).toArray();
      });
      expect(two.length).toBe(2);

      await assertNoQueries(false, async () => {
        await post.comments.limitBy(1).toArray();
      });
      await assertNoQueries(false, async () => {
        await post.comments.limitBy(2).toArray();
      });
    });
  });

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
      await post.association("comments")[method]();
      expect(post.comments.containingTheLetterE()).not.toBe(before);
    }
  });

  it("scoped are lazy loaded if table still does not exist", async () => {
    await assertNothingRaised(() => import("../test-helpers/models/without-table.js"));
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
    expect(() => (Comment as any).unscoped().oopsComments().destroyAll()).toThrow(OopsError);
  });

  it("model class should respond to none", async () => {
    expect(await Topic.isNone()).toBeFalsy();
    await Topic.deleteAll();
    expect(await Topic.isNone()).toBeTruthy();
  });

  it("model class should respond to one", async () => {
    expect(await Topic.isOne()).toBeFalsy();
    await Topic.deleteAll();
    expect(await Topic.isOne()).toBeFalsy();
    await Topic.create({});
    expect(await Topic.isOne()).toBeTruthy();
  });

  it("scope with annotation", async () => {
    Topic.scope("includingAnnotateInScope", function (this: any) {
      return this.annotate("from-scope");
    });
    await assertQueriesMatch(/\/\* from-scope \*\//, undefined, false, async () => {
      expect(sortedIds(await (Topic as any).includingAnnotateInScope().toArray())).toEqual(
        sortedIds(await Topic.all()),
      );
    });
  });
});
