import { describe, expect, it } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import { Branch } from "./branch.js";

describe("Preloader::Branch root control flow", () => {
  const root = () =>
    new Branch({
      parent: null,
      association: null,
      children: null,
      associateByDefault: true,
      scope: null,
    });

  it("source_records on a root branch reads the nil parent", async () => {
    await expect((async () => root().sourceRecords())()).rejects.toThrow(TypeError);
  });

  it("runnable_loaders on a root branch reads the nil parent", async () => {
    await expect(root().runnableLoaders()).rejects.toThrow(TypeError);
  });

  it("preloaded_records on a root branch has no dedicated error", async () => {
    await expect(root().preloadedRecords()).rejects.toThrow(TypeError);
  });

  const names = (children: unknown): (string | null)[][] =>
    new Branch({
      parent: null,
      association: null,
      children,
      associateByDefault: true,
      scope: null,
    }).children.map((child) => [child.association, ...child.children.map((c) => c.association)]);

  it("build_children takes a name, a Hash of names, and an Array of either", () => {
    expect(names(":posts")).toEqual([["posts"]]);
    expect(names("posts")).toEqual([["posts"]]);
    expect(names({ posts: ":comments" })).toEqual([["posts", "comments"]]);
    expect(names([":posts", { author: [":books"] }, null])).toEqual([
      ["posts"],
      ["author", "books"],
    ]);
  });

  it("build_children hands a Hash inside a nested Array to Branch.new as the name", () => {
    expect(() => names([[":posts", { author: ":books" }]])).toThrow(ArgumentError);
    expect(() => names([[":posts", { author: ":books" }]])).toThrow(
      "Association names must be Symbol or String, got: Hash",
    );
    expect(() => names([10])).toThrow("Association names must be Symbol or String, got: Integer");
  });
});
