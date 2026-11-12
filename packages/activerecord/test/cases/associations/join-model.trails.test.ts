import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { describe, it, expect } from "vitest";
import { Base } from "../../../lib/base.js";
import type { Relation } from "../../../lib/relation.js";
import type { AssociationProxy } from "../../../lib/associations/collection-proxy.js";
import { assertNoQueries } from "../../../lib/testing/query-assertions.js";
import { fixtures } from "../../support/use-fixtures.js";
import { Author } from "../../models/author.js";
import { Post } from "../../models/post.js";
import { Tag } from "../../models/tag.js";
import { Tagging } from "../../models/tagging.js";
import { Comment } from "../../models/comment.js";
import { Rating } from "../../models/rating.js";
import { CpkOrder } from "../../models/cpk.js";

class WelcomeOnlyTagging extends Base {
  static {
    this._tableName = "taggings";
    this.belongsTo(
      "taggable",
      function (this: Relation<Base>) {
        return this.where({ posts: { title: "Welcome to the weblog" } });
      },
      { polymorphic: true },
    );
  }
}
class ScopedSourceTag extends Base {
  declare welcomeTaggedPosts: AssociationProxy<Post>;

  static {
    this._tableName = "tags";
    this.hasMany("welcomeOnlyTaggings", { foreignKey: "tag_id", className: "WelcomeOnlyTagging" });
    this.hasMany("welcomeTaggedPosts", {
      through: "welcomeOnlyTaggings",
      source: "taggable",
      sourceType: "Post",
    });
  }
}

describe("AssociationsJoinModelTest", () => {
  const { posts, tags } = fixtures([
    "authors",
    "posts",
    "tags",
    "taggings",
    "comments",
    "cpkOrders",
  ]);
  constSet(TopLevel, "Author", Author);
  constSet(TopLevel, "Post", Post);
  constSet(TopLevel, "Tag", Tag);
  constSet(TopLevel, "Tagging", Tagging);
  constSet(TopLevel, "Comment", Comment);
  constSet(TopLevel, "Rating", Rating);
  constSet(TopLevel, "WelcomeOnlyTagging", WelcomeOnlyTagging);
  DescendantsTracker.registerSubclass(Base, WelcomeOnlyTagging);
  constSet(TopLevel, "ScopedSourceTag", ScopedSourceTag);
  DescendantsTracker.registerSubclass(Base, ScopedSourceTag);

  it("has many polymorphic with source type merges source reflection scope", async () => {
    const general = await ScopedSourceTag.find(tags("general").id);
    expect(await general.welcomeTaggedPosts).toEqual([posts("welcome")]);
  });

  it("eager has many polymorphic with source type merges source reflection scope", async () => {
    const general = await ScopedSourceTag.all()
      .includes(":welcomeTaggedPosts")
      .find(tags("general").id);
    await assertNoQueries(false, async () => {
      expect(general.association("welcomeTaggedPosts").target).toEqual([posts("welcome")]);
    });
  });

  it("eager has many through uses conditions specified on the has many association", async () => {
    const author = (await Author.all().includes(":nonexistentComments").first())!;
    expect(author.association("nonexistentComments").loaded).toBe(true);
    await assertNoQueries(false, async () => {
      expect((await author.nonexistentComments).length).toBe(0);
    });
  });

  it("polymorphic has many through with composite owner primary key", async () => {
    class CpkOrderWithTaggings extends CpkOrder {
      declare orderTagNames: AssociationProxy<Tag>;

      static {
        this.hasMany("orderTaggings", { className: "Tagging", as: "taggable" });
        this.hasMany("orderTagNames", {
          className: "Tag",
          through: "orderTaggings",
          source: "tag",
        });
      }
    }
    constSet(TopLevel, "CpkOrderWithTaggings", CpkOrderWithTaggings);
    DescendantsTracker.registerSubclass(CpkOrder, CpkOrderWithTaggings);

    const order = await CpkOrderWithTaggings.createBang({ shop_id: 42, status: "paid" });
    const tag = await Tag.createBang({ name: "rails-faithful" });
    await Tagging.insertAll([
      {
        tag_id: tag.id,
        taggable_id: order._readAttribute("id"),
        taggable_type: CpkOrderWithTaggings.polymorphicName(),
      },
    ]);

    expect(await order.orderTagNames).toEqual([tag]);
  });

  it("through association with scope with string joins", async () => {
    const sql = Post.joins(":ratingsViaStringJoinComments").toSql();
    expect(sql).toContain("JOIN posts AS p2 ON comments.post_id = p2.id");
    await expect(Post.joins(":ratingsViaStringJoinComments").first()).resolves.not.toThrow();
  });
});
