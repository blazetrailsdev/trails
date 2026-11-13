import { describe, expect, it, vi } from "vitest";
import { CcField, DateTimeElement, FromField, MessageIdField, ReplyToField } from "../lib/index.js";
import { SubjectField, UnstructuredField } from "../lib/index.js";
import { Mail } from "../lib/mail.js";
import { ArgumentError, capitalize, constGet, rbModName } from "@blazetrails/ruby-compat";
import { rbObjAsString, rbObjRespondTo, sort, stderr } from "@blazetrails/ruby-compat";
import { Field, OptionalField, ToField } from "../lib/index.js";

describe("Mail::Field", () => {
  describe("parsing", () => {
    it("parses full header fields", () => {
      const write = vi.spyOn(stderr, "write");
      let field: Field;
      try {
        field = Field.parse("To: Mikel")!;
        expect(write).not.toHaveBeenCalled();
      } finally {
        write.mockRestore();
      }
      expect(field.name).toEqual("To");
      expect(field.value).toEqual("Mikel");
      expect(field.field).toBeInstanceOf(ToField);
    });

    it("parses missing whitespace", () => {
      const field = Field.parse("To:Bob")!;
      expect(field.name).toEqual("To");
      expect(field.value).toEqual("Bob");
    });

    it("parses added inapplicable whitespace", () => {
      const field = Field.parse(
        "To                  :                   Bob                      ",
      )!;
      expect(field.name).toEqual("To");
      expect(field.value).toEqual("Bob");
    });
  });

  describe("initialization", () => {
    it("raises if instantiating by parsing a full header field", () => {
      expect(() => new Field("To: Mikel")).toThrow(ArgumentError);
    });

    it("instantiates with name and value", () => {
      expect(new Field("To", "Mikel").field).toBeInstanceOf(ToField);
    });

    it("accepts arrays of values", () => {
      const field = new Field("To", ["test1@lindsaar.net", "Mikel <test2@lindsaar.net>"]);
      expect([...(field as unknown as ToField).addresses()]).toEqual([
        "test1@lindsaar.net",
        "test2@lindsaar.net",
      ]);
    });

    it("accepts omitted values", () => {
      expect(new Field("To").field).toBeInstanceOf(ToField);
    });

    it("should match up fields to class names", () => {
      const structuredFields = `Date From Sender Reply-To To Cc Bcc Message-ID In-Reply-To
        References Keywords Resent-Date Resent-From Resent-Sender
        Resent-To Resent-Cc Resent-Bcc Resent-Message-ID
        Return-Path Received Subject Comments Mime-Version
        Content-Transfer-Encoding Content-Description
        Content-Disposition Content-Type`.split(/\s+/);
      for (const sf of structuredFields) {
        const words = sf.split("-").map((a) => capitalize(a, []));
        const klass = constGet(Mail, `${words.join("")}Field`) as abstract new (
          ...args: never[]
        ) => unknown;
        expect(new Field(sf).field).toBeInstanceOf(klass);
      }
    });

    for (const sf of `dATE fROM sENDER REPLY-TO TO CC BCC MESSAGE-ID IN-REPLY-TO
        REFERENCES KEYWORDS resent-date resent-from rESENT-sENDER
        rESENT-tO rESent-cc resent-bcc reSent-MESSAGE-iD
        rEtURN-pAtH rEcEiVeD Subject Comments Mime-VeRSIOn
        cOntenT-transfer-EnCoDiNg Content-Description
        Content-Disposition cOnTENt-TyPe`.split(/\s+/)) {
      const words = sf.split("-").map((a) => capitalize(a, []));
      const klass = constGet(Mail, `${words.join("")}Field`) as abstract new (
        ...args: never[]
      ) => unknown;
      it(`matches ${sf} to ${rbModName(klass)}`, () => {
        expect(new Field(sf).field).toBeInstanceOf(klass);
      });
    }

    it("should say anything that is not a known field is an optional field", () => {
      for (const sf of ["Too", "Becc", "bccc", "Random", "X-Mail", "MySpecialField"]) {
        const raw = new TextEncoder().encode(`${sf}: 😊`);
        const field = Field.parse(raw)!;
        expect(field.field).toBeInstanceOf(OptionalField);
        expect(field.name).toEqual(sf);
        expect(field.value).toEqual("😊");
      }
    });

    it("should return an unstuctured field if the structured field parsing raises an error", () => {
      const parse = vi.spyOn(ToField, "parse").mockImplementation(() => {
        throw new Field.ParseError(ToField, "To: Bob, ,,, Frank, Smith", "Some reason");
      });
      try {
        const field = new Field("To", "Bob, ,,, Frank, Smith");
        expect(field.field).toBeInstanceOf(UnstructuredField);
        expect(field.name).toEqual("To");
        expect(field.value).toEqual("Bob, ,,, Frank, Smith");
        expect(parse).toHaveBeenCalledTimes(1);
      } finally {
        parse.mockRestore();
      }
    });

    it("delegates to_s to its field", () => {
      const field = new Field("To", "Bob");
      const toS = vi.spyOn(field.field, "toString");
      field.toString();
      expect(toS).toHaveBeenCalledTimes(1);
    });

    it("delegates missing methods to its field", () => {
      const field = new Field("To", "Bob");
      const inner = field.field as unknown as { anythingAtAll: () => unknown };
      inner.anythingAtAll = vi.fn();
      (field as unknown as { anythingAtAll: () => unknown }).anythingAtAll();
      expect(inner.anythingAtAll).toHaveBeenCalledTimes(1);
    });

    it("should respond_to? its own methods and the same methods as its instantiated field class", () => {
      const field = new Field("To", "Bob");
      expect(rbObjRespondTo(field, "field")).toBeTruthy();
      const inner = field.field as unknown as { isRespondTo: (name: string) => boolean };
      inner.isRespondTo = vi.fn(() => true);
      rbObjRespondTo(field, "addresses");
      expect(inner.isRespondTo).toHaveBeenCalledTimes(1);
    });

    it("should change its type if you change the name", () => {
      const field = new Field("To", "mikel@me.com");
      expect(field.field).toBeInstanceOf(ToField);
      field.value = "bob@me.com";
      expect(field.field).toBeInstanceOf(ToField);
    });

    it("should create a field without trying to parse if given a symbol", () => {
      expect(new Field("Message-ID").field).toBeInstanceOf(MessageIdField);
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
    it("should reply if it is responsible for a field name as a capitalized string - structured field", () => {
      expect(new Field("To", "mikel@test.lindsaar.net").isResponsibleFor("To")).toBeTruthy();
    });

    it("should reply if it is responsible for a field as a lower case string - structured field", () => {
      expect(new Field("To", "mikel@test.lindsaar.net").isResponsibleFor("to")).toBeTruthy();
    });

    it("should reply if it is responsible for a field as a symbol - structured field", () => {
      expect(new Field("To", "mikel@test.lindsaar.net").isResponsibleFor("to")).toBeTruthy();
    });
    it('should say it is the "same" as another if their field types match', () => {
      expect(new Field("To", "mikel").same(new Field("To", "bob"))).toBeTruthy();
    });

    it('should say it is not the "same" as another if their field types don\'t match', () => {
      expect(new Field("To", "mikel").same(new Field("From", "mikel"))).toBeFalsy();
    });

    it('should say it is not the "same" as nil', () => {
      expect(new Field("To", "mikel").same(null)).toBeFalsy();
    });

    it("should say it is == to another if their field and names match", () => {
      expect(new Field("To", "mikel").equals(new Field("To", "mikel"))).toBe(true);
    });

    it("should say it is not == to another if their field names do not match", () => {
      expect(new Field("From", "mikel").equals(new Field("To", "bob"))).not.toEqual(true);
    });

    it("should say it is not == to another if their field names match, but not their values", () => {
      expect(new Field("To", "mikel").equals(new Field("To", "bob"))).not.toEqual(true);
    });

    it("should say it is not == to nil", () => {
      expect(new Field("From", "mikel").equals(null)).toBeFalsy();
    });

    it("should sort according to the field order", () => {
      const list = [new Field("To", "mikel"), new Field("Return-Path", "bob")];
      expect(sort(list)[0].name).toEqual("Return-Path");
    });
  });

  describe("user defined fields", () => {
    it('should say it is the "same" as another if their field names match', () => {
      expect(new Field("X-Foo", "mikel").same(new Field("X-Foo", "bob"))).toBeTruthy();
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

    it("should allow you to send in unencoded strings to address fields and encode them", () => {
      const to = new ToField('"Mikel Lindsああr" <mikel@test.lindsaar.net>', "utf-8");
      expect(to.encoded()).toEqual(
        "To: =?UTF-8?B?TWlrZWwgTGluZHPjgYLjgYJy?= <mikel@test.lindsaar.net>\r\n",
      );
    });

    it("should allow you to send in unencoded strings without quotes to address fields and encode them", () => {
      const to = new ToField("Mikel Lindsああr <mikel@test.lindsaar.net>", "utf-8");
      expect(to.encoded()).toEqual(
        "To: =?UTF-8?B?TWlrZWwgTGluZHPjgYLjgYJy?= <mikel@test.lindsaar.net>\r\n",
      );
    });

    it("should allow you to send in unencoded strings to address fields and encode them", () => {
      const to = new ToField("あdあ <ada@test.lindsaar.net>", "utf-8");
      expect(to.encoded()).toEqual("To: =?UTF-8?B?44GCZOOBgg==?= <ada@test.lindsaar.net>\r\n");
    });

    it("should allow you to send in multiple unencoded strings to address fields and encode them", () => {
      const to = new ToField(
        ["Mikel Lindsああr <mikel@test.lindsaar.net>", "あdあ <ada@test.lindsaar.net>"],
        "utf-8",
      );
      expect(to.encoded()).toEqual(
        "To: =?UTF-8?B?TWlrZWwgTGluZHPjgYLjgYJy?= <mikel@test.lindsaar.net>, \r\n =?UTF-8?B?44GCZOOBgg==?= <ada@test.lindsaar.net>\r\n",
      );
    });

    it("should allow you to send in multiple unencoded strings to any address field", () => {
      const mail = Mail.new();
      mail.charset = "utf-8";
      const array = ["Mikel Lindsああr <mikel@test.lindsaar.net>", "あdあ <ada@test.lindsaar.net>"];
      const tail =
        "=?UTF-8?B?TWlrZWwgTGluZHPjgYLjgYJy?= <mikel@test.lindsaar.net>, \r\n =?UTF-8?B?44GCZOOBgg==?= <ada@test.lindsaar.net>\r\n";
      expect(new ToField(array, "utf-8").encoded()).toEqual(`To: ${tail}`);
      expect(new FromField(array, "utf-8").encoded()).toEqual(`From: ${tail}`);
      expect(new CcField(array, "utf-8").encoded()).toEqual(`Cc: ${tail}`);
      expect(new ReplyToField(array, "utf-8").encoded()).toEqual(`Reply-To: ${tail}`);
    });

    it("should allow an encoded value in the Subject field and decode it automatically (issue 44)", () => {
      expect(new SubjectField("=?ISO-8859-1?Q?2_=FAlt?=", "utf-8").decoded()).toEqual("2 últ");
    });

    it("should allow you to encoded text in the middle (issue 44)", () => {
      expect(new SubjectField("ma=?ISO-8859-1?Q?=F1ana?=", "utf-8").decoded()).toEqual("mañana");
    });

    it("more tolerable to encoding definitions, ISO (issue 120)", () => {
      expect(new SubjectField("ma=?ISO88591?Q?=F1ana?=", "utf-8").decoded()).toEqual("mañana");
    });

    it("more tolerable to encoding definitions, ISO-long (issue 120)", () => {
      const subject = new SubjectField("=?iso2022jp?B?SEVBUlQbJEIkSiQ0TyJNbRsoQg?=", "utf-8");
      expect(subject.decoded()).toEqual("HEARTなご連絡");
    });

    it("more tolerable to encoding definitions, UTF (issue 120)", () => {
      const to = new ToField("=?utf-8?B?44GCZOOBgg==?= <ada@test.lindsaar.net>", "utf-8");
      expect(to.decoded()).toEqual('"あdあ" <ada@test.lindsaar.net>');
      expect(to.encoded()).toEqual("To: =?utf-8?B?44GCZOOBgg==?= <ada@test.lindsaar.net>\r\n");
    });

    it("more tolerable to encoding definitions, ISO (issue 120)", () => {
      const subject = new SubjectField("=?UTF-8?B?UmU6IHRlc3QgZW52w61vIG1lbnNhamUgY29u?=", "utf-8");
      expect(subject.decoded()).toEqual("Re: test envío mensaje con");
    });

    it("more tolerable to encoding definitions, Windows (issue 120)", () => {
      const subject = new SubjectField("=?Windows1252?Q?It=92s_a_test=3F?=", "utf-8");
      expect(subject.decoded()).toEqual("It’s a test?");
    });

    it("should support ascii encoded utf-8 subjects", () => {
      const s = "=?utf-8?Q?simp?= =?utf-8?Q?le_=E2=80=93_dash_=E2=80=93_?=";
      expect(new SubjectField(s, "utf-8").decoded()).toEqual("simple – dash – ");
    });

    it("should support ascii encoded windows subjects", () => {
      const s = "=?WINDOWS-1252?Q?simp?= =?WINDOWS-1252?Q?le_=96_dash_=96_?=";
      expect(new SubjectField(s, "UTF-8").decoded()).toEqual("simple – dash – ");
    });
  });

  describe("value", () => {
    const original = { template: "t1" };

    describe("parsed", () => {
      it("returns parsed value", () => {
        expect(new Field("name", original).value).toEqual(rbObjAsString(original));
      });
    });

    describe("unparsed", () => {
      it("returns origin unparsed value", () => {
        expect(new Field("name", original).unparsedValue).toEqual(original);
      });
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
