import { describe, it, expect } from "vitest";
import { include } from "@blazetrails/activesupport";
import { Callbacks as ValidationsCallbacks } from "./callbacks.js";

describe("ValidationsCallbacksStandaloneTest", () => {
  it("include ActiveModel::Validations::Callbacks alone wires ActiveSupport::Callbacks", () => {
    const history: string[] = [];

    class Dog {}
    include(Dog as never, ValidationsCallbacks);

    const dogClass = Dog as unknown as {
      beforeValidation(fn: () => void): void;
    };
    expect(() =>
      dogClass.beforeValidation(() => history.push("before_validation_marker")),
    ).not.toThrow();
  });
});
