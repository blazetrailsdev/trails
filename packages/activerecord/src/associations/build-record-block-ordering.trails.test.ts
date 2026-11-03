import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { describe, it, expect, beforeAll } from "vitest";
import { Base } from "../index.js";
import { fixtures } from "../test-helpers/use-fixtures.js";

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
    constSet(TopLevel, "BlockOrderingAuthor", BlockOrderingAuthor);
    DescendantsTracker.registerSubclass(Base, BlockOrderingAuthor);
    constSet(TopLevel, "BlockOrderingPost", BlockOrderingPost);
    DescendantsTracker.registerSubclass(Base, BlockOrderingPost);
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
