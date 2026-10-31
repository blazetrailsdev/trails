import { describe, expect, it } from "vitest";
import { SenderField } from "./sender-field.js";

describe("Mail::SenderField", () => {
  describe("initialization", () => {
    it("should initialize", () => {
      expect(() => new SenderField("Mikel")).not.toThrow();
    });
    it("should accept a string without the field name", () => {
      const t = new SenderField("Mikel Lindsaar <mikel@test.lindsaar.net>");
      expect(t.name).toEqual("Sender");
      expect(t.value).toEqual("Mikel Lindsaar <mikel@test.lindsaar.net>");
    });
  });
  it("formats the sender", () => {
    const field = new SenderField("Mikel Lindsaar <mikel@test.lindsaar.net>");
    expect([...field.formatted()]).toEqual(["Mikel Lindsaar <mikel@test.lindsaar.net>"]);
  });
  it("parses a single sender address", () => {
    const field = new SenderField("Mikel Lindsaar <mikel@test.lindsaar.net>");
    expect(field.address()).toEqual("mikel@test.lindsaar.net");
  });
  it("returns the field value", () => {
    const field = new SenderField("Mikel Lindsaar <mikel@test.lindsaar.net>");
    expect(field.value).toEqual("Mikel Lindsaar <mikel@test.lindsaar.net>");
  });
  it("encodes a header line", () => {
    const field = new SenderField("Mikel Lindsaar <mikel@test.lindsaar.net>");
    expect(field.encoded()).toEqual("Sender: Mikel Lindsaar <mikel@test.lindsaar.net>\r\n");
  });
});
