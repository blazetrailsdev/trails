import * as path from "path";
import { describe, expect, it } from "vitest";
import {
  edgeKey,
  makeResolver,
  matchExports,
  parseErrors,
  scanFile,
  tighten,
} from "./import-cycles.js";

const FILES = new Set(["/p/a.ts", "/p/b.ts"]);
const resolve = makeResolver(FILES, new Map());

function scanA(lines: string[]) {
  const text = lines.join("\n");
  expect(parseErrors("/p/a.ts", text)).toEqual([]);
  return scanFile("/p/a.ts", text, resolve);
}

const IMPORT_B = `import { B } from "./b.js";`;

describe("import-cycles scanFile", () => {
  it("drops an import read only in type positions, as tsc elides it", () => {
    expect(scanA([IMPORT_B, "let x: B;", "class C implements B {}"])).toEqual([]);
  });

  it("drops an import type and type-only specifiers", () => {
    expect(
      scanA([`import type { B } from "./b.js";`, `import { type D } from "./b.js";`, "new B();"]),
    ).toEqual([]);
  });

  it("keeps a read inside a method as a deferred edge", () => {
    const [e] = scanA([IMPORT_B, "class C { m() { return new B(); } }"]);
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
      const [e] = scanA([IMPORT_B, body]);
      expect([...e.evalNames], body).toEqual(["B"]);
    }
  });

  it("does not count an instance field initializer or a property name", () => {
    const [e] = scanA([IMPORT_B, "class C { f = new B(); }", "const o = { B: 1 };", "o.B;"]);
    expect([...e.evalNames]).toEqual([]);
  });

  it("keeps a side-effect import and a value re-export as edges", () => {
    expect(scanA([`import "./b.js";`]).map((e) => e.to)).toEqual(["/p/b.ts"]);
    expect(scanA([`export { B } from "./b.js";`]).map((e) => e.to)).toEqual(["/p/b.ts"]);
    expect(scanA([`export type { B } from "./b.js";`])).toEqual([]);
  });

  it("keeps a local export of an imported binding as an edge, with no read", () => {
    const [e] = scanA([IMPORT_B, "export { B };"]);
    expect(e.to).toBe("/p/b.ts");
    expect([...e.evalNames]).toEqual([]);
  });

  it("does not count a read of a parameter or local that shadows the import", () => {
    expect(scanA([IMPORT_B, "function f(B: number) { return B; }"])).toEqual([]);
    expect(scanA([IMPORT_B, "{ const B = 1; console.log(B); }"])).toEqual([]);
    expect(scanA([IMPORT_B, "function g(x: boolean) { if (x) { var B = 1; } return B; }"])).toEqual(
      [],
    );
  });

  it("counts a module-eval read of a module's own named export", () => {
    const [e] = scanFile(
      "/p/a.ts",
      [`import { A } from "./a.js";`, "include(X, A);"].join("\n"),
      resolve,
    );
    expect(e.to).toBe("/p/a.ts");
    expect([...e.evalNames]).toEqual(["A"]);
  });

  it("does not count a module seating its own namespace object", () => {
    const [e] = scanFile(
      "/p/a.ts",
      [`import * as AModule from "./a.js";`, "Seat.A = AModule;"].join("\n"),
      resolve,
    );
    expect([...e.evalNames]).toEqual([]);
  });
});

describe("import-cycles makeResolver", () => {
  it("resolves a workspace specifier through exports to the src file", () => {
    const dir = path.resolve("/w/packages/x");
    const files = new Set([path.join(dir, "src/index.ts"), path.join(dir, "src/sub/y.ts")]);
    const r = makeResolver(
      files,
      new Map([
        [
          "@blazetrails/x",
          {
            dir,
            main: undefined,
            exports: { ".": { default: "./dist/index.js" }, "./*": "./dist/*.js" },
          },
        ],
      ]),
    );
    expect(r("/q.ts", "@blazetrails/x")).toBe(path.join(dir, "src/index.ts"));
    expect(r("/q.ts", "@blazetrails/x/sub/y")).toBe(path.join(dir, "src/sub/y.ts"));
    expect(r("/q.ts", "@other/x")).toBeNull();
  });

  it("matches exact, conditional and wildcard export keys", () => {
    expect(matchExports({ ".": "./dist/i.js" }, ".")).toBe("./dist/i.js");
    expect(matchExports({ "./a": { import: "./dist/a.js" } }, "./a")).toBe("./dist/a.js");
    expect(matchExports({ "./*": "./dist/*.js" }, "./b/c")).toBe("./dist/b/c.js");
  });
});

describe("import-cycles tighten", () => {
  it("drops rows whose edge is gone and never adds one", () => {
    const edge = { from: "a.ts", to: "b.ts", evalNames: ["B"], evalLine: 1 };
    const extra = { from: "c.ts", to: "d.ts", evalNames: ["D"], evalLine: 1 };
    expect(
      tighten({ story: "s", edges: ["a.ts -> b.ts [B]", "x.ts -> y.ts [Y]"] }, [edge, extra]),
    ).toEqual({
      story: "s",
      edges: ["a.ts -> b.ts [B]"],
    });
  });

  it("keys an edge by the names it reads, so a new read is a new row", () => {
    const one = { from: "a.ts", to: "b.ts", evalNames: ["B"], evalLine: 1 };
    expect(edgeKey({ ...one, evalNames: ["B", "C"] })).not.toBe(edgeKey(one));
  });
});
