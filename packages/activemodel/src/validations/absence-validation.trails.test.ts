/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Attributes` in its class body; the empty
   class/interface merge beside it is how `include()` surfaces those members on the type side. */
import { describe, it, expect } from "vitest";
import { include } from "@blazetrails/activesupport";
import { Model } from "../index.js";
import { Attributes, type AttributesClassHalf } from "../attributes.js";

describe("AbsenceValidationTest (trails-only)", () => {
  it("passes custom interpolation vars through to errors.add", async () => {
    class Interpolated extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.validates("name", { absence: { message: "must be %{kind}", kind: "empty" } });
      }
    }
    interface Interpolated extends Attributes {}

    const p = new Interpolated({ name: "Alice" });
    await p.isValid();
    expect(p.errors.messagesFor("name")).toContain("must be empty");
  });
});
