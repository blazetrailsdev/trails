/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   `Account` spells `include ActiveModel::Attributes` in its class body; the empty class/interface
   merge beside it is how `include()` surfaces those members on the type side. */
import { describe, it, expect } from "vitest";
import {
  Attributes,
  type AttributesClassHalf,
  Model,
  ForbiddenAttributesError,
} from "@blazetrails/activemodel";
import { include } from "@blazetrails/activesupport";
import { Parameters } from "../../metal/strong-parameters.js";

class Account extends Model {
  declare static attribute: AttributesClassHalf["attribute"];

  static {
    include(this, Attributes);
    this.attribute("name", "string");
  }
}
interface Account extends Attributes {}

describe("MassAssignmentEmptyParametersTest", () => {
  it("empty Parameters is a no-op at construction", () => {
    const params = new Parameters({});
    let record: Account | undefined;
    expect(() => {
      record = new Account(params as unknown as Record<string, unknown>);
    }).not.toThrow();
    expect(record!._readAttribute("name")).toBeNull();
  });

  it("non-empty Parameters proceeds past the empty-bag guard at construction", () => {
    expect(new Parameters({ name: "Bob" }).empty).toBe(false);
    expect(
      () => new Account(new Parameters({ name: "Bob" }) as unknown as Record<string, unknown>),
    ).toThrow(ForbiddenAttributesError);
  });
});

describe("ParametersForbiddenAttributesTest", () => {
  it("forbidden attributes cannot be used for mass assignment", () => {
    const params = new Parameters({ name: "Bob" });
    expect(params.permitted).toBe(false);
    expect(() => new Account(params as unknown as Record<string, unknown>)).toThrow(
      ForbiddenAttributesError,
    );
  });

  it("permitted attributes can be used for mass assignment", () => {
    const params = new Parameters({ name: "Bob" }).permitAll();
    expect(params.permitted).toBe(true);
    const record = new Account(params as unknown as Record<string, unknown>);
    expect(record._readAttribute("name")).toBe("Bob");
  });
});
