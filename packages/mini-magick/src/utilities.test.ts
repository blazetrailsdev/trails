import "./test-helpers/spec-helper.js";
import { Utilities } from "./utilities.js";
import { expect, it, describe } from "vitest";

describe("MiniMagick::Utilities", () => {
  describe(".which", () => {
    it("identifies when executable exists", async () => {
      expect(await Utilities.which("mogrify")).not.toBeNull();
    });

    it("returns nil on nonexistent executables", async () => {
      expect(await Utilities.which("yogrify")).toBeNull();
    });
  });
});
