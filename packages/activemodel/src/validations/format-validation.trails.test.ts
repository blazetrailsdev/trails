/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Attributes` in its class body; the empty
   class/interface merge beside it is how `include()` surfaces those members on the type side. */
import { describe, it, expect } from "vitest";
import { include } from "@blazetrails/activesupport";
import { Model } from "../index.js";
import { Attributes, type AttributesClassHalf } from "../attributes.js";

describe("FormatValidationTest (trails-only)", () => {
  it("validate format does not mutate regex lastIndex across calls (g flag)", async () => {
    const sharedRe = /\d+/g;
    class P extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("code", "string");
        this.validates("code", { format: { with: sharedRe } });
      }
    }
    interface P extends Attributes {}

    expect(await new P({ code: "abc123" }).isValid()).toBe(true);
    expect(await new P({ code: "abc123" }).isValid()).toBe(true);
    expect(await new P({ code: "abc123" }).isValid()).toBe(true);
    expect(sharedRe.lastIndex).toBe(0);
  });
});
