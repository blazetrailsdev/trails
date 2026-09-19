import { describe, it, expect } from "vitest";
import "./index.js";
import { assertEmpty, assertNotEmpty, assertRaises } from "@blazetrails/activesupport";
import { ArgumentError, regexpEscape } from "@blazetrails/ruby-compat";
import { assertQueriesCount, assertQueriesMatch } from "./testing/query-assertions.js";
import { quoteTableName } from "./support/quote-regex.js";
import { fixtures } from "./test-fixtures.js";
import { registerModel } from "./associations.js";
import type { Relation } from "./relation.js";
import { Post } from "./test-helpers/models/post.js";
import { Comment } from "./test-helpers/models/comment.js";

const ids = (records: { id: unknown }[]) => records.map((r) => r.id);

registerModel(Post);
registerModel(Comment);

async function assertNoExcludes(post: Post, relation: Relation<Post>) {
  expect(ids(await relation)).toContain(post.id);
  expect(await relation.count()).toBe(await Post.count());
}

describe("ExcludingTest", () => {
  const { posts, comments } = fixtures(["posts", "comments"]);

  it("result set does not include single excluded record", async () => {
    const post = posts("welcome");

    expect(ids(await Post.excluding(post))).not.toContain(post.id);
    expect(ids(await Post.excluding(post))).not.toContain(post.id);

    expect(ids(await Post.without(post))).not.toContain(post.id);
  });

  it("result set does not include collection of excluded records", async () => {
    const post = posts("welcome");
    const thinking = posts("thinking");

    const relationIds = ids(await Post.excluding(post, thinking));
    expect(relationIds).not.toContain(post.id);
    expect(relationIds).not.toContain(thinking.id);
  });

  it("result set does not include collection of excluded records from a query", async () => {
    const post = posts("welcome");
    const query = Post.where({ id: post });

    await assertQueriesMatch(
      new RegExp(`SELECT ${regexpEscape(quoteTableName("posts.id"))} FROM`),
      undefined,
      false,
      async () => {
        const records = await Post.excluding(query);

        expect(ids(records)).not.toContain(post.id);
      },
    );
  });

  it("result set does not include collection of excluded records from a loaded query", async () => {
    const post = posts("welcome");
    const query = await Post.where({ id: post }).load();

    let records: Post[] = [];
    await assertQueriesCount(1, false, async () => {
      records = await Post.excluding(query);
    });

    expect(ids(records)).not.toContain(post.id);
  });

  it("result set does not include collection of excluded records and queries", async () => {
    const post = posts("welcome");
    const thinking = posts("thinking");

    let records: Post[] = [];
    await assertQueriesCount(2, false, async () => {
      records = await Post.excluding(post, Post.where({ id: thinking }));
    });

    expect(ids(records)).not.toContain(post.id);
    expect(ids(records)).not.toContain(thinking.id);
  });

  it("result set through association does not include single excluded record", async () => {
    const post = posts("welcome");
    const commentGreetings = comments("greetings");
    const commentMoreGreetings = comments("more_greetings");

    const relationIds = ids(await post.comments.excluding(commentGreetings));
    expect(relationIds).not.toContain(commentGreetings.id);
    expect(relationIds).toContain(commentMoreGreetings.id);
  });

  it("result set through association does not include collection of excluded records", async () => {
    const post = posts("welcome");
    const commentGreetings = comments("greetings");
    const commentMoreGreetings = comments("more_greetings");

    const relationIds = ids(
      await post.comments.excluding([commentGreetings, commentMoreGreetings]),
    );
    expect(relationIds).not.toContain(commentGreetings.id);
    expect(relationIds).not.toContain(commentMoreGreetings.id);
  });

  it("result set through association does not include collection of excluded records from a relation", async () => {
    const post = posts("welcome");
    const relation = post.comments;

    await assertQueriesMatch(
      new RegExp(`SELECT ${regexpEscape(quoteTableName("comments.id"))} FROM`),
      undefined,
      false,
      async () => {
        const records = await Comment.excluding(relation);

        const postComments = await post.comments;

        assertNotEmpty(records);
        assertNotEmpty(postComments);
        assertEmpty(records.filter((r) => ids(postComments).includes(r.id)));
      },
    );
  });

  it("result set through association does not include collection of excluded records from a loaded relation", async () => {
    const post = posts("welcome");
    const relation = await post.comments.load();

    let records: Comment[] = [];
    await assertQueriesCount(1, false, async () => {
      records = await Comment.excluding(relation);
    });

    const postComments = await post.comments;

    assertNotEmpty(records);
    assertNotEmpty(postComments);
    assertEmpty(records.filter((r) => ids(postComments).includes(r.id)));
  });

  it("does not exclude records when no arguments", async () => {
    const post = posts("welcome");

    await assertNoExcludes(post, Post.excluding());
    await assertNoExcludes(post, Post.excluding(null));
    await assertNoExcludes(post, Post.excluding([]));
    await assertNoExcludes(post, Post.excluding([null]));
  });

  it("raises on record from different class", async () => {
    const post = posts("welcome");

    let error = await assertRaises([ArgumentError], {}, () =>
      Post.excluding(post, comments("greetings")),
    );
    expect(error.message).toBe(
      "You must only pass a single or collection of Post objects to #excluding.",
    );

    error = await assertRaises([ArgumentError], {}, () =>
      Post.without(post, comments("greetings")),
    );
    expect(error.message).toBe(
      "You must only pass a single or collection of Post objects to #without.",
    );
  });
});
