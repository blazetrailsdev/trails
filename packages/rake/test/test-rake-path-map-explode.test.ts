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

    if (File.ALT_SEPARATOR) {
      expect(pathmapExplode("c:a")).toEqual(["c:.", "a"]);
      expect(pathmapExplode("c:a/b")).toEqual(["c:.", "a", "b"]);
      expect(pathmapExplode("c:a/b/c")).toEqual(["c:.", "a", "b", "c"]);
      expect(pathmapExplode("c:/a")).toEqual(["c:/", "a"]);
      expect(pathmapExplode("c:/a/b")).toEqual(["c:/", "a", "b"]);
      expect(pathmapExplode("c:/a/b/c")).toEqual(["c:/", "a", "b", "c"]);
    }
  });
});
