/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Attributes` in its class body; the empty
   class/interface merge beside it is how `include()` surfaces those members on the type side. */
import { describe, it, expect } from "vitest";
import { include } from "@blazetrails/activesupport";
import { Model, StrictValidationFailed } from "../index.js";
import { Attributes, type AttributesClassHalf } from "../attributes.js";

describe("PresenceValidationTest (trails-only)", () => {
  it("passes custom interpolation vars through to errors.add", async () => {
    class Interpolated extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.validates("name", { presence: { message: "is %{kind}", kind: "wrong" } });
      }
    }
    interface Interpolated extends Attributes {}

    const p = new Interpolated({});
    await p.isValid();
    expect(p.errors.messagesFor("name")).toContain("is wrong");
  });

  it("strict: true raises StrictValidationFailed via filteredErrorOptions", async () => {
    class Strict extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.validates("name", { presence: { strict: true } });
      }
    }
    interface Strict extends Attributes {}

    await expect(new Strict({}).isValid()).rejects.toThrow(StrictValidationFailed);
  });
});
