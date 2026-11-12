import { NoMethodError } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { ToField } from "../../lib/fields/to-field.js";

describe("CommonAddressField#value=", () => {
  it("raises for an Array value", () => {
    const field = new ToField("a@b.c");
    expect(() => {
      field.value = ["x@y.z", "w@y.z"];
    }).toThrow(NoMethodError);
  });
});

describe("CommonAddressField#encode_if_needed", () => {
  it("passes a binary-read UTF-8 address through as a string", () => {
    const field = new ToField("a@b.c");
    const bytes = new TextEncoder().encode("Mikel Lindsäar <mikel@test.lindsaar.net>");
    expect(field.encodeIfNeeded(bytes, null)).toBe("Mikel Lindsäar <mikel@test.lindsaar.net>");
  });
});
