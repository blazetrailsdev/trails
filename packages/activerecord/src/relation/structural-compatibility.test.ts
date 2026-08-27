import { describe, it, expect } from "vitest";
import "../index.js";
import { fixtures } from "../test-fixtures.js";
import { Post } from "../test-helpers/models/post.js";

describe("StructuralCompatibilityTest", () => {
  fixtures(["posts"]);

  it("compatible values", () => {
    const left = Post.where({ id: 1 });
    const right = Post.where({ id: 2 });

    expect(left.structurallyCompatible(right)).toBe(true);
  });

  it("incompatible single value relations", () => {
    const left = Post.distinct().where("id = 1");
    const right = Post.where({ id: [2, 3] });

    expect(left.structurallyCompatible(right)).toBe(false);
  });

  it("incompatible multi value relations", () => {
    const left = Post.order("body asc").where("id = 1");
    const right = Post.order("id desc").where({ id: [2, 3] });

    expect(left.structurallyCompatible(right)).toBe(false);
  });

  it("incompatible unscope", () => {
    const left = Post.order("body asc").where("id = 1").unscope("order");
    const right = Post.order("body asc").where("id = 2");

    expect(left.structurallyCompatible(right)).toBe(false);
  });
});
