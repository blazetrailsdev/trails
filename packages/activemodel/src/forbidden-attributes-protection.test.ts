import { describe, it, expect } from "vitest";
import { Model } from "./index.js";
import { ForbiddenAttributesError } from "./forbidden-attributes-protection.js";

class Account extends Model {
  static {
    this.attribute("name", "string");
  }
}

// Mirrors Rails' ProtectedParams stub (forbidden_attributes_protection_test.rb):
// a params-like wrapper exposing `permitted?` and `to_h`. Trails dispatches on
// the camelCase `permitted` / `toH` members.
class ProtectedParams {
  private parameters: Record<string, unknown>;
  private _permitted = false;

  constructor(attributes: Record<string, unknown>) {
    this.parameters = attributes;
  }

  permitted(): boolean {
    return this._permitted;
  }

  permit(): this {
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
    const params = new ProtectedParams({ a: "b" }).permit();
    expect(
      new Account().sanitizeForbiddenAttributes(params as unknown as Record<string, unknown>),
    ).toEqual({ a: "b" });
  });

  it("regular attributes should still be allowed", () => {
    expect(new Account().sanitizeForbiddenAttributes({ a: "b" })).toEqual({ a: "b" });
  });
});
