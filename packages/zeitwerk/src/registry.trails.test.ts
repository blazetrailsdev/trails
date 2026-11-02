import { File } from "@blazetrails/ruby-compat";
import { afterEach, describe, expect, it } from "vitest";
import { Registry } from "./registry.js";
import { teardown, withFiles } from "./test-helpers/loader-test.js";

describe("Zeitwerk::Registry.loaderForPackage", () => {
  afterEach(teardown);

  it("builds one Loader per package.json, tagged and rooted from it", async () => {
    const files: [string, string][] = [
      ["my_package/package.json", '{ "name": "@scope/my_package" }'],
      ["my_package/src/foo.ts", "export class Foo {}"],
    ];
    await withFiles(files, async () => {
      const options = { namespace: Object };
      const loader = await Registry.loaderForPackage("my_package/package.json", options);

      expect(loader.tag).toEqual("my_package");
      expect(loader.dirs()).toEqual([File.expandPath("my_package/src")]);
      expect(await Registry.loaderForPackage("my_package/package.json", options)).toBe(loader);
    });
  });
});
