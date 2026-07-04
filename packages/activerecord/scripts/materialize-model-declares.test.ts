import { describe, it, expect } from "vitest";
import { INLINE_IMPORT_RE, hoistInlineImports } from "./materialize-model-declares.js";

describe("INLINE_IMPORT_RE", () => {
  it("does not misparse a dynamic-import .then() call site as a named import", () => {
    // Runtime dynamic import chained through `.then((m) => m.Foo)`. The member
    // access is immediately CALLED, so the trailing `(?![\w$]|\s*\()` lookahead
    // must reject it — otherwise a phantom `then` import gets hoisted and the
    // call site is rewritten to a bare `then`. Regression for PR #4557.
    const src = `const p = import("mod").then((m) => m.Foo);`;
    INLINE_IMPORT_RE.lastIndex = 0;
    expect(INLINE_IMPORT_RE.test(src)).toBe(false);
    const { text, importLines } = hoistInlineImports(src, new Set(), "/x");
    expect(text).toBe(src);
    expect(importLines).toEqual([]);
  });

  it("hoists an inline type-position import expression", () => {
    // The virtualizer only emits `import("mod").Sym` in TYPE position, never
    // followed by `(`, so the lookahead admits it: the call site rewrites to a
    // bare `Relation` and a top-level `import type` line is hoisted.
    const src = `declare posts: import("mod").Relation<Post>;`;
    const { text, importLines } = hoistInlineImports(src, new Set(), "/x");
    expect(text).toBe(`declare posts: Relation<Post>;`);
    expect(importLines).toHaveLength(1);
    expect(importLines[0]).toContain("import type { Relation }");
  });
});
