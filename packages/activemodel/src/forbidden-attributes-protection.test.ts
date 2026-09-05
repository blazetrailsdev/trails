import { describe, it, expect } from "vitest";
import { ForbiddenAttributesError } from "./forbidden-attributes-protection.js";
import { Account } from "./test-helpers/models/account.js";

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

  keys(): string[] {
    return Object.keys(this.parameters);
  }

  isKey(key: string): boolean {
    return Object.hasOwn(this.parameters, key);
  }

  hasKey(key: string): boolean {
    return Object.hasOwn(this.parameters, key);
  }

  isEmpty(): boolean {
    return Object.keys(this.parameters).length === 0;
  }

  toH(): Record<string, unknown> {
    return this.parameters;
  }
}

describe("ActiveModelMassUpdateProtectionTest", () => {
  it("forbidden attributes cannot be used for mass updating", () => {
    const params = new ProtectedParams({ a: "b" });
    expect(() =>
      new Account().sanitizeForMassAssignment(params as unknown as Record<string, unknown>),
    ).toThrow(ForbiddenAttributesError);
  });

  it("permitted attributes can be used for mass updating", () => {
    const params = new ProtectedParams({ a: "b" }).permitBang();
    expect(
      new Account().sanitizeForMassAssignment(params as unknown as Record<string, unknown>),
    ).toEqual({ a: "b" });
  });

  it("regular attributes should still be allowed", () => {
    expect(new Account().sanitizeForMassAssignment({ a: "b" })).toEqual({ a: "b" });
  });
});
