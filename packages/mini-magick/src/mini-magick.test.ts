import { MiniMagick } from "./namespaces.js";
import "./test-helpers/spec-helper.js";
import { expect, it, describe } from "vitest";

describe("MiniMagick", () => {
  describe(".cli_version", () => {
    it("returns ImageMagick's version", async () => {
      expect(await MiniMagick.cliVersion()).toMatch(/^\d+\.\d+\.\d+-\d+$/m);
    });
  });
});
