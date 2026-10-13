import { describe, it, expect } from "vitest";
import { registerModel } from "../index.js";
import { fixtures } from "../test-helpers/use-fixtures.js";
import { JoinDependency } from "../associations/join-dependency.js";
import { Author } from "../test-helpers/models/author.js";
import { Comment } from "../test-helpers/models/comment.js";
import { Post } from "../test-helpers/models/post.js";

registerModel([Author, Comment, Post]);

describe("RelationMergingTest", () => {
  fixtures([]);

  it("relation merging preserves interleaved named/raw joins order", () => {
    const rawJoin = "INNER JOIN authors ON authors.id = posts.author_id";
    const source = Post.joins(":comments", rawJoin, ":author");
    const merged = Post.all().merge(source);
    expect(merged.joinsValues).toEqual([":comments", rawJoin, ":author"]);
    const banged = Post.all();
    banged.mergeBang(source);
    expect(banged.joinsValues).toEqual([":comments", rawJoin, ":author"]);
  });

  it("relation merging with cross-klass joins builds a join dependency", () => {
    const source = Post.joins(":author");
    const merged = Comment.all().merge(source);
    expect(merged.joinsValues.length).toBe(1);
    expect(merged.joinsValues[0]).toBeInstanceOf(JoinDependency);

    const banged = Comment.all();
    banged.mergeBang(source);
    expect(banged.joinsValues.length).toBe(1);
    expect(banged.joinsValues[0]).toBeInstanceOf(JoinDependency);
  });

  it("relation merging with cross-klass left outer joins builds a join dependency", () => {
    const source = Post.leftOuterJoins(":author");
    const merged = Comment.all().merge(source);
    expect(merged.leftOuterJoinsValues.length).toBe(1);
    expect(merged.leftOuterJoinsValues[0]).toBeInstanceOf(JoinDependency);

    const banged = Comment.all();
    banged.mergeBang(source);
    expect(banged.leftOuterJoinsValues.length).toBe(1);
    expect(banged.leftOuterJoinsValues[0]).toBeInstanceOf(JoinDependency);
  });
});
