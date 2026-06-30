/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 * Mirrors: activerecord/test/cases/excluding_test.rb
 */
import { describe, it, expect } from "vitest";
import "./index.js";
import { fixtures } from "./test-helpers/fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { registerModel } from "./associations.js";
import type { Relation } from "./relation.js";
import { Post } from "./test-helpers/models/post.js";
import { Comment } from "./test-helpers/models/comment.js";

registerModel(Post);
registerModel(Comment);

describe("ExcludingTest", () => {
  // Rails: `fixtures :posts, :comments`. The canonical `posts`/`comments`
  // tables are pre-built per worker; seed them so each `excluding` relation has
  // rows to read back, and so the shared models resolve regardless of any
  // bespoke table a sibling file left in the worker DB.
  const { posts, comments } = fixtures(["posts", "comments"], {
    schema: canonicalSchema,
  });

  const ids = (records: { id: unknown }[]) => records.map((r) => r.id);

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

    const records = await Post.excluding(query);
    expect(ids(records)).not.toContain(post.id);
  });

  it("result set does not include collection of excluded records from a loaded query", async () => {
    const post = posts("welcome");
    const query = await Post.where({ id: post }).load();

    const records = await Post.excluding(query);
    expect(ids(records)).not.toContain(post.id);
  });

  it("result set does not include collection of excluded records and queries", async () => {
    const post = posts("welcome");
    const thinking = posts("thinking");

    const records = await Post.excluding(post, Post.where({ id: thinking }));
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

    const records = await Comment.excluding(relation);
    const postComments = await post.comments.toArray();

    expect(records.length).toBeGreaterThan(0);
    expect(postComments.length).toBeGreaterThan(0);
    const postCommentIds = new Set(ids(postComments));
    expect(records.filter((r) => postCommentIds.has(r.id))).toHaveLength(0);
  });

  it("result set through association does not include collection of excluded records from a loaded relation", async () => {
    const post = posts("welcome");
    const relation = await post.comments.load();

    const records = await Comment.excluding(relation);
    const postComments = await post.comments.toArray();

    expect(records.length).toBeGreaterThan(0);
    expect(postComments.length).toBeGreaterThan(0);
    const postCommentIds = new Set(ids(postComments));
    expect(records.filter((r) => postCommentIds.has(r.id))).toHaveLength(0);
  });

  it("does not exclude records when no arguments", async () => {
    const post = posts("welcome");

    const assertNoExcludes = async (relation: Relation<Post>) => {
      expect(ids(await relation.toArray())).toContain(post.id);
      expect(await relation.count()).toBe(await Post.count());
    };

    await assertNoExcludes(Post.excluding());
    await assertNoExcludes(Post.excluding(null));
    await assertNoExcludes(Post.excluding([]));
    await assertNoExcludes(Post.excluding([null]));
  });

  it("raises on record from different class", () => {
    const post = posts("welcome");
    const commentGreetings = comments("greetings");

    expect(() => Post.excluding(post, commentGreetings)).toThrow(
      "You must only pass a single or collection of Post objects to #excluding.",
    );

    expect(() => Post.without(post, commentGreetings)).toThrow(
      "You must only pass a single or collection of Post objects to #without.",
    );
  });
});
