/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Attributes` in its class body, the way the Rails
   test model it mirrors does (attributes_test.rb:6-8); the empty class/interface merge beside it is
   how `include()` surfaces those members on the type side. */
import { describe, it, expect } from "vitest";
import { Model } from "../index.js";
import { Attributes, type AttributesClassHalf } from "../attributes.js";
import { include } from "@blazetrails/activesupport";

class FailingValidator {
  validate(record: { errors: { add: (attr: string, type: string) => void } }): void {
    record.errors.add("name", ":invalid");
  }
}

describe("ValidatesWith (trails-only)", () => {
  it("registers the validator itself, so skipCallback finds it by reference", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];
      declare static validatesWith: (...args: unknown[]) => void;

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.validatesWith(FailingValidator);
      }
    }
    interface Person extends Attributes {}

    const person = new Person();
    expect(await person.isValid()).toBe(false);

    const validator = Person._validators.get(null)![0];
    expect(validator).toBeInstanceOf(FailingValidator);

    (
      Person as unknown as { skipCallback(name: string, kind: string, filter: unknown): void }
    ).skipCallback("validate", "before", validator);
    person.errors.clear();
    expect(await person.isValid()).toBe(true);
  });
});
