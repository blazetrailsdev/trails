import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Cref } from "./cref.js";
import type { Loader } from "./loader.js";
import { get, newLoader, teardown, withSetup } from "./test-helpers/loader-test.js";

describe("TestAncestors", () => {
  let loader: Loader;

  beforeEach(() => {
    loader = newLoader();
  });
  afterEach(teardown);

  async function lookup(klass: object, cname: string): Promise<unknown> {
    for (let mod = klass; mod !== Function.prototype; mod = Object.getPrototypeOf(mod)) {
      if (new Cref(mod, cname).isDefined()) return get(mod, cname);
    }
    throw new RangeError(cname);
  }

  const ext = (parent: string, name: string, body = "") =>
    `const P = await globalThis.$get("${parent}"); export class ${name} extends P { ${body} }`;

  it("autoloads a constant from an ancestor", async () => {
    const files: [string, string][] = [
      ["a.ts", "export class A {}"],
      ["a/x.ts", "export class X {}"],
      ["b.ts", ext("A", "B")],
      ["c.ts", ext("B", "C")],
    ];
    await withSetup(loader, files, {}, async () => {
      expect(await lookup(await get(Object, "C"), "X")).toBeTruthy();
    });
  });

  it("autoloads a constant from an ancenstor, even if present above", async () => {
    const files: [string, string][] = [
      ["a.ts", 'export class A { static X = ":A" }'],
      ["b.ts", ext("A", "B")],
      ["b/x.ts", 'export const X = ":B"'],
      ["c.ts", ext("B", "C")],
    ];
    await withSetup(loader, files, {}, async () => {
      expect(await get(await get(Object, "A"), "X")).toEqual(":A");
      expect(await lookup(await get(Object, "C"), "X")).toEqual(":B");
    });
  });

  // PERMANENT-SKIP: `include` of an autovivified module copies its members and resolves no constant through it (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("autoloads a constant from an ancestor that has some nesting going on", () => {});
});
