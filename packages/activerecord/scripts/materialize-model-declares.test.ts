import { describe, it, expect } from "vitest";
import { INLINE_IMPORT_RE, hoistInlineImports } from "./materialize-model-declares.js";

describe("INLINE_IMPORT_RE", () => {
  it("does not misparse a dynamic-import .then() call site as a named import", () => {
    const src = `const p = import("mod").then((m) => m.Foo);`;
    INLINE_IMPORT_RE.lastIndex = 0;
    expect(INLINE_IMPORT_RE.test(src)).toBe(false);
    const { text, importLines } = hoistInlineImports(src, new Set(), "/x");
    expect(text).toBe(src);
    expect(importLines).toEqual([]);
  });

  it("hoists an inline type-position import expression", () => {
    const src = `declare posts: import("mod").Relation<Post>;`;
    const { text, importLines } = hoistInlineImports(src, new Set(), "/x");
    expect(text).toBe(`declare posts: Relation<Post>;`);
    expect(importLines).toHaveLength(1);
    expect(importLines[0]).toContain("import type { Relation }");
  });
});
