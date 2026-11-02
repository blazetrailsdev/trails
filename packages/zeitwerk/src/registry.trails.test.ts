import { File } from "@blazetrails/ruby-compat";
import { afterEach, describe, expect, it } from "vitest";
import { Registry } from "./registry.js";
import { teardown, withFiles } from "./test-helpers/loader-test.js";

describe("Zeitwerk::Registry.loader_for_gem", () => {
  afterEach(teardown);

  it("builds one Loader per package.json, tagged and rooted from it", async () => {
    const files: [string, string][] = [
      ["my_gem/package.json", '{ "name": "@scope/my_gem" }'],
      ["my_gem/src/foo.ts", "export class Foo {}"],
    ];
    await withFiles(files, async () => {
      const options = { namespace: Object };
      const loader = await Registry.loaderForGem("my_gem/package.json", options);

      expect(loader.tag).toEqual("my_gem");
      expect(loader.dirs()).toEqual([File.expandPath("my_gem/src")]);
      expect(await Registry.loaderForGem("my_gem/package.json", options)).toBe(loader);
    });
  });
});
