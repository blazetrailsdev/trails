import { describe, expect, it } from "vitest";
import { File } from "@blazetrails/ruby-compat";
import { pathmapExplode } from "../lib/ext/string.js";

describe("TestRakePathMapExplode", () => {
  it("explode", () => {
    expect(pathmapExplode("a")).toEqual(["a"]);
    expect(pathmapExplode("a/b")).toEqual(["a", "b"]);
    expect(pathmapExplode("a/b/c")).toEqual(["a", "b", "c"]);
    expect(pathmapExplode("/a")).toEqual(["/", "a"]);
    expect(pathmapExplode("/a/b")).toEqual(["/", "a", "b"]);
    expect(pathmapExplode("/a/b/c")).toEqual(["/", "a", "b", "c"]);

    expect(File.ALT_SEPARATOR ? pathmapExplode("c:a") : ["c:.", "a"]).toEqual(["c:.", "a"]);
    expect(File.ALT_SEPARATOR ? pathmapExplode("c:a/b") : ["c:.", "a", "b"]).toEqual([
      "c:.",
      "a",
      "b",
    ]);
    expect(File.ALT_SEPARATOR ? pathmapExplode("c:a/b/c") : ["c:.", "a", "b", "c"]).toEqual([
      "c:.",
      "a",
      "b",
      "c",
    ]);
    expect(File.ALT_SEPARATOR ? pathmapExplode("c:/a") : ["c:/", "a"]).toEqual(["c:/", "a"]);
    expect(File.ALT_SEPARATOR ? pathmapExplode("c:/a/b") : ["c:/", "a", "b"]).toEqual([
      "c:/",
      "a",
      "b",
    ]);
    expect(File.ALT_SEPARATOR ? pathmapExplode("c:/a/b/c") : ["c:/", "a", "b", "c"]).toEqual([
      "c:/",
      "a",
      "b",
      "c",
    ]);
  });
});
