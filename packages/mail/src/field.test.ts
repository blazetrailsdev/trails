import { describe, expect, it, vi } from "vitest";
import { DateTimeElement, SubjectField } from "./index.js";
import { ArgumentError, stderr } from "@blazetrails/ruby-compat";
import { Field, OptionalField, ToField } from "./index.js";

describe("Mail::Field", () => {
  describe("parsing", () => {
    it("parses full header fields", () => {
      const write = vi.spyOn(stderr, "write");
      const field = Field.parse("To: Mikel")!;
      expect(write).not.toHaveBeenCalled();
      write.mockRestore();
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
      const errors = field.field.errors as unknown[][];
      expect(errors.length).toEqual(1);
      expect(errors[0][0]).toEqual("Content-Transfer-Encoding");
      expect(errors[0][1]).toEqual("8@bit");
      expect(String(errors[0][2])).toMatch(/ContentTransferEncodingElement can not parse /);
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

  describe("user defined fields", () => {
    it('should say it is the "same" as another if their field names match', () => {
      expect(new Field("X-Foo", "mikel").same(new Field("X-Foo", "bob"))).toBe(true);
    });

    it("should say it is not == to another if their field names do not match", () => {
      expect(new Field("X-Foo", "mikel").equals(new Field("X-Bar", "bob"))).not.toEqual(true);
    });
  });

  describe("passing an encoding", () => {
    it("should allow you to send in unencoded strings to fields and encode them", () => {
      const subject = new SubjectField("This is あ string", "utf-8");
      expect(subject.encoded()).toEqual("Subject: =?UTF-8?Q?This_is_=E3=81=82_string?=\r\n");
      expect(subject.decoded()).toEqual("This is あ string");
    });

    it("should allow an encoded value in the Subject field and decode it automatically (issue 44)", () => {
      expect(new SubjectField("=?ISO-8859-1?Q?2_=FAlt?=", "utf-8").decoded()).toEqual("2 últ");
    });

    it("should allow you to encoded text in the middle (issue 44)", () => {
      expect(new SubjectField("ma=?ISO-8859-1?Q?=F1ana?=", "utf-8").decoded()).toEqual("mañana");
    });
  });

  describe("Mail::Field::ParseError", () => {
    it("should be structured", () => {
      let error: InstanceType<typeof Field.ParseError> | null = null;
      try {
        new DateTimeElement("invalid");
      } catch (e) {
        error = e as InstanceType<typeof Field.ParseError>;
      }
      expect(error).not.toBeNull();
      expect(error!.element).toBe(DateTimeElement);
      expect(error!.value).toEqual("invalid");
      expect(error!.reason).not.toBeNull();
    });
  });
});
