import { describe, it, expect } from "vitest";
import { include, type Extended } from "@blazetrails/activesupport";
import { Callbacks as ValidationsCallbacks } from "./callbacks.js";

describe("ValidationsCallbacksStandaloneTest", () => {
  it("include ActiveModel::Validations::Callbacks alone wires ActiveSupport::Callbacks", () => {
    const history: string[] = [];

    class Dog {
      declare static beforeValidation: Extended<
        typeof ValidationsCallbacks.ClassMethods
      >["beforeValidation"];
    }
    include(Dog as never, ValidationsCallbacks);

    expect(() =>
      Dog.beforeValidation(() => history.push("before_validation_marker")),
    ).not.toThrow();
  });
});
