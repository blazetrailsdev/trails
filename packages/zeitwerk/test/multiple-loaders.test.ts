import { afterEach, describe, expect, it } from "vitest";
import { get, newLoader, teardown, withFiles } from "./support/loader-test.js";

describe("TestMultipleLoaders", () => {
  afterEach(teardown);

  it("multiple independent loaders", async () => {
    const files: [string, string][] = [
      ["lib0/app0.ts", "export const App0 = class {}"],
      ["lib0/app0/foo.ts", "export class Foo {}"],
      ["lib1/app1/foo.ts", "export class Foo {}"],
      ["lib1/app1/foo/bar/baz.ts", "export class Baz {}"],
    ];
    await withFiles(files, async () => {
      await newLoader({ dirs: "lib0" });
      await newLoader({ dirs: "lib1" });

      expect(await get(await get(Object, "App0"), "Foo")).toBeTruthy();
      const foo = await get(await get(Object, "App1"), "Foo");
      expect(await get(await get(foo, "Bar"), "Baz")).toBeTruthy();
    });
  });

  it("multiple dependent loaders", async () => {
    const files: [string, string][] = [
      ["lib0/app0.ts", 'await globalThis.$get("App1"); export const App0 = class {}'],
      [
        "lib0/app0/foo.ts",
        'await globalThis.$get("Foo", await globalThis.$get("App1")); export class Foo {}',
      ],
      ["lib1/app1/foo.ts", 'await globalThis.$get("App0"); export class Foo {}'],
      [
        "lib1/app1/foo/bar/baz.ts",
        'await globalThis.$get("Foo", await globalThis.$get("App0")); export class Baz {}',
      ],
    ];
    await withFiles(files, async () => {
      await newLoader({ dirs: "lib0" });
      await newLoader({ dirs: "lib1" });

      expect(await get(await get(Object, "App0"), "Foo")).toBeTruthy();
      const foo = await get(await get(Object, "App1"), "Foo");
      expect(await get(await get(foo, "Bar"), "Baz")).toBeTruthy();
    });
  });
});
