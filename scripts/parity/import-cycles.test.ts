import { describe, expect, it } from "vitest";
import { scanFile, tighten } from "./import-cycles.js";

const FILES = new Set(["/p/a.ts", "/p/b.ts"]);

function scanA(text: string) {
  return scanFile("/p/a.ts", text, FILES).edges;
}

describe("import-cycles scanFile", () => {
  it("drops an import read only in type positions, as tsc elides it", () => {
    expect(scanA(`import { B } from "./b.js";\nlet x: B;\nclass C implements B {}`)).toEqual([]);
  });

  it("drops an import type and type-only specifiers", () => {
    expect(
      scanA(`import type { B } from "./b.js";\nimport { type D } from "./b.js";\nnew B();`),
    ).toEqual([]);
  });

  it("keeps a read inside a method as a deferred edge", () => {
    const [e] = scanA(`import { B } from "./b.js";\nclass C { m() { return new B(); } }`);
    expect(e.to).toBe("/p/b.ts");
    expect([...e.evalNames]).toEqual([]);
  });

  it("counts extends, static initializers and top-level calls as module-eval reads", () => {
    for (const body of [
      "class C extends B {}",
      "class C { static x = B; }",
      "include(C, B);",
      "export const y = { B };",
    ]) {
      const [e] = scanA(`import { B } from "./b.js";\n${body}`);
      expect([...e.evalNames], body).toEqual(["B"]);
    }
  });

  it("does not count an instance field initializer or a property name", () => {
    const [e] = scanA(
      `import { B } from "./b.js";\nclass C { f = new B(); }\nconst o = { B: 1 }; o.B;`,
    );
    expect([...e.evalNames]).toEqual([]);
  });

  it("keeps a side-effect import and a value re-export as edges", () => {
    expect(scanA(`import "./b.js";`).map((e) => e.to)).toEqual(["/p/b.ts"]);
    expect(scanA(`export { B } from "./b.js";`).map((e) => e.to)).toEqual(["/p/b.ts"]);
    expect(scanA(`export type { B } from "./b.js";`)).toEqual([]);
  });
});

describe("import-cycles tighten", () => {
  it("lowers marks, never raises them, and drops zero rows", () => {
    expect(tighten({ a: 3, b: 2 }, { a: 1, b: 5 })).toEqual({ a: 1, b: 2 });
    expect(tighten({ a: 3 }, {})).toEqual({});
  });
});
