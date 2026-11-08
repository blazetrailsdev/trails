import { NoMethodError } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { ToField } from "./to-field.js";

describe("CommonAddressField#value=", () => {
  it("raises for an Array value", () => {
    const field = new ToField("a@b.c");
    expect(() => {
      field.value = ["x@y.z", "w@y.z"];
    }).toThrow(NoMethodError);
  });
});
