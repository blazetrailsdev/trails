import { describe, expect, it } from "vitest";
import { ResentSenderField } from "./resent-sender-field.js";

describe("Mail::ResentSenderField", () => {
  describe("initialization", () => {
    it("should initialize", () => {
      expect(() => new ResentSenderField("Mikel")).not.toThrow();
    });
    it("should accept a string without the field name", () => {
      const t = new ResentSenderField(
        'Mikel Lindsaar <mikel@test.lindsaar.net>, "Bob Smith" <bob@me.com>',
      );
      expect(t.name).toEqual("Resent-Sender");
      expect(t.value).toEqual('Mikel Lindsaar <mikel@test.lindsaar.net>, "Bob Smith" <bob@me.com>');
    });
  });
  it("formats the sender", () => {
    const field = new ResentSenderField("Mikel Lindsaar <mikel@test.lindsaar.net>");
    expect([...field.formatted()]).toEqual(["Mikel Lindsaar <mikel@test.lindsaar.net>"]);
  });
  it("parses a single sender address", () => {
    const field = new ResentSenderField("Mikel Lindsaar <mikel@test.lindsaar.net>");
    expect(field.address()).toEqual("mikel@test.lindsaar.net");
  });
  it("returns the field value", () => {
    const field = new ResentSenderField("Mikel Lindsaar <mikel@test.lindsaar.net>");
    expect(field.value).toEqual("Mikel Lindsaar <mikel@test.lindsaar.net>");
  });
  it("encodes a header line", () => {
    const field = new ResentSenderField("Mikel Lindsaar <mikel@test.lindsaar.net>");
    expect(field.encoded()).toEqual("Resent-Sender: Mikel Lindsaar <mikel@test.lindsaar.net>\r\n");
  });
});
