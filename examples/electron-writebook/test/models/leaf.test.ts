import { describe, expect, it } from "vitest";
import "../test-helper.ts";
import { Leaf } from "../../app/models/leaf.ts";

describe("LeafTest", () => {
  it("slug is generated from title", () => {
    const leaf = new Leaf({ title: "Hello, World!" });
    expect(leaf.slug()).toBe("hello-world");
  });

  it("slug is never completely blank", () => {
    const leaf = new Leaf({ title: "" });
    expect(leaf.slug()).toBe("-");
  });
});
