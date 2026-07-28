import { describe, it, expect } from "vitest";
import { Model } from "./index.js";
import { ForbiddenAttributesError } from "./forbidden-attributes-protection.js";

class Account extends Model {
  static {
    this.attribute("name", "string");
  }
}

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
