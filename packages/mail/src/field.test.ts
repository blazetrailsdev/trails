import { describe, expect, it } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { ContentTransferEncodingField, Field, OptionalField, ToField } from "./index.js";

describe("Mail::Field", () => {
  describe("parsing", () => {
    it("parses full header fields", () => {
      const field = Field.parse("To: Mikel")!;
      expect(field.name).toEqual("To");
      expect(field.value).toEqual("Mikel");
      expect(field.field).toBeInstanceOf(ToField);
    });
  });

  describe("initialization", () => {
    it("raises if instantiating by parsing a full header field", () => {
      expect(() => new Field("To: Mikel")).toThrow(ArgumentError);
    });

    it("should say anything that is not a known field is an optional field", () => {
      for (const sf of ["Too", "Becc", "bccc", "Random", "X-Mail", "MySpecialField"]) {
        const field = Field.parse(`${sf}: 😊`)!;
        expect(field.field).toBeInstanceOf(OptionalField);
        expect(field.name).toEqual(sf);
        expect(field.value).toEqual("😊");
      }
    });

    it("should inherit charset", () => {
      expect(new Field("Subject", "こんにちは", "iso-2022-jp").charset).toEqual("iso-2022-jp");
    });
  });

  describe("error handling", () => {
    it("should populate the errors array if it finds a field it can't deal with", () => {
      const field = new Field("Content-Transfer-Encoding", "8@bit");
      expect(field.field).not.toBeInstanceOf(ContentTransferEncodingField);
      const errors = field.field.errors as unknown[][];
      expect(errors.length).toEqual(1);
      expect(errors[0][0]).toEqual("Content-Transfer-Encoding");
      expect(errors[0][1]).toEqual("8@bit");
    });
  });

  describe("helper methods", () => {
    it('should say it is the "same" as another if their field types match', () => {
      expect(new Field("To", "mikel").same(new Field("To", "bob"))).toBe(true);
    });

    it('should say it is not the "same" as nil', () => {
      expect(new Field("To", "mikel").same(null)).toBe(false);
    });
  });
});
