import { describe, expect, it } from "vitest";
import { Base } from "./base.js";

describe("Rails::Command::BaseTest", () => {
  it("::executable integrates ::bin", () => {
    class CustomBinCommand extends Base {
      static {
        this.bin = "FOO";
      }
    }

    expect(CustomBinCommand.executable()).toBe("FOO custom_bin");
  });
});
