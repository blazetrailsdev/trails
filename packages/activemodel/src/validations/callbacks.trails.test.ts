import { describe, it, expect } from "vitest";
import { Callbacks as ASCallbacks, include, type Extended } from "@blazetrails/activesupport";
import { Callbacks as ValidationsCallbacks, setOptionsForCallback } from "./callbacks.js";

describe("ValidationsCallbacksStandaloneTest", () => {
  it("include ActiveModel::Validations::Callbacks alone wires ActiveSupport::Callbacks", () => {
    const history: string[] = [];

    class Dog {
      declare static setCallback: Extended<typeof ASCallbacks.ClassMethods>["setCallback"];
      declare static beforeValidation: (typeof ValidationsCallbacks.ClassMethods)["beforeValidation"];
    }
    include(Dog as never, ValidationsCallbacks);

    expect(() =>
      Dog.beforeValidation(() => history.push("before_validation_marker")),
    ).not.toThrow();
  });
});

describe("set_options_for_callback", () => {
  type Guard = (record: unknown) => boolean;

  it("wraps :on and puts the context guard ahead of the caller's :if", () => {
    const condition = () => true;
    const options: Parameters<typeof setOptionsForCallback>[0] = { on: "create", if: condition };
    setOptionsForCallback(options);
    expect(options.on).toEqual(["create"]);
    const [guard, kept] = options.if as [Guard, typeof condition];
    expect(kept).toBe(condition);
    expect(guard({ validationContext: ["update", "create"] })).toBe(true);
    expect(guard({ validationContext: "update" })).toBe(false);
    expect(guard({ validationContext: null })).toBe(false);
  });

  it("never matches a context when :on is empty", () => {
    const options: Parameters<typeof setOptionsForCallback>[0] = { on: [] };
    setOptionsForCallback(options);
    const [guard] = options.if as [Guard];
    expect((options.if as unknown[]).length).toBe(1);
    expect(guard({ validationContext: "create" })).toBe(false);
  });

  it("leaves the options alone without an :on key", () => {
    const condition = () => true;
    const options: Parameters<typeof setOptionsForCallback>[0] = { if: condition };
    setOptionsForCallback(options);
    expect(options).toEqual({ if: condition });
  });
});
