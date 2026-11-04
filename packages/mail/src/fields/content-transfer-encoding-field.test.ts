import { describe, expect, it } from "vitest";
import { Field } from "../field.js";
import { ContentTransferEncodingField } from "./content-transfer-encoding-field.js";

describe("Mail::ContentTransferEncodingField", () => {
  describe("initialization", () => {
    it("should initialize", () => {
      expect(() => new ContentTransferEncodingField("7bit")).not.toThrow();
    });
    it("should accept a string without the field name", () => {
      const t = new ContentTransferEncodingField("7bit");
      expect(t.name).toEqual("Content-Transfer-Encoding");
      expect(t.value).toEqual("7bit");
    });
    it("should render an encoded field", () => {
      const t = new ContentTransferEncodingField("7bit");
      expect(t.encoded()).toEqual("Content-Transfer-Encoding: 7bit\r\n");
    });
    it("should render a decoded field", () => {
      const t = new ContentTransferEncodingField("7bit");
      expect(t.decoded()).toEqual("7bit");
    });
  });
  describe("parsing the value", () => {
    it("should return an encoding string", () => {
      ["7bit", "8bit", "binary", "quoted-printable", "base64"].forEach((encoding) => {
        const t = new ContentTransferEncodingField(encoding);
        expect(t.encoding()).toEqual(encoding);
      });
    });
    it("should treat 7bits/7-bit and 8bits/8-bit as 7bit and 8bit", () => {
      ["7bits", "7-bit"].forEach((mechanism) => {
        expect(new ContentTransferEncodingField(mechanism).encoding()).toEqual("7bit");
      });
      ["8bits", "8-bit"].forEach((mechanism) => {
        expect(new ContentTransferEncodingField(mechanism).encoding()).toEqual("8bit");
      });
    });
    it("should handle any valid 'x-token' value", () => {
      const t = new ContentTransferEncodingField("X-This-is_MY-encoding");
      expect(t.encoding()).toEqual("x-this-is_my-encoding");
    });
    it("should handle an x-encoding", () => {
      const t = new ContentTransferEncodingField("x-uuencode");
      expect(t.encoding()).toEqual("x-uuencode");
    });
    it("should handle an ietf encoding (practically, any token)", () => {
      const t = new ContentTransferEncodingField("ietf-token");
      expect(t.encoding()).toEqual("ietf-token");
    });
    it("should raise an error on bogus values", () => {
      expect(() => new ContentTransferEncodingField("broken@foo")).toThrow(Field.ParseError);
    });
    it("should handle an empty content transfer encoding", () => {
      const t = new ContentTransferEncodingField("");
      expect(t.encoding()).toEqual("");
    });
    it("should handle a hyphen", () => {
      let t = new ContentTransferEncodingField("7-bit");
      expect(t.decoded()).toEqual("7bit");
      t = new ContentTransferEncodingField("8-bit");
      expect(t.decoded()).toEqual("8bit");
    });
  });
});
