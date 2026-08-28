import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sweptFilesInsideUnsweptTrees } from "./no-freeform-comments-scope.mjs";

describe("no-freeform-comments scope", () => {
  it("lists only files that still exist", () => {
    const missing = sweptFilesInsideUnsweptTrees.filter(
      (p) => !existsSync(p.replaceAll("\\[", "[").replaceAll("\\]", "]")),
    );
    expect(missing).toEqual([]);
  });

  it("holds no duplicates", () => {
    expect(sweptFilesInsideUnsweptTrees.length).toBe(new Set(sweptFilesInsideUnsweptTrees).size);
  });
});
