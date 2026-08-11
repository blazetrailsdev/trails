/**
 * Trails-only: `Association#build_record` yields the caller's block INSIDE the
 * block it hands `reflection.build_association`, after `initialize_attributes`
 * (association.rb:383-388) and before `Core#initialize` runs the initialize
 * callbacks (core.rb:479). Ruby gets that from `&block` alone and has no test
 * for it; trails took no block parameter at all in `buildRecord` and ran the
 * caller's block after construction had already returned, so the block saw a
 * record with neither the association's scope attributes nor its inverse wired
 * up. Nothing pinned the difference.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Base, registerModel } from "../index.js";
import { fixtures } from "../test-fixtures.js";

interface CollectionAssociationLike {
  build(
    attributes?: Record<string, unknown>,
    block?: (record: BlockOrderingPost) => void,
  ): BlockOrderingPost;
}

const postsAssociationOf = (owner: BlockOrderingAuthor): CollectionAssociationLike =>
  (owner as unknown as { association(n: string): CollectionAssociationLike }).association("posts");

class BlockOrderingAuthor extends Base {
  declare name: string | null;

  static {
    this._tableName = "authors";
    this.attribute("name", "string");
    this.hasMany("posts", { className: "BlockOrderingPost", foreignKey: "author_id" });
  }
}

class BlockOrderingPost extends Base {
  declare title: string | null;
  declare authorId: number | null;

  static {
    this._tableName = "posts";
    this.attribute("title", "string");
    this.attribute("author_id", "integer");
    this.belongsTo("author", { className: "BlockOrderingAuthor", foreignKey: "author_id" });
  }
}

describe("BuildRecordBlockOrdering", () => {
  fixtures(["authors", "posts"]);

  beforeAll(() => {
    registerModel("BlockOrderingAuthor", BlockOrderingAuthor);
    registerModel("BlockOrderingPost", BlockOrderingPost);
  });

  it("yields the build block after initialize_attributes has set the owner key", async () => {
    const author = (await BlockOrderingAuthor.first()) as BlockOrderingAuthor;

    let authorIdInBlock: number | null = null;
    postsAssociationOf(author).build({ title: "t" }, (record) => {
      authorIdInBlock = record.readAttribute("author_id") as number | null;
    });

    expect(authorIdInBlock).toBe(author.id);
  });

  it("keeps the build block's writes on the built record", async () => {
    const author = (await BlockOrderingAuthor.first()) as BlockOrderingAuthor;

    const post = postsAssociationOf(author).build({ title: "from attributes" }, (record) => {
      record.writeAttribute("title", "from block");
    });

    expect(post.readAttribute("title")).toBe("from block");
  });
});
