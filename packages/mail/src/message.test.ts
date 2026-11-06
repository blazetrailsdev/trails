import type {} from "@blazetrails/vitest-matchers";
import { beforeEach, describe, expect, it } from "vitest";
import { hashAref, hashAset, Hash } from "@blazetrails/ruby-compat";
import { toYaml } from "@blazetrails/ruby-compat/yaml";
import { Body } from "./body.js";
import { Field } from "./field.js";
import { FieldList } from "./field-list.js";
import { FromField } from "./fields/from-field.js";
import { Header } from "./header.js";
import "./index.js";
import { Mail } from "./mail.js";
import { Message } from "./message.js";
import { Part } from "./part.js";
import { PartsList } from "./parts-list.js";
import { Utilities } from "./utilities.js";
import { YAML } from "./yaml.js";

class DeliveryAgent {
  static deliverMail(_mail: Message, block: () => unknown): unknown {
    return block();
  }
}

describe("Mail::Message", () => {
  function basicEmail() {
    return "To: mikel\r\nFrom: bob\r\nSubject: Hello!\r\n\r\nemail message\r\n";
  }

  describe("initialization", () => {
    it("should instantiate empty", () => {
      expect(new Message().constructor).toBe(Message);
    });

    it("should return a basic email", () => {
      let mail = Mail.new();
      mail = Mail.new(mail.toString());
      expect(Utilities.isBlank(mail.date())).toBeFalsy();
      expect(Utilities.isBlank(mail.messageId())).toBeFalsy();
      expect(mail.mimeVersion()).toBe("1.0");
      expect(mail.contentType()).toBe("text/plain");
      expect(mail.contentTransferEncoding()).toBe("7bit");
      expect(Utilities.isBlank(mail.subject())).toBeTruthy();
      expect(Utilities.isBlank(mail.body())).toBeTruthy();
    });

    it("should instantiate with a string", () => {
      expect(new Message(basicEmail()).constructor).toBe(Message);
    });

    it("should allow us to pass it a block", () => {
      const mail = new Message(function (this: Message) {
        this.from("mikel@me.com");
        this.to("lindsaar@you.com");
      });
      expect([...(mail.from() as string[])]).toEqual(["mikel@me.com"]);
      expect([...(mail.to() as string[])]).toEqual(["lindsaar@you.com"]);
    });

    it("should yield self if the given block takes any args", () => {
      class ClassThatCreatesMail {
        constructor(
          private from: string,
          private to: string,
        ) {}

        createMailWithOneArg() {
          return new Message((m: Message) => {
            m.from(this.from);
            m.to(this.to);
          });
        }

        createMailWithSplatArgs() {
          return new Message((...args: Message[]) => {
            const m = args[0];
            m.from(this.from);
            m.to(this.to);
          });
        }
      }

      let mail = new ClassThatCreatesMail(
        "mikel@me.com",
        "lindsaar@you.com",
      ).createMailWithOneArg();
      expect([...(mail.from() as string[])]).toEqual(["mikel@me.com"]);
      expect([...(mail.to() as string[])]).toEqual(["lindsaar@you.com"]);

      mail = new ClassThatCreatesMail("mikel@me.com", "lindsaar@you.com").createMailWithSplatArgs();
      expect([...(mail.from() as string[])]).toEqual(["mikel@me.com"]);
      expect([...(mail.to() as string[])]).toEqual(["lindsaar@you.com"]);
    });

    it("should initialize a body and header class even if called with nothing to begin with", () => {
      const mail = new Message();
      expect(mail.header().constructor).toBe(Header);
      expect(mail.body().constructor).toBe(Body);
    });

    it("should not report basic emails as bounced", () => {
      expect(new Message().isBounced()).toBeFalsy();
    });

    it("should use default charset", () => {
      const old = Message.defaultCharset;
      try {
        Message.defaultCharset = "iso-8859-1";
        expect(new Message().charset).toBe("iso-8859-1");
      } finally {
        Message.defaultCharset = old;
      }
    });

    it("should be able to pass two In-Reply-To headers", () => {
      const mail = Mail.new(
        "From: bob\r\nIn-Reply-To: <a@a.a>\r\nIn-Reply-To: <b@b.b>\r\nSubject: Hello!\r\n\r\nemail message\r\n",
      );
      expect(mail.inReplyTo()).toBe("b@b.b");
    });

    it("should be able to pass two References headers", () => {
      const mail = Mail.new(
        "From: bob\r\nReferences: <a@a.a>\r\nReferences: <b@b.b>\r\nSubject: Hello!\r\n\r\nemail message\r\n",
      );
      expect(mail.references()).toBe("b@b.b");
    });

    describe("YAML serialization", () => {
      let yamlMail: Message;
      const smtpSettings = {
        address: "smtp.somewhere.net",
        port: "587",
        domain: "somewhere.net",
        userName: "someone@somewhere.net",
        password: "password",
        authentication: "plain",
        enableStarttlsAuto: true,
        enableStarttls: null,
        opensslVerifyMode: null,
        ssl: null,
        tls: null,
        openTimeout: null,
        readTimeout: null,
      };

      beforeEach(() => {
        yamlMail = new Message({
          to: "someone@somewhere.com",
          cc: "someoneelse@somewhere.com",
          bcc: "someonesecret@somewhere.com",
          body: "body",
          subject: "subject",
        });
        yamlMail.deliveryMethod("smtp", smtpSettings);
      });

      it("should serialize the basic information to YAML", () => {
        const yamlOutput = YAML.load(yamlMail.toYaml()) as Hash<string, unknown>;
        const headers = hashAref(yamlOutput, "headers");
        expect(hashAref(headers as object, "To")).toEqual("someone@somewhere.com");
        expect(hashAref(headers as object, "Cc")).toEqual("someoneelse@somewhere.com");
        expect(hashAref(headers as object, "Subject")).toEqual("subject");
        expect(hashAref(headers as object, "Bcc")).toEqual("someonesecret@somewhere.com");
        expect(hashAref(yamlOutput, "@body_raw")).toEqual("body");
        expect(Utilities.isBlank(hashAref(yamlOutput, "@delivery_method"))).toBeFalsy();
      });

      it("should serialize a Message with a custom delivery_handler", () => {
        yamlMail.deliveryHandler = DeliveryAgent;
        const yamlOutput = YAML.load(yamlMail.toYaml()) as Hash<string, unknown>;
        expect(hashAref(yamlOutput, "delivery_handler")).toEqual("DeliveryAgent");
      });

      it("should not deserialize a delivery_handler that does not exist", () => {
        const yamlHash = YAML.load(yamlMail.toYaml()) as Hash<string, unknown>;
        hashAset(yamlHash, "delivery_handler", "NotARealClass");
        const deserialized = Message.fromYaml(toYaml(yamlHash));
        expect(deserialized.deliveryHandler).toBeNull();
      });

      it("should deserialize parts as an instance of Mail::PartsList", () => {
        const yamlHash = YAML.load(yamlMail.toYaml());
        const deserialized = Message.fromYaml(toYaml(yamlHash));
        expect(deserialized.parts).toBeInstanceOf(PartsList);
      });

      it("should handle multipart mail", () => {
        yamlMail.addPart(new Part({ contentType: "text/html", body: "<b>body</b>" }));
        const deserialized = Message.fromYaml(yamlMail.toYaml());
        expect(deserialized.isMultipart()).toBeTruthy();
        deserialized.parts.forEach((part) => expect(part).toBeInstanceOf(Part));
        expect(Array.from(deserialized.parts, (p) => p.body().toString())).toEqual([
          "body",
          "<b>body</b>",
        ]);
      });
    });
    describe("splitting", () => {
      it("should split the body from the header", () => {
        const message = new Message("To: Example <example@cirw.in>\r\n\r\nHello there\r\n");
        expect(message.decoded()).toBe("Hello there\n");
      });

      it("should split when the body starts with a space", () => {
        const message = new Message("To: Example <example@cirw.in>\r\n\r\n Hello there\r\n");
        expect(message.decoded()).toBe(" Hello there\n");
      });

      it("should split if the body starts with an empty line", () => {
        const message = new Message("To: Example <example@cirw.in>\r\n\r\n\r\nHello there\r\n");
        expect(message.decoded()).toBe("\nHello there\n");
      });

      it("should split if the body starts with a blank line", () => {
        const message = new Message("To: Example <example@cirw.in>\r\n\r\n\t\r\nHello there\r\n");
        expect(message.decoded()).toBe("\t\nHello there\n");
      });

      it('should split after headers that contain "\\r\\n "', () => {
        const message = new Message("To: Example\r\n <example@cirw.in>\r\n\r\n Hello there\r\n");
        expect(message.decoded()).toBe(" Hello there\n");
      });

      it('should split only once if there are "\\r\\n\\r\\n"s in the body', () => {
        const message = new Message("To: Example <example@cirw.in>\r\n\r\nHello\r\n\r\nthere\r\n");
        expect(message.decoded()).toBe("Hello\n\nthere\n");
      });

      it("should allow headers that end in trailing whitespace", () => {
        const message = new Message(
          "To: Example <example@cirw.in>\r\nThread-Topic: -= MAINTENANCE =- Canasta - Wednesday 4/24/2013 8am - 10am\r\n                                         \r\n\r\nHello there\r\n",
        );
        expect(message.decoded()).toBe("Hello there\n");
      });
    });
  });

  describe("envelope line handling", () => {
    it("should respond to 'envelope from'", () => {
      expect(new Message()).toRespondTo("envelopeFrom");
    });

    it("should ignore a plain text body that starts with ^From", () => {
      const m = new Message(
        "From: mikel@test.lindsaar.net\r\n\r\nThis is a way to break mail by putting\r\nFrom at the start of a body\r\nor elsewhere.",
      );
      expect(m.from()).not.toBeNull();
      expect([...(m.from() as string[])]).toEqual(["mikel@test.lindsaar.net"]);
    });
  });

  describe("accepting a plain text string email", () => {
    it("should accept some email text to parse and return an email", () => {
      const mail = new Message(basicEmail());
      expect(mail.constructor).toBe(Message);
    });

    it("should set a raw source instance variable to equal the passed in message", () => {
      const mail = new Message(basicEmail());
      expect(mail.rawSource).toBe(basicEmail());
    });

    it("should set the raw source instance variable to '' if no message is passed in", () => {
      const mail = new Message();
      expect(mail.rawSource).toBe("");
    });

    it("should allow for whitespace at the start of the email", () => {
      const mail = Mail.new("\r\n\r\nFrom: mikel\r\n\r\nThis is the body");
      expect(mail.body().toString()).toBe("This is the body");
      expect([...(mail.from() as string[])]).toEqual(["mikel"]);
    });
  });

  describe("directly setting values of a message", () => {
    describe("accessing fields directly", () => {
      let mail: Message;
      beforeEach(() => {
        mail = new Message();
      });

      it("should allow you to grab field objects if you really want to", () => {
        expect((mail.headerFields() as object).constructor).toBe(FieldList);
      });

      it("should give you back the fields in the header", () => {
        mail.set("bar", "abcd");
        expect((mail.headerFields() as FieldList).length).toBe(1);
        mail.set("foo", "4321");
        expect((mail.headerFields() as FieldList).length).toBe(2);
      });

      it("should delete a field if it is set to nil", () => {
        mail.set("foo", "4321");
        expect((mail.headerFields() as FieldList).length).toBe(1);
        mail.set("foo", null);
        expect((mail.headerFields() as FieldList).length).toBe(0);
      });
    });

    describe("with :method=", () => {
      let mail: Message;
      beforeEach(() => {
        mail = new Message();
      });

      it("should return the to field", () => {
        mail.setTo("mikel");
        expect([...(mail.to() as string[])]).toEqual(["mikel"]);
      });

      it("should return the from field", () => {
        mail.setFrom("bob");
        expect([...(mail.from() as string[])]).toEqual(["bob"]);
      });

      it("should return the subject", () => {
        mail.setSubject("Hello!");
        expect(mail.subject()).toBe("Hello!");
      });

      it("should return the body decoded with to_s", () => {
        mail.body("email message\r\n");
        expect(mail.body().toString()).toBe("email message\n");
      });

      it("should return the body encoded if asked for", () => {
        mail.body("email message\r\n");
        expect(mail.body().encoded()).toBe("email message\r\n");
      });

      it("should return the body decoded if asked for", () => {
        mail.body("email message\r\n");
        expect(mail.body().decoded()).toBe("email message\n");
      });
    });

    describe("with :method(value)", () => {
      let mail: Message;
      beforeEach(() => {
        mail = new Message();
      });

      it("should return the to field", () => {
        mail.to("mikel");
        expect([...(mail.to() as string[])]).toEqual(["mikel"]);
      });

      it("should return the from field", () => {
        mail.from("bob");
        expect([...(mail.from() as string[])]).toEqual(["bob"]);
      });

      it("should return the subject", () => {
        mail.subject("Hello!");
        expect(mail.subject()).toBe("Hello!");
      });

      it("should return the body decoded with to_s", () => {
        mail.body("email message\r\n");
        expect(mail.body().toString()).toBe("email message\n");
      });

      it("should return the body encoded if asked for", () => {
        mail.body("email message\r\n");
        expect(mail.body().encoded()).toBe("email message\r\n");
      });

      it("should return the body decoded if asked for", () => {
        mail.body("email message\r\n");
        expect(mail.body().decoded()).toBe("email message\n");
      });
    });

    describe("setting arbitrary headers", () => {
      let mail: Message;
      beforeEach(() => {
        mail = new Message();
      });

      it("should allow you to set them", () => {
        expect(() => mail.set("foo", 1234)).not.toThrow();
      });

      it("should allow you to read arbitrary headers", () => {
        mail.set("foo", 1234);
        expect(String((mail.get("foo") as Field).value)).toBe("1234");
      });

      it("should instantiate a new Header", () => {
        mail.set("foo", 1234);
        expect((mail.headerFields() as FieldList)[0].constructor).toBe(Field);
      });
    });

    describe("replacing header values", () => {
      it("should allow you to replace a from field", () => {
        const mail = Mail.new();
        expect(mail.from()).toBeNull();
        mail.setFrom("mikel@test.lindsaar.net");
        expect([...(mail.from() as string[])]).toEqual(["mikel@test.lindsaar.net"]);
        mail.setFrom("bob@test.lindsaar.net");
        expect([...(mail.from() as string[])]).toEqual(["bob@test.lindsaar.net"]);
      });

      it("should maintain the class of the field", () => {
        const mail = Mail.new();
        mail.setFrom("mikel@test.lindsaar.net");
        expect((mail.get("from") as Field).field.constructor).toBe(FromField);
        mail.setFrom("bob@test.lindsaar.net");
        expect((mail.get("from") as Field).field.constructor).toBe(FromField);
      });
    });
  });
  describe("helper methods", () => {
    describe("==", () => {
      it("should be implemented", () => {
        expect(() => Mail.new().equals(Mail.new())).not.toThrow();
      });

      it("should not be == if both emails have different Message IDs", () => {
        const m1 = Mail.new(
          "To: mikel@test.lindsaar.net\r\nMessage-ID: <4321@test.lindsaar.net>\r\nSubject: Yo!\r\n\r\nHello there",
        );
        const m2 = Mail.new(
          "To: mikel@test.lindsaar.net\r\nMessage-ID: <1234@test.lindsaar.net>\r\nSubject: Yo!\r\n\r\nHello there",
        );
        expect(m1).not.toEqualRuby(m2);
        expect(m1.messageId()).toBe("4321@test.lindsaar.net");
        expect(m2.messageId()).toBe("1234@test.lindsaar.net");
      });
    });

    it("should have a destinations method", () => {
      const mail = Mail.new(function (this: Message) {
        this.to("mikel@test.lindsaar.net");
        this.cc("bob@test.lindsaar.net");
        this.bcc("sam@test.lindsaar.net");
      });
      expect(mail.destinations().length).toBe(3);
    });

    it("should have a from_addrs method", () => {
      const mail = Mail.new(function (this: Message) {
        this.from("mikel@test.lindsaar.net");
      });
      expect(mail.fromAddrs().length).toBe(1);
    });

    it("should have a from_addrs method that is empty if nil", () => {
      const mail = Mail.new(function () {});
      expect(mail.fromAddrs().length).toBe(0);
    });

    it("should have a to_addrs method", () => {
      const mail = Mail.new(function (this: Message) {
        this.to("mikel@test.lindsaar.net");
      });
      expect(mail.toAddrs().length).toBe(1);
    });

    it("should have a to_addrs method that is empty if nil", () => {
      const mail = Mail.new(function () {});
      expect(mail.toAddrs().length).toBe(0);
    });

    it("should have a cc_addrs method", () => {
      const mail = Mail.new(function (this: Message) {
        this.cc("bob@test.lindsaar.net");
      });
      expect(mail.ccAddrs().length).toBe(1);
    });

    it("should have a cc_addrs method that is empty if nil", () => {
      const mail = Mail.new(function () {});
      expect(mail.ccAddrs().length).toBe(0);
    });

    it("should have a bcc_addrs method", () => {
      const mail = Mail.new(function (this: Message) {
        this.bcc("sam@test.lindsaar.net");
      });
      expect(mail.bccAddrs().length).toBe(1);
    });

    it("should have a bcc_addrs method that is empty if nil", () => {
      const mail = Mail.new(function () {});
      expect(mail.bccAddrs().length).toBe(0);
    });

    it("should give destinations even if some of the fields are blank", () => {
      const mail = Mail.new(function (this: Message) {
        this.to("mikel@test.lindsaar.net");
      });
      expect(mail.destinations().length).toBe(1);
    });

    it("should be able to encode with only one destination", () => {
      const mail = Mail.new(function (this: Message) {
        this.to("mikel@test.lindsaar.net");
      });
      mail.encoded();
    });
  });

  describe("nested parts", () => {
    it("adds a new text part when assigning the body on an already-multipart message", () => {
      const mail = Mail.new(function (this: Message) {
        this.part({ contentType: "foo/bar", body: "baz" });
      });

      mail.body("this: body is not a header");

      expect(mail.parts.length).toBe(2);
      expect(mail.textPart()).not.toBeNull();
      expect((mail.textPart() as Message).decoded()).toBe("this: body is not a header");
    });
  });

  describe("error handling", () => {
    it("should collect up any of its fields' errors", () => {
      const mail = Mail.new("Content-Transfer-Encoding: vl@d\r\nReply-To: a b b\r\n");
      const errors = mail.errors() as unknown[][];
      expect(Utilities.isBlank(errors)).toBeFalsy();
      expect(errors.length).toBe(2);
      expect(errors[0][0]).toBe("Reply-To");
      expect(errors[0][1]).toBe("a b b");
      expect(errors[1][0]).toBe("Content-Transfer-Encoding");
      expect(errors[1][1]).toBe("vl@d");
    });
  });

  describe("header case should be preserved", () => {
    it("should handle mail[] and keep the header case", () => {
      const mail = Mail.new();
      mail.set("X-Foo-Bar", "Some custom text");
      expect(mail.toString()).toMatch(/X-Foo-Bar: Some custom text/);
    });
  });

  describe("parsing emails with non usascii in the header", () => {
    it("should work", () => {
      const mail = Mail.new('From: "Foo áëô îü" <extended@example.net>');
      expect([...(mail.from() as string[])]).toEqual(["extended@example.net"]);
      expect((mail.get("from") as Field).decoded()).toBe('"Foo áëô îü" <extended@example.net>');
      expect((mail.get("from") as Field).encoded()).toBe(
        "From: =?UTF-8?B?Rm9vIMOhw6vDtCDDrsO8?= <extended@example.net>\r\n",
      );
    });
  });

  describe("adding parts should preserve the charset of the mail", () => {
    const charsets = ["UTF-8", "ISO-8859-1", null];
    for (const mailCharset of charsets) {
      for (const partCharset of charsets) {
        it(`when ${mailCharset ?? "nil"} vs ${partCharset ?? "nil"}`, () => {
          const mail = Mail.new();
          mail.set("charset", mailCharset);
          expect(mail.charset).toBe(mailCharset);
          const p = new Part({ contentType: "text/html", body: "HTML TEXT", charset: partCharset });
          expect(p.charset).toBe(partCharset);
          mail.addPart(p);
          expect(mail.charset).toBe(mailCharset);
          expect(p.charset).toBe(partCharset);
        });
      }
    }
  });

  describe("attachment query methods", () => {
    it("shouldn't die with an invalid Content-Disposition header", () => {
      const mail = Mail.new("Content-Disposition: invalid");
      expect(() => mail.isAttachment()).not.toThrow();
    });

    it("shouldn't die with an invalid Content-Type header", () => {
      const mail = Mail.new('Content-Type: invalid/invalid; charset="iso-8859-1"');
      mail.isAttachment();
      expect(() => mail.isAttachment()).not.toThrow();
    });
  });

  describe("replying", () => {
    describe("to a reply with an in-reply-to with a single message id but no references header", () => {
      let mail: Message;
      beforeEach(() => {
        mail = Mail.new(function (this: Message) {
          this.inReplyTo("<1234@test.lindsaar.net>");
          this.messageId("5678@test.lindsaar.net");
        });
      });

      it("should have a references consisting of the in-reply-to and message_id fields", () => {
        expect(
          (mail.reply().get("references") as Field & { messageIds(): string[] }).messageIds(),
        ).toEqual(["1234@test.lindsaar.net", "5678@test.lindsaar.net"]);
      });
    });

    describe("to a reply with an in-reply-to with multiple message ids but no references header", () => {
      let mail: Message;
      beforeEach(() => {
        mail = Mail.new(function (this: Message) {
          this.inReplyTo("<1234@test.lindsaar.net> <5678@test.lindsaar.net>");
          this.messageId("90@test.lindsaar.net");
        });
      });

      it("should have no references header", () => {
        expect(mail.references()).toBeNull();
      });
    });
  });

  describe("SMTP envelope From", () => {
    it("should respond", () => {
      expect(new Message()).toRespondTo("smtpEnvelopeFrom");
    });

    it("should default to return_path, sender, or first from address", () => {
      const message = new Message(function (this: Message) {
        this.returnPath("return");
        this.sender("sender");
        this.from("from");
      });
      expect(message.smtpEnvelopeFrom()).toBe("return");

      message.setReturnPath(null);
      expect(message.smtpEnvelopeFrom()).toBe("sender");

      message.setSender(null);
      expect(message.smtpEnvelopeFrom()).toBe("from");
    });

    it("can be overridden", () => {
      const message = new Message(function (this: Message) {
        this.returnPath("return");
      });

      message.setSmtpEnvelopeFrom("envelope_from");
      expect(message.smtpEnvelopeFrom()).toBe("envelope_from");

      message.setSmtpEnvelopeFrom("declared_from");
      expect(message.smtpEnvelopeFrom()).toBe("declared_from");

      message.setSmtpEnvelopeFrom(null);
      expect(message.smtpEnvelopeFrom()).toBe("return");
    });
  });

  describe("SMTP envelope To", () => {
    it("should respond", () => {
      expect(new Message()).toRespondTo("smtpEnvelopeTo");
    });

    it("should default to destinations", () => {
      const message = new Message(function (this: Message) {
        this.to("to");
        this.cc("cc");
        this.bcc("bcc");
      });
      expect(message.smtpEnvelopeTo()).toEqual(message.destinations());
    });

    it("can be overridden", () => {
      const message = new Message(function (this: Message) {
        this.to("to");
      });

      message.setSmtpEnvelopeTo("envelope_to");
      expect(message.smtpEnvelopeTo()).toEqual(["envelope_to"]);

      message.setSmtpEnvelopeTo("declared_to");
      expect(message.smtpEnvelopeTo()).toEqual(["declared_to"]);

      message.setSmtpEnvelopeTo(null);
      expect(message.smtpEnvelopeTo()).toEqual(["to"]);
    });
  });
});
