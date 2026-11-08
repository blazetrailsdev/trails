/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Attributes` in its class body; the empty
   class/interface merge beside it is how `include()` surfaces those members on the type side. */
import { describe, it, expect } from "vitest";
import { include } from "@blazetrails/activesupport";
import { Model } from "../index.js";
import { Attributes, type AttributesClassHalf } from "../attributes.js";

describe("InclusionValidationTest (trails-only)", () => {
  it("validates inclusion of with Set collection", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("role", "string");
        this.validates("role", { inclusion: { in: () => new Set(["admin", "user"]) } });
      }
    }
    interface Person extends Attributes {}

    expect(await new Person({ role: "admin" }).isValid()).toBe(true);
    expect(await new Person({ role: "guest" }).isValid()).toBe(false);
  });
});
