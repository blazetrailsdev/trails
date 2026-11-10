import type {} from "@blazetrails/vitest-matchers";
import { DateTime } from "@blazetrails/date";
import {
  binaryBytes,
  binaryString,
  Encoding,
  forceEncoding,
  rbObjEncoding,
} from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";
import "../lib/index.js";
import { Mail } from "../lib/mail.js";
import type { Message } from "../lib/message.js";

const fixturePath = (...path: string[]) =>
  new URL(`./fixtures/${path.join("/")}`, import.meta.url).pathname;
const readFixture = (...path: string[]) => Mail.read(decodeURIComponent(fixturePath(...path)));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const field = (mail: Message, name: string): any => mail.get(name);

describe("Test emails", () => {
  describe("from RFC2822", () => {
    it("should handle the basic test email", async () => {
      const mail = await readFixture("emails", "rfc2822", "example01.eml");
      expect(mail.from()).toEqualRuby(["jdoe@machine.example"]);
      expect(mail.to()).toEqualRuby(["mary@example.net"]);
      expect(mail.messageId()).toEqual("1234@local.machine.example");
      expect(mail.date()).toEqual(DateTime.parse("21 Nov 1997 09:55:06 -0600"));
      expect(mail.subject()).toEqual("Saying Hello");
    });

    it("should handle the sender test email", async () => {
      const mail = await readFixture("emails", "rfc2822", "example02.eml");
      expect(mail.from()).toEqualRuby(["jdoe@machine.example"]);
      expect(mail.sender()).toEqual("mjones@machine.example");
      expect(mail.to()).toEqualRuby(["mary@example.net"]);
      expect(mail.messageId()).toEqual("1234@local.machine.example");
      expect(mail.date()).toEqual(DateTime.parse("21 Nov 1997 09:55:06 -0600"));
      expect(mail.subject()).toEqual("Saying Hello");
    });

    it("should handle multiple recipients test email", async () => {
      const mail = await readFixture("emails", "rfc2822", "example03.eml");
      expect(mail.from()).toEqualRuby(["john.q.public@example.com"]);
      expect(mail.to()).toEqualRuby(["mary@x.test", "jdoe@example.org", "one@y.test"]);
      expect(mail.cc()).toEqualRuby(["boss@nil.test", "sysservices@example.net"]);
      expect(mail.messageId()).toEqual("5678.21-Nov-1997@example.com");
      expect(mail.date()).toEqual(DateTime.parse("1 Jul 2003 10:52:37 +0200"));
    });

    it("should handle group address email test", async () => {
      const mail = await readFixture("emails", "rfc2822", "example04.eml");
      expect(mail.from()).toEqualRuby(["pete@silly.example"]);
      expect(mail.to()).toEqualRuby(["c@a.test", "joe@where.test", "jdoe@one.test"]);
      expect(field(mail, "cc").groupNames()).toEqual(["Undisclosed recipients"]);
      expect(mail.messageId()).toEqual("testabcd.1234@silly.example");
      expect(mail.date()).toEqual(DateTime.parse("Thu, 13 Feb 1969 23:32:54 -0330"));
    });

    it("should handle reply messages", async () => {
      const mail = await readFixture("emails", "rfc2822", "example05.eml");
      expect(mail.from()).toEqualRuby(["jdoe@machine.example"]);
      expect(mail.to()).toEqualRuby(["mary@example.net"]);
      expect(mail.subject()).toEqual("Saying Hello");
      expect(mail.messageId()).toEqual("1234@local.machine.example");
      expect(mail.date()).toEqual(DateTime.parse("Fri, 21 Nov 1997 09:55:06 -0600"));
    });

    it("should handle reply message 2", async () => {
      const mail = await readFixture("emails", "rfc2822", "example06.eml");
      expect(mail.from()).toEqualRuby(["mary@example.net"]);
      expect(mail.to()).toEqualRuby(["jdoe@machine.example"]);
      expect(mail.replyTo()).toEqualRuby(["smith@home.example"]);
      expect(mail.subject()).toEqual("Re: Saying Hello");
      expect(mail.messageId()).toEqual("3456@example.net");
      expect(field(mail, "in_reply_to").messageIds()).toEqual(["1234@local.machine.example"]);
      expect(field(mail, "references").messageIds()).toEqual(["1234@local.machine.example"]);
      expect(mail.date()).toEqual(DateTime.parse("Fri, 21 Nov 1997 10:01:10 -0600"));
    });

    it("should handle the final reply message", async () => {
      const mail = await readFixture("emails", "rfc2822", "example07.eml");
      expect(mail.to()).toEqualRuby(["smith@home.example"]);
      expect(mail.from()).toEqualRuby(["jdoe@machine.example"]);
      expect(mail.subject()).toEqual("Re: Saying Hello");
      expect(mail.date()).toEqual(DateTime.parse("Fri, 21 Nov 1997 11:00:00 -0600"));
      expect(mail.messageId()).toEqual("abcd.1234@local.machine.tld");
      expect(mail.inReplyTo()).toEqual("3456@example.net");
      expect(field(mail, "references").messageIds()).toEqual([
        "1234@local.machine.example",
        "3456@example.net",
      ]);
    });

    it("should handle the rfc resent example email", async () => {
      const mail = await readFixture("emails", "rfc2822", "example08.eml");
      expect(mail.resentFrom()).toEqualRuby(["mary@example.net"]);
      expect(mail.resentTo()).toEqualRuby(["j-brown@other.example"]);
      expect(mail.resentDate()).toEqual(DateTime.parse("Mon, 24 Nov 1997 14:22:01 -0800"));
      expect(mail.resentMessageId()).toEqual("78910@example.net");
      expect(mail.from()).toEqualRuby(["jdoe@machine.example"]);
      expect(mail.to()).toEqualRuby(["mary@example.net"]);
      expect(mail.subject()).toEqual("Saying Hello");
      expect(mail.date()).toEqual(DateTime.parse("Fri, 21 Nov 1997 09:55:06 -0600"));
      expect(mail.messageId()).toEqual("1234@local.machine.example");
    });

    it("should handle the RFC trace example email", async () => {
      const mail = await readFixture("emails", "rfc2822", "example09.eml");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const received = mail.received() as any[];
      expect(received[0].info()).toEqual(
        "from x.y.test   by example.net   via TCP   with ESMTP   id ABC12345   for <mary@example.net>",
      );
      expect(received[0].dateTime()).toEqual(DateTime.parse("21 Nov 1997 10:05:43 -0600"));
      expect(received[1].info()).toEqual("from machine.example by x.y.test");
      expect(received[1].dateTime()).toEqual(DateTime.parse("21 Nov 1997 10:01:22 -0600"));
      expect(mail.from()).toEqualRuby(["jdoe@machine.example"]);
      expect(mail.to()).toEqualRuby(["mary@example.net"]);
      expect(mail.subject()).toEqual("Saying Hello");
      expect(mail.date()).toEqual(DateTime.parse("Fri, 21 Nov 1997 09:55:06 -0600"));
      expect(mail.messageId()).toEqual("1234@local.machine.example");
    });

    it("should handle the rfc whitespace test email", async () => {
      const mail = await readFixture("emails", "rfc2822", "example10.eml");
      expect(mail.from()).toEqualRuby(["pete(his account)@silly.test"]);
      expect(mail.to()).toEqualRuby(["c@public.example", "joe@example.org", "jdoe@one.test"]);
      expect(field(mail, "cc").groupNames()).toEqual([
        "(Empty list)(start)Undisclosed recipients  ",
      ]);
      expect(mail.date()).toEqual(DateTime.parse("Thu, 13 Feb 1969 23:32 -0330"));
      expect(mail.messageId()).toEqual("testabcd.1234@silly.test");
    });

    it("should handle the rfc obsolete addressing", async () => {
      const mail = await readFixture("emails", "rfc2822", "example11.eml");
      expect(field(mail, "from").addresses()).toEqualRuby(["john.q.public@example.com"]);
      expect(field(mail, "from").toString()).toEqual('"Joe Q. Public" <john.q.public@example.com>');
      expect(mail.to()).toEqualRuby(["@machine.tld:mary@example.net", "jdoe@test   . example"]);
      expect(mail.date()).toEqual(DateTime.parse("Tue, 1 Jul 2003 10:52:37 +0200"));
      expect(mail.messageId()).toEqual("5678.21-Nov-1997@example.com");
    });

    it("should handle the rfc obsolete dates", async () => {
      const mail = await readFixture("emails", "rfc2822", "example12.eml");
      expect(mail.date()).toEqual(DateTime.parse("21 Nov 97 09:55:06 GMT"));
    });

    // PERMANENT-SKIP: pending upstream (example_emails_spec.rb:248), and its body references an undefined `email`.
    it.skip("should handle the rfc obsolete whitespace email", async () => {
      const mail = await readFixture("emails", "rfc2822", "example13.eml");
      expect(mail.from()).toEqualRuby("John Doe <jdoe@machine(comment).example>");
      expect(mail.to()).toEqualRuby("Mary Smith <mary@example.net>");
      expect(mail.date()).toEqual(DateTime.parse("Fri, 21 Nov 1997 09:55:06 -0600"));
      expect(mail.messageId()).toEqual("1234@local(blah).machine.example");
    });

    it("should handle folding subject", async () => {
      const mail = await readFixture("emails", "rfc2822", "example14.eml");
      expect(mail.from()).toEqualRuby(["atsushi@example.com"]);
      expect(mail.subject()).toEqual("Re: TEST \tテストテスト");
      expect(mail.messageId()).toEqual("0CC5E11ED2C1D@example.com");
      expect(mail.body().decoded()).toEqualRuby("Hello\n");
    });
  });

  describe("from the wild", () => {
    describe("raw_email_encoded_stack_level_too_deep.eml", () => {
      let message: Message;
      beforeEach(async () => {
        message = await readFixture(
          "emails",
          "mime_emails",
          "raw_email_encoded_stack_level_too_deep.eml",
        );
      });

      it("should return an 'encoded' version without raising a SystemStackError", () => {
        expect(() => message.encoded()).not.toThrow();
      });

      it("should have two parts", () => {
        expect(message.parts.length).toEqual(2);
      });
    });

    describe("sig_only_email.eml", () => {
      let message: Message;
      beforeEach(async () => {
        message = await readFixture("emails", "mime_emails", "sig_only_email.eml");
      });

      it("should not error on multiart/signed emails", () => {
        expect(() => message.encoded()).not.toThrow();
      });

      it("should have one attachment called signature.asc", () => {
        expect(message.attachments().length).toEqual(1);
        expect(message.attachments()[0].filename()).toEqual("signature.asc");
      });
    });

    describe("handling invalid group lists", () => {
      let message: Message;
      beforeEach(async () => {
        message = await readFixture("emails", "error_emails", "empty_group_lists.eml");
      });

      it("should parse the email and encode without crashing", () => {
        expect(() => message.encoded()).not.toThrow();
      });

      it("should return an empty groups list", () => {
        expect(field(message, "to").groupAddresses()).toEqual([]);
      });
    });

    describe("handling multiple references with one of them invalid", () => {
      let message: Message;
      beforeEach(async () => {
        message = await readFixture(
          "emails",
          "error_emails",
          "multiple_references_with_one_invalid.eml",
        );
      });

      it("should parse the email and encode without crashing", () => {
        expect(() => message.encoded()).not.toThrow();
      });

      it("should return the valid References value", () => {
        expect(message.references()).toEqual("foo@bar.net");
      });
    });

    describe("handling multiple content-disposition with all of them invalid", () => {
      let message: Message;
      beforeEach(async () => {
        message = await readFixture(
          "emails",
          "error_emails",
          "multiple_invalid_content_dispositions.eml",
        );
      });

      it("should parse the email and encode without crashing", () => {
        expect(() => message.encoded()).not.toThrow();
      });

      it("should recognise the email as not attachment", () => {
        expect(message.isAttachment()).toBeFalsy();
        expect(message.hasAttachments()).toBeFalsy();
      });

      it("should return one invalid Content-Disposition value", () => {
        expect(field(message, "content_disposition").errors).not.toBeEmpty();
        expect(message.contentDisposition()).toEqual("invalid");
      });
    });
  });

  describe("empty address lists", () => {
    let message: Message;
    beforeEach(async () => {
      message = await readFixture("emails", "error_emails", "weird_to_header.eml");
    });

    it("should parse the email and encode without crashing", () => {
      expect(() => message.encoded()).not.toThrow();
    });

    it("should return an empty groups list", () => {
      expect(message.to()).toEqualRuby(["user-example@aol.com", "e-s-a-s-2200@app.ar.com"]);
    });
  });

  describe("RFC6532 UTF8 headers", () => {
    let message: Message;
    beforeEach(async () => {
      message = await readFixture("emails", "rfc6532", "utf8_headers.eml");
    });

    // BLOCKED: mail-unstructured-field-utf8-arm-misreads-decoded-string
    it.skip("subject", () => {
      expect(message.subject()).toEqual("Säying Hello");
    });

    it("from", () => {
      expect(field(message, "from").toString()).toEqual('"Jöhn Doe" <jdöe@mächine.example>');
      expect(field(message, "from").addresses()[0].toString()).toEqual("jdöe@mächine.example");
    });

    it("to", () => {
      expect(field(message, "to").toString()).toEqual('"Märy Smith" <märy@exämple.net>');
      expect(field(message, "to").addresses()[0].toString()).toEqual("märy@exämple.net");
    });
  });

  describe("invalid charsets in headers", () => {
    it("falls back to ASCII-8BIT for unrecognized charsets", async () => {
      const mail = await readFixture("emails", "error_emails", "invalid_subject_characters.eml");
      expect(field(mail, "from").displayNames()).toEqualRuby(["Formação Frenetikpolis"]);

      let subject: string | Uint8Array =
        "Forma\xE7\xE3o FrenetikPolis: Mega Campanha Final Ver\xE3o | Cursos de Setembro";
      expect(rbObjEncoding(mail.subject() as Uint8Array)).toEqual(Encoding.ASCII_8BIT);
      subject = forceEncoding(binaryBytes(subject), Encoding.ASCII_8BIT);
      expect(mail.subject()).toEqual(subject);

      const encoded = binaryString(mail.encoded() as Uint8Array);
      expect(encoded).toContain(
        "From: =?Windows-1252?B?Rm9ybWHn428gRnJlbmV0aWtwb2xpcw==?= <info@formacaofrenetik.info>",
      );
      expect(encoded).toContain(
        "Subject: =?UTF-8?Q?Forma=EF=BF=BD=EF=BF=BDo_FrenetikPolis:_Mega_Campanha?=\r\n =?UTF-8?Q?_Final_Ver=EF=BF=BDo_|_Cursos_de_Setembro?=",
      );
    });
  });
});
