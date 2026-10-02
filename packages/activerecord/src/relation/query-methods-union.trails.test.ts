import { describe, it, expect } from "vitest";
import { Nodes, sql } from "@blazetrails/arel";
import { fixtures } from "../test-fixtures.js";
import { Post } from "../test-helpers/models/post.js";

describe("QueryMethods Array#| dedup", () => {
  fixtures(["posts", "comments"]);

  it("includes! dedups eql? association specs, hashes included", () => {
    expect(Post.includes("comments", "comments").includesValues).toEqual(["comments"]);
    expect(
      Post.includes({ comments: "post" }).includes({ comments: "post" }).includesValues,
    ).toEqual([{ comments: "post" }]);
  });

  it("order! dedups separately built eql? Arel orderings", () => {
    const relation = Post.order(Post.arelTable.get("id").asc()).order(
      Post.arelTable.get("id").asc(),
    );
    expect(relation.orderValues).toHaveLength(1);
  });

  it("reorder! dedups its own arguments", () => {
    expect(Post.all().reorder("id", "id").orderValues).toEqual(["id"]);
  });

  it("_select! unions fields by eql?, whatever their class", () => {
    const relation = Post.select("id", sql("title"))._selectBang(
      "id",
      sql("title"),
      1,
      2,
      ["id", "title"],
      ["id", "title"],
      ["title"],
    );
    expect(relation.selectValues).toEqual(["id", sql("title"), 1, 2, ["id", "title"], ["title"]]);
  });

  it("joins! dedups separately built eql? join nodes", () => {
    const join = () =>
      new Nodes.StringJoin(sql("INNER JOIN comments ON comments.post_id = posts.id"));
    expect(Post.joins(join()).joins(join()).joinsValues).toHaveLength(1);
  });

  it("merge dedups joins_values across both relations", () => {
    expect(Post.joins("comments").merge(Post.joins("comments")).joinsValues).toEqual(["comments"]);
  });
});
