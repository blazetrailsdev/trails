import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Base, registerModel } from "./index.js";
import { fixtures } from "./test-fixtures.js";
import { Post as CanonicalPost } from "./test-helpers/models/post.js";
import { Comment as CanonicalComment } from "./test-helpers/models/comment.js";

describe("CounterCacheTest (trails)", () => {
  fixtures(["posts", "comments"]);
  beforeAll(() => {
    registerModel(CanonicalPost);
    registerModel(CanonicalComment);
  });

  it("counter cache updates an aliased column", async () => {
    const post = await CanonicalPost.create({ title: "Hello", body: "World" });
    await CanonicalComment.create({ body: "First", post_id: post.id });

    const reloaded = await CanonicalPost.find(post.id);
    expect(reloaded.legacy_comments_count).toBe(1);
  });

  it("registering a counter cached association does not mutate the superclass list", () => {
    class ParentModel extends Base {}
    class ChildModel extends ParentModel {}
    ChildModel.belongsTo("post", { counterCache: true });

    expect(ChildModel.counterCachedAssociationNames).toEqual(["post"]);
    expect(ParentModel.counterCachedAssociationNames).toEqual([]);
  });
});

describe("CounterCacheTest deferred resolution (trails)", () => {
  fixtures([]);
  afterAll(async () => {
    const { modelRegistry } = await import("./associations.js");
    modelRegistry.delete("Reply");
    modelRegistry.delete("Topic");
    modelRegistry.delete("CpkOrder");
  });

  it("counter cache on unloaded association class works", async () => {
    class Reply extends Base {
      static _tableName = "topics";
      static {
        this.attribute("content", "text");
        this.attribute("parent_id", "integer");
        this.belongsTo("topic", { counterCache: true, foreignKey: "parent_id" });
      }
    }
    const { modelRegistry } = await import("./associations.js");
    modelRegistry.delete("Topic");
    registerModel(Reply);

    class Topic extends Base {
      declare replies_count: number;
      static {
        this.attribute("title", "string");
        this.attribute("replies_count", "integer", { default: 0 });
      }
    }
    registerModel(Topic);

    expect(Topic.isCounterCacheColumn("replies_count")).toBe(true);
    const t = await Topic.create({ title: "x" });
    await Reply.create({ content: "r", parent_id: t.id });
    const reloaded = await Topic.find(t.id);
    expect(reloaded.replies_count).toBe(1);
  });

  it("flushed counter cache column uses demodulized name when owner is defined before target", async () => {
    const { CpkOrder } = await import("./test-helpers/models/cpk.js");
    registerModel(CpkOrder);
    const cols = (CpkOrder as unknown as { _counterCacheColumns: string[] })._counterCacheColumns;
    expect(cols).toContain("books_count");
    expect(cols).not.toContain("cpk_books_count");
  });
});
