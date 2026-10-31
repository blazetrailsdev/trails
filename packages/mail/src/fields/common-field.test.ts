import { describe, expect, it } from "vitest";
import { FromField } from "./from-field.js";
import { SubjectField } from "./subject-field.js";

describe("Mail::CommonField", () => {
  describe("multi-charset support", () => {
    it("should return '' on to_s if there is no value", () => {
      expect(new SubjectField(null).toString()).toEqual("");
    });
    it("should leave ascii alone", () => {
      const field = new SubjectField("This is a test");
      expect(field.encoded()).toEqual("Subject: This is a test\r\n");
      expect(field.decoded()).toEqual("This is a test");
    });
    it("should encode a utf-8 string as utf-8 quoted printable", () => {
      const value = "かきくけこ";
      const result = "Subject: =?UTF-8?Q?=E3=81=8B=E3=81=8D=E3=81=8F=E3=81=91=E3=81=93?=\r\n";
      const field = new SubjectField(value);
      expect(field.encoded()).toEqual(result);
      expect(field.decoded()).toEqual(value);
      expect(field.value).toEqual(value);
    });
    it("should wrap an encoded at 60 characters", () => {
      const value =
        "かきくけこ かきくけこ かきくけこ かきくけこ かきくけこ かきくけこ かきくけこ かきくけこ かきくけこ";
      const result =
        "Subject: =?UTF-8?Q?=E3=81=8B=E3=81=8D=E3=81=8F=E3=81=91=E3=81=93?=\r\n =?UTF-8?Q?_=E3=81=8B=E3=81=8D=E3=81=8F=E3=81=91=E3=81=93?=\r\n =?UTF-8?Q?_=E3=81=8B=E3=81=8D=E3=81=8F=E3=81=91=E3=81=93?=\r\n =?UTF-8?Q?_=E3=81=8B=E3=81=8D=E3=81=8F=E3=81=91=E3=81=93?=\r\n =?UTF-8?Q?_=E3=81=8B=E3=81=8D=E3=81=8F=E3=81=91=E3=81=93?=\r\n =?UTF-8?Q?_=E3=81=8B=E3=81=8D=E3=81=8F=E3=81=91=E3=81=93?=\r\n =?UTF-8?Q?_=E3=81=8B=E3=81=8D=E3=81=8F=E3=81=91=E3=81=93?=\r\n =?UTF-8?Q?_=E3=81=8B=E3=81=8D=E3=81=8F=E3=81=91=E3=81=93?=\r\n =?UTF-8?Q?_=E3=81=8B=E3=81=8D=E3=81=8F=E3=81=91=E3=81=93?=\r\n";
      const field = new SubjectField(value);
      expect(field.encoded()).toEqual(result);
      expect(field.decoded()).toEqual(value);
      expect(field.value).toEqual(value);
    });
    it("should handle charsets in assigned addresses", () => {
      const value = '"かきくけこ" <mikel@test.lindsaar.net>';
      const result = "From: =?UTF-8?B?44GL44GN44GP44GR44GT?= <mikel@test.lindsaar.net>\r\n";
      const field = new FromField(value);
      expect(field.encoded()).toEqual(result);
      expect(field.decoded()).toEqual(value);
    });
  });
  describe("with content that looks like the field name", () => {
    it("does not strip from start", () => {
      const field = new SubjectField("Subject: for your approval");
      expect(field.decoded()).toEqual("Subject: for your approval");
    });
    it("does not strip from middle", () => {
      const field = new SubjectField("for your approval subject: xyz");
      expect(field.decoded()).toEqual("for your approval subject: xyz");
    });
  });
});
