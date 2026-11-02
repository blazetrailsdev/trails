import { afterEach, describe, expect, it } from "vitest";
import { GemLoader } from "./gem-loader.js";
import { Registry } from "./registry.js";
import { teardown, withFiles } from "./test-helpers/loader-test.js";

describe("Zeitwerk::Registry.loader_for_gem", () => {
  afterEach(teardown);

  it("returns the same GemLoader for the same root file", async () => {
    await withFiles([["lib/my_gem.ts", "export class MyGem {}"]], async () => {
      const options = { namespace: Object, warnOnExtraFiles: false };
      const loader = await Registry.loaderForGem("lib/my_gem.ts", options);

      expect(loader).toBeInstanceOf(GemLoader);
      expect(loader.tag).toEqual("my_gem");
      expect(await Registry.loaderForGem("lib/my_gem.ts", options)).toBe(loader);
    });
  });
});
