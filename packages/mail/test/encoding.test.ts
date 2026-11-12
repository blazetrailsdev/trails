import { describe, expect, it } from "vitest";
import { ArgumentError, Encoding, TypeError, forceEncoding } from "@blazetrails/ruby-compat";
import "../lib/index.js";
import { Mail } from "../lib/mail.js";
import type { Field } from "../lib/field.js";
import { SubjectField } from "../lib/fields/subject-field.js";
import { Part } from "../lib/part.js";
import { Utilities } from "../lib/utilities.js";

describe("mail encoding", () => {
  it("should allow you to assign an email-wide charset", () => {
    const mail = Mail.new();
    mail.charset = "utf-8";
    expect(mail.charset).toEqual("utf-8");
  });

  describe("using default encoding", () => {
    it("should allow you to send in unencoded strings to fields and encode them", () => {
      const mail = Mail.new();
      mail.charset = "utf-8";
      mail.setSubject("This is あ string");
      const result = "Subject: =?UTF-8?Q?This_is_=E3=81=82_string?=\r\n";
      expect((mail.get("subject") as Field).encoded()).toEqual(result);
    });

    it("should allow you to send in unencoded strings to address fields and encode them", () => {
      const mail = Mail.new();
      mail.charset = "utf-8";
      mail.setTo("Mikel Lindsああr <mikel@test.lindsaar.net>");
      const result = "To: =?UTF-8?B?TWlrZWwgTGluZHPjgYLjgYJy?= <mikel@test.lindsaar.net>\r\n";
      expect((mail.get("to") as Field).encoded()).toEqual(result);
    });

    it("should allow you to send in unencoded strings to address fields and encode them", () => {
      const mail = Mail.new();
      mail.charset = "utf-8";
      mail.setTo("あdあ <ada@test.lindsaar.net>");
      const result = "To: =?UTF-8?B?44GCZOOBgg==?= <ada@test.lindsaar.net>\r\n";
      expect((mail.get("to") as Field).encoded()).toEqual(result);
    });

    it("should allow you to send in multiple unencoded strings to address fields and encode them", () => {
      const mail = Mail.new();
      mail.charset = "utf-8";
      mail.setTo(["Mikel Lindsああr <mikel@test.lindsaar.net>", "あdあ <ada@test.lindsaar.net>"]);
      const result =
        "To: =?UTF-8?B?TWlrZWwgTGluZHPjgYLjgYJy?= <mikel@test.lindsaar.net>, \r\n =?UTF-8?B?44GCZOOBgg==?= <ada@test.lindsaar.net>\r\n";
      expect((mail.get("to") as Field).encoded()).toEqual(result);
    });

    it("should allow you to send unquoted non us-ascii strings, with spaces in them", () => {
      const mail = Mail.new();
      mail.charset = "utf-8";
      mail.setTo(["Foo áëô îü <extended@example.net>"]);
      const result = "To: =?UTF-8?B?Rm9vIMOhw6vDtCDDrsO8?= <extended@example.net>\r\n";
      expect((mail.get("to") as Field).encoded()).toEqual(result);
    });

    it("should allow you to send in multiple unencoded strings to any address field", () => {
      const mail = Mail.new();
      mail.charset = "utf-8";
      const setters = {
        To: "setTo",
        From: "setFrom",
        Cc: "setCc",
        "Reply-To": "setReplyTo",
      } as const;
      for (const [field, setter] of Object.entries(setters)) {
        mail[setter]([
          "Mikel Lindsああr <mikel@test.lindsaar.net>",
          "あdあ <ada@test.lindsaar.net>",
        ]);
        const result = `${field}: =?UTF-8?B?TWlrZWwgTGluZHPjgYLjgYJy?= <mikel@test.lindsaar.net>, \r\n =?UTF-8?B?44GCZOOBgg==?= <ada@test.lindsaar.net>\r\n`;
        expect((mail.get(field) as Field).encoded()).toEqual(result);
      }
    });

    it("should handle groups", () => {
      const mail = Mail.new();
      mail.charset = "utf-8";
      mail.setTo("test1@lindsaar.net, group: test2@lindsaar.net, me@lindsaar.net;");
      const result =
        "To: test1@lindsaar.net, \r\n group: test2@lindsaar.net, \r\n me@lindsaar.net;\r\n";
      expect((mail.get("to") as Field).encoded()).toEqual(result);
    });

    it("should handle groups with funky characters", () => {
      const mail = Mail.new();
      mail.charset = "utf-8";
      mail.setTo(
        '"Mikel Lindsああr" <test1@lindsaar.net>, group: "あdあ" <test2@lindsaar.net>, me@lindsaar.net;',
      );
      const result =
        "To: =?UTF-8?B?TWlrZWwgTGluZHPjgYLjgYJy?= <test1@lindsaar.net>, \r\n group: =?UTF-8?B?44GCZOOBgg==?= <test2@lindsaar.net>, \r\n me@lindsaar.net;\r\n";
      expect((mail.get("to") as Field).encoded()).toEqual(result);
    });

    describe("quoting token safe chars", () => {
      it("should not quote the display name if unquoted", () => {
        const mail = Mail.new();
        mail.charset = "utf-8";
        mail.setTo("Mikel Lindsaar <mikel@test.lindsaar.net>");
        expect((mail.get("to") as Field).encoded()).toEqual(
          "To: Mikel Lindsaar <mikel@test.lindsaar.net>\r\n",
        );
      });

      it("should not quote the display name if already quoted", () => {
        const mail = Mail.new();
        mail.charset = "utf-8";
        mail.setTo('"Mikel Lindsaar" <mikel@test.lindsaar.net>');
        expect((mail.get("to") as Field).encoded()).toEqual(
          "To: Mikel Lindsaar <mikel@test.lindsaar.net>\r\n",
        );
      });
    });

    describe("quoting token unsafe chars", () => {
      it("should quote the display name", () => {
        const mail = Mail.new();
        mail.charset = "utf-8";
        mail.setTo("Mikel @ me Lindsaar <mikel@test.lindsaar.net>");
        expect((mail.get("to") as Field).encoded()).toEqual(
          'To: "Mikel @ me Lindsaar" <mikel@test.lindsaar.net>\r\n',
        );
      });

      it("should preserve quotes needed from the user and not double quote", () => {
        const mail = Mail.new();
        mail.charset = "utf-8";
        mail.setTo('"Mikel @ me Lindsaar" <mikel@test.lindsaar.net>');
        expect((mail.get("to") as Field).encoded()).toEqual(
          'To: "Mikel @ me Lindsaar" <mikel@test.lindsaar.net>\r\n',
        );
      });
    });
  });

  // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either"
  describe("specifying an email-wide encoding", () => {
    const latin1 = (s: string): Uint8Array =>
      forceEncoding(
        Uint8Array.from(s, (c) => c.charCodeAt(0)),
        "ISO8859-1",
      ) as Uint8Array;

    it.skip("should allow you to send in unencoded strings to fields and encode them", () => {
      const mail = Mail.new();
      mail.charset = "ISO-8859-1";
      mail.setSubject(latin1("This is \xE4 string"));
      const result = (mail.get("subject") as Field).encoded();
      expect(result).toEqual("Subject: =?ISO-8859-1?Q?This_is_=E4_string?=\r\n");
    });

    it.skip("should allow you to send in unencoded strings to address fields and encode them", () => {
      const mail = Mail.new();
      mail.charset = "ISO-8859-1";
      mail.setTo(latin1("Mikel Linds\xE4r <mikel@test.lindsaar.net>"));
      const result = (mail.get("to") as Field).encoded();
      expect(result).toEqual(
        "To: Mikel =?ISO-8859-1?B?TGluZHPkcg==?= <mikel@test.lindsaar.net>\r\n",
      );
    });

    it.skip("should allow you to send in multiple unencoded strings to address fields and encode them", () => {
      const mail = Mail.new();
      mail.charset = "ISO-8859-1";
      mail.setTo(
        ["Mikel Linds\xE4r <mikel@test.lindsaar.net>", "\xE4d <ada@test.lindsaar.net>"].map(latin1),
      );
      const result = (mail.get("to") as Field).encoded();
      expect(result).toEqual(
        "To: Mikel =?ISO-8859-1?B?TGluZHPkcg==?= <mikel@test.lindsaar.net>, \r\n =?ISO-8859-1?B?5GQ=?= <ada@test.lindsaar.net>\r\n",
      );
    });

    const setters = {
      To: "setTo",
      From: "setFrom",
      Cc: "setCc",
      "Reply-To": "setReplyTo",
    } as const;
    for (const [field, setter] of Object.entries(setters)) {
      it.skip(`allows multiple unencoded strings in ${field}`, () => {
        const array = [
          "Mikel Linds\xE4r <mikel@test.lindsaar.net>",
          "\xE4d <ada@test.lindsaar.net>",
        ].map(latin1);
        const mail = Mail.new();
        mail.charset = "ISO-8859-1";

        mail[setter](array);
        expect((mail.get(field) as Field).field.errors).toEqual([]);

        const result = (mail.get(field) as Field).encoded();
        expect(result).toEqual(
          `${field}: Mikel =?ISO-8859-1?B?TGluZHPkcg==?= <mikel@test.lindsaar.net>, \r\n =?ISO-8859-1?B?5GQ=?= <ada@test.lindsaar.net>\r\n`,
        );
      });
    }
  });

  it("should let you define a charset per part", () => {
    const mail = Mail.new();
    const part = new Part();
    part.setContentType("text/html");
    part.charset = "ISO-8859-1";
    part.setBody("blah");
    mail.addPart(part);
    expect(mail.parts[0].contentType()).toEqual("text/html; charset=ISO-8859-1");
  });

  it("should replace invalid characters", () => {
    const m = Mail.new();
    m.set("Subject", new SubjectField("=?utf-8?Q?Hello_=96_World?="));
    const replace = "�";
    expect(m.subject()).toEqual(`Hello ${replace} World`);
  });

  it("should replace characters of unknown and invalid encoding", () => {
    const m = Mail.new();
    m.set("Subject", new SubjectField("Hello=?UNKNOWN?B?4g==?="));
    const replace = "�";
    expect(m.subject()).toEqual(`Hello${replace}`);
  });

  describe("#pick_encoding", () => {
    it("picks binary for nil", () => {
      expect(() => Encoding.find(null as never)).toThrow(TypeError);
      expect(Utilities.pickEncoding(null)).toEqual(Encoding.BINARY);
    });

    const cases: [string, Encoding][] = [
      ["latin2", Encoding.find("ISO-8859-2")!],
      ["ISO_8859-1", Encoding.find("ISO-8859-1")!],
      ["cp-850", Encoding.find("CP850")!],
      ["", Encoding.BINARY],
    ];
    for (const [from, to] of cases) {
      it(`should support ${from}`, () => {
        expect(() => Encoding.find(from)).toThrow(ArgumentError);
        expect(Utilities.pickEncoding(from)).toEqual(to);
      });
    }
  });
});
