import type { AssociationProxy } from "./collection-proxy.js";
import { describe, it, expect, vi } from "vitest";
import { Base, registerModel } from "../index.js";
import { fixtures } from "../test-fixtures.js";

vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");

async function clearSchemaCache(table: string): Promise<void> {
  const conn = await Base.leaseConnection();
  await conn.internalSchemaCache.clearDataSourceCacheBang(conn.pool ?? conn, table);
}

describe("association create on a target whose schema is not reflected yet", () => {
  const { posts } = fixtures(["posts"]);

  function makeModels() {
    class ColdComment extends Base {
      declare body: string;
      declare post_id: number | null;

      static {
        this.tableName = "comments";
      }
    }
    class ColdPost extends Base {
      declare cold_comments: AssociationProxy<ColdComment>;

      static {
        this.tableName = "posts";
        this.hasMany("cold_comments", { className: "ColdComment", foreignKey: "post_id" });
      }
    }
    class ColdAuthor extends Base {
      static {
        this.tableName = "authors";
      }
    }
    class ColdAuthoredPost extends Base {
      static {
        this.tableName = "posts";
        this.belongsTo("author", { className: "ColdAuthor" });
      }
    }
    registerModel(ColdComment);
    registerModel(ColdPost);
    registerModel(ColdAuthor);
    registerModel(ColdAuthoredPost);
    return { ColdComment, ColdPost, ColdAuthoredPost };
  }

  it("collection createBang warms the target klass before building the record", async () => {
    const { ColdPost } = makeModels();
    const post = await ColdPost.find(posts("welcome").id);
    await clearSchemaCache("comments");

    const comment = await post.cold_comments.createBang({ body: "First!" });

    expect(comment.isPersisted()).toBe(true);
    expect(comment.body).toBe("First!");
    expect(comment.post_id).toBe(post.id);
  });

  it("singular createBang warms the target klass before building the record", async () => {
    const { ColdAuthoredPost } = makeModels();
    const post = await ColdAuthoredPost.find(posts("welcome").id);
    await clearSchemaCache("authors");

    const author = await (
      post as unknown as { createAuthorBang(attrs: object): Promise<Base> }
    ).createAuthorBang({ name: "Cold" });

    expect(author.isPersisted()).toBe(true);
    expect(author.readAttribute("name")).toBe("Cold");
  });
});
