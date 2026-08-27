/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Attributes` in its class body, the way the Rails
   test model it mirrors does (attributes_test.rb:6-8); the empty class/interface merge beside it is
   how `include()` surfaces those members on the type side. */
import { describe, it, expect } from "vitest";
import { Model } from "./index.js";
import { ForbiddenAttributesError } from "./forbidden-attributes-protection.js";
import { Attributes, type AttributesClassHalf } from "./attributes.js";
import { include } from "@blazetrails/activesupport";

class Account extends Model {
  declare static attribute: AttributesClassHalf["attribute"];

  static {
    include(this, Attributes);
    this.attribute("name", "string");
  }
}

interface Account extends Attributes {}

class ProtectedParams {
  private parameters: Record<string, unknown>;
  private _permitted = false;

  constructor(attributes: Record<string, unknown>) {
    this.parameters = attributes;
  }

  permitted(): boolean {
    return this._permitted;
  }

  permitBang(): this {
    this._permitted = true;
    return this;
  }

  toH(): Record<string, unknown> {
    return this.parameters;
  }
}

describe("ActiveModelMassUpdateProtectionTest", () => {
  it("forbidden attributes cannot be used for mass updating", () => {
    const params = new ProtectedParams({ a: "b" });
    expect(() =>
      new Account().sanitizeForbiddenAttributes(params as unknown as Record<string, unknown>),
    ).toThrow(ForbiddenAttributesError);
  });

  it("permitted attributes can be used for mass updating", () => {
    const params = new ProtectedParams({ a: "b" }).permitBang();
    expect(
      new Account().sanitizeForbiddenAttributes(params as unknown as Record<string, unknown>),
    ).toEqual({ a: "b" });
  });

  it("regular attributes should still be allowed", () => {
    expect(new Account().sanitizeForbiddenAttributes({ a: "b" })).toEqual({ a: "b" });
  });
});
