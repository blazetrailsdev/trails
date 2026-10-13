import { describe, it, expect } from "vitest";
import "./index.js";
import { registerModel } from "./associations.js";
import { fixtures } from "./test-fixtures.js";
import { assertNoQueries, assertQueriesCount } from "./testing/query-assertions.js";
import { Post } from "./test-helpers/models/post.js";
import { Topic } from "./test-helpers/models/topic.js";

registerModel(Post);

describe("FinderTrailsTest", () => {
  const { posts } = fixtures(["posts", "topics"]);

  it("find with pk slug string casts through the bind", async () => {
    const welcome = posts("welcome");
    const found = await Post.find("1-foo");
    expect(found.id).toStrictEqual(welcome.id);
  });

  it("find with array of pk slug strings casts through the bind", async () => {
    const welcome = posts("welcome");
    const thinking = posts("thinking");
    const found = (await Post.find(["1-foo", "2-bar"])) as Post[];
    expect(found.map((r) => r.id)).toStrictEqual([welcome.id, thinking.id]);
  });

  it("take memoizes the record so a second call issues no query", async () => {
    const relation = Post.all();
    const first = await relation.take();
    expect(first).not.toBeNull();
    await assertNoQueries(false, async () => {
      expect(await relation.take()).toStrictEqual(first);
    });
    relation.reset();
    await assertQueriesCount(1, false, async () => {
      expect(await relation.take()).toStrictEqual(first);
    });
  });

  it("second memoizes per offset so a second call issues no query", async () => {
    const relation = Post.order({ id: "asc" });
    const second = await relation.second();
    expect(second).not.toBeNull();
    await assertNoQueries(false, async () => {
      expect(await relation.second()).toStrictEqual(second);
    });
    relation.reset();
    await assertQueriesCount(1, false, async () => {
      expect(await relation.second()).toStrictEqual(second);
    });
  });

  it("all-out-of-range array collapses to IN (NULL)", async () => {
    const big = 9223372036854775808n;
    const negBig = -9223372036854775809n;

    const inRel = Topic.where({ id: [big, negBig] });
    expect(inRel.toSql()).toMatch(/IN \(NULL\)/);
    expect(await inRel.isExists()).toBe(false);

    const notInRel = Topic.where().not({ id: [big, negBig] });
    expect(notInRel.toSql()).toMatch(/NOT IN \(NULL\)/);
    expect(await notInRel.isExists()).toBe(false);
  });
});
