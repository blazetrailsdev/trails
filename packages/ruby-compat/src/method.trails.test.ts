import { describe, expect, it } from "vitest";
import { rbObjMethod } from "./method.js";
import { NameError } from "./name-error.js";

describe("rbObjMethod", () => {
  class Missing {
    respondToMissing(method: string): boolean {
      return method === "forwarded";
    }

    methodMissing(method: string, ...args: unknown[]): unknown {
      return [method, ...args];
    }
  }

  it("binds a method_missing-backed Method when respond_to_missing? answers", () => {
    const method = rbObjMethod(new Missing(), "forwarded");
    expect(method.name()).toEqual("forwarded");
    expect(method.call(1)).toEqual(["forwarded", 1]);
  });

  it("raises NameError for a name the receiver does not answer", () => {
    expect(() => rbObjMethod(new Missing(), "nope")).toThrow(NameError);
    expect(() => rbObjMethod(new Missing(), "nope")).toThrow(
      "undefined method 'nope' for an instance of Missing",
    );
  });
});
