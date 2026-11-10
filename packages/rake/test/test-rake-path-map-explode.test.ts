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

    const altSeparatorCases: [string, string[]][] = File.ALT_SEPARATOR
      ? [
          ["c:a", ["c:.", "a"]],
          ["c:a/b", ["c:.", "a", "b"]],
          ["c:a/b/c", ["c:.", "a", "b", "c"]],
          ["c:/a", ["c:/", "a"]],
          ["c:/a/b", ["c:/", "a", "b"]],
          ["c:/a/b/c", ["c:/", "a", "b", "c"]],
        ]
      : [];
    for (const [path, exploded] of altSeparatorCases) {
      expect(pathmapExplode(path)).toEqual(exploded);
    }
  });
});
