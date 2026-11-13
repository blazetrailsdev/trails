import type {} from "@blazetrails/vitest-matchers";
import { DateTime } from "@blazetrails/date";
import {
  binaryBytes,
  chomp,
  Dir,
  Encoding,
  rbObjEncoding,
  constSet,
  IO,
  NoMethodError,
  rbObjDup,
  Socket,
  sort,
  stderr,
} from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashAref, hashAset, Hash, TopLevel } from "@blazetrails/ruby-compat";
import { toYaml } from "@blazetrails/ruby-compat/yaml";
import { Body } from "../lib/body.js";
import { Field } from "../lib/field.js";
import { FieldList } from "../lib/field-list.js";
import { FromField } from "../lib/fields/from-field.js";
import { Header } from "../lib/header.js";
import "../lib/index.js";
import { Mail } from "../lib/mail.js";
import { Message } from "../lib/message.js";
import { Part } from "../lib/part.js";
import { PartsList } from "../lib/parts-list.js";
import { Utilities } from "../lib/utilities.js";
import { YAML } from "../lib/yaml.js";

const { headerNew, bodyNew } = vi.hoisted(() => ({ headerNew: vi.fn(), bodyNew: vi.fn() }));

vi.mock("../lib/header.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/header.js")>();
  class Header extends original.Header {
    constructor(...args: ConstructorParameters<typeof original.Header>) {
      super(...args);
      headerNew(...args);
    }
  }
  return { ...original, Header };
});

vi.mock("../lib/body.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/body.js")>();
  class Body extends original.Body {
    constructor(...args: ConstructorParameters<typeof original.Body>) {
      super(...args);
      bodyNew(...args);
    }
  }
  return { ...original, Body };
});

class DeliveryAgent {
  static deliverMail(_mail: Message, block: () => unknown): unknown {
    return block();
  }
}

constSet(TopLevel, "DeliveryAgent", DeliveryAgent);

const fixturePath = (...path: string[]) =>
  new URL(`./fixtures/${path.join("/")}`, import.meta.url).pathname;
const readRawFixture = async (...path: string[]) =>
  await IO.binreadAsync(decodeURIComponent(fixturePath(...path)));
const fixtureEmls = await Dir.globAsync(decodeURIComponent(fixturePath("emails/**/*.eml")));
const readFixture = (...path: string[]) => Mail.read(decodeURIComponent(fixturePath(...path)));

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

    it("should be able to parse a basic email", async () => {
      await expect(readFixture("emails", "plain_emails", "basic_email.eml")).resolves.not.toThrow();
    });

    it("should be able to parse a basic email with linefeeds", async () => {
      await expect(
        readFixture("emails", "plain_emails", "basic_email_lf.eml"),
      ).resolves.not.toThrow();
    });

    it("should be able to parse an email with @ in display name", async () => {
      const message = await readFixture(
        "emails",
        "plain_emails",
        "raw_email_with_at_display_name.eml",
      );
      expect([...(message.to() as string[])]).toEqual([
        "smith@gmail.com",
        "raasdnil@gmail.com",
        "tom@gmail.com",
      ]);
    });

    it("should be able to parse an email with only blank lines as body", async () => {
      await expect(
        readFixture("emails", "error_emails", "missing_body.eml"),
      ).resolves.not.toThrow();
    });

    it("should be able to parse an email with a funky date header", () => {
      expect(() => readFixture("emails", "error_emails", "bad_date_header2.eml"));
    });

    it("should be able to invoke subject on a funky subject header", async () => {
      (await readFixture("emails", "error_emails", "bad_subject.eml")).subject();
    });

    it("should be able to parse an email missing an encoding", async () => {
      await readFixture("emails", "error_emails", "must_supply_encoding.eml");
    });

    for (const path of fixtureEmls) {
      it(`parses ${path} fixture`, async () => {
        const write = vi.spyOn(stderr, "write").mockImplementation(() => true);
        try {
          await expect(Mail.read(path)).resolves.not.toThrow();
        } finally {
          write.mockRestore();
        }
      });
    }

    it("should be able to parse a large email without raising an exception", async () => {
      const m = Mail.new();
      await m.addFile({ filename: "attachment.data", content: "a".repeat(8 * 1024 * 1024) });
      const rawEmail = `From jamis_buck@byu.edu Mon May  2 16:07:05 2005\r\n${m.toString()}`;

      expect(() => new Message(rawEmail)).not.toThrow();
      expect((new Message(rawEmail).part() as PartsList)[0].header().get("filename")).toBeNull();
    });

    it("should not raise a warning on having non US-ASCII characters in the header (should just handle it)", async () => {
      await expect(() =>
        readFixture("emails", "plain_emails", "raw_email_string_in_date_field.eml"),
      ).not.toOutput(undefined, "stderr");
    });

    it("should raise a warning (and keep parsing) on having an incorrectly formatted header", async () => {
      const write = vi.spyOn(stderr, "write").mockImplementation(() => true);
      try {
        (await readFixture("emails", "plain_emails", "raw_email_incorrect_header.eml")).toString();
        expect(write).toHaveBeenCalledExactlyOnceWith(
          'WARNING: Ignoring unparsable header "quite Delivered-To: xxx@xxx.xxx": invalid header name syntax: "quite Delivered-To"\n',
        );
      } finally {
        write.mockRestore();
      }
    });

    it("should read in an email message and basically parse it", async () => {
      const mail = await readFixture("emails", "plain_emails", "basic_email.eml");
      expect([...(mail.to() as string[])]).toEqual(["raasdnil@gmail.com"]);
    });

    it("should not fail parsing message with caps in content_type", async () => {
      const mail = await readFixture("emails", "plain_emails", "mix_caps_content_type.eml");
      expect(mail.contentType()).toBe("text/plain; charset=iso-8859-1");
      expect(mail.mainType()).toBe("text");
      expect(mail.subType()).toBe("plain");
    });

    it("should be able to pass an empty reply-to header", async () => {
      const mail = await readFixture("emails", "error_emails", "empty_in_reply_to.eml");
      expect(Utilities.isBlank(mail.inReplyTo())).toBeTruthy();
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

      it("should deserialize after serializing", () => {
        const deserialized = Message.fromYaml(yamlMail.toYaml());
        expect(deserialized).toEqualRuby(yamlMail);
        expect(
          Object.fromEntries(
            (deserialized.deliveryMethod() as { settings: Map<string, unknown> }).settings,
          ),
        ).toEqual(smtpSettings);
      });

      it("should load a serialized delivery handler", () => {
        yamlMail.deliveryHandler = DeliveryAgent;
        const deserialized = Message.fromYaml(yamlMail.toYaml());
        expect(deserialized.deliveryHandler).toBe(DeliveryAgent);
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

    it("should strip off the envelope from field if present", async () => {
      const message = await readFixture("emails", "plain_emails", "raw_email.eml");
      expect(message.envelopeFrom()).toBe("jamis_buck@byu.edu");
      expect(message.envelopeDate()).toEqual(DateTime.parse("Mon May  2 16:07:05 2005"));
    });

    it("should strip off the envelope from field if present", async () => {
      const message = await readFixture("emails", "plain_emails", "raw_email.eml");
      expect(message.rawEnvelope).toBe("jamis_buck@byu.edu Mon May  2 16:07:05 2005");
      expect([...(message.from() as string[])]).toEqual(["jamis@37signals.com"]);
    });

    it("should not cause any problems if there is no envelope from present", async () => {
      const message = await readFixture("emails", "plain_emails", "basic_email.eml");
      expect([...(message.from() as string[])]).toEqual(["test@lindsaar.net"]);
    });

    it("should ignore a plain text body that starts with ^From", () => {
      const m = new Message(
        "From: mikel@test.lindsaar.net\r\n\r\nThis is a way to break mail by putting\r\nFrom at the start of a body\r\nor elsewhere.",
      );
      expect(m.from()).not.toBeNull();
      expect([...(m.from() as string[])]).toEqual(["mikel@test.lindsaar.net"]);
    });

    it("should handle a multipart message that has ^From in it", async () => {
      const m = await readFixture("emails", "error_emails", "cant_parse_from.eml");
      expect(m.from()).not.toBeNull();
      expect([...(m.from() as string[])]).toEqual(["News@InsideApple.Apple.com"]);
      expect(m.isMultipart()).toBeTruthy();
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

    it("should give the header class the header to parse", () => {
      headerNew.mockClear();
      new Message(basicEmail());
      expect(headerNew).toHaveBeenCalledWith("To: mikel\r\nFrom: bob\r\nSubject: Hello!", "UTF-8");
    });

    it("should give the header class the header to parse even if there is no body", () => {
      headerNew.mockClear();
      new Message("To: mikel\r\nFrom: bob\r\nSubject: Hello!");
      expect(headerNew).toHaveBeenCalledWith("To: mikel\r\nFrom: bob\r\nSubject: Hello!", "UTF-8");
    });

    it("should give the body class the body to parse", () => {
      bodyNew.mockClear();
      const mail = new Message(basicEmail());
      mail.body();
      expect(bodyNew).toHaveBeenCalledWith("email message\r\n");
    });

    it("should still ask the body for a new instance even though these is nothing to parse, yet", () => {
      bodyNew.mockClear();
      new Message("To: mikel\r\nFrom: bob\r\nSubject: Hello!");
      expect(bodyNew).toHaveBeenCalled();
    });

    it("should give the header the part before the line without spaces and the body the part without", () => {
      headerNew.mockClear();
      bodyNew.mockClear();
      const mail = new Message("To: mikel\r\n\r\nG'Day!");
      mail.body();
      expect(headerNew).toHaveBeenCalledWith("To: mikel", "UTF-8");
      expect(bodyNew).toHaveBeenCalledWith("G'Day!");
    });

    it("should allow for whitespace at the start of the email", () => {
      const mail = Mail.new("\r\n\r\nFrom: mikel\r\n\r\nThis is the body");
      expect(mail.body().toString()).toBe("This is the body");
      expect([...(mail.from() as string[])]).toEqual(["mikel"]);
    });

    it("should read in an email message with the word 'From' in it multiple times and parse it", async () => {
      const mail = await readFixture("emails", "mime_emails", "two_from_in_message.eml");
      expect(mail.to()).not.toBeNull();
      expect([...(mail.to() as string[])]).toEqual(["tester2@test.com"]);
    });

    it("should parse non-UTF8 sources", async () => {
      const rawMessage = await readRawFixture("emails", "multi_charset", "japanese_iso_2022.eml");
      const originalEncoding = rbObjEncoding(rawMessage);
      const mail = Mail.new(rawMessage);
      expect([...(mail.to() as string[])]).toEqual(["raasdnil@gmail.com"]);
      expect(mail.decoded()).toBe("すみません。\n\n");
      expect(rbObjEncoding(rawMessage)).toBe(originalEncoding);
    });

    it("should parse sources with charsets that we know but Ruby doesn't", async () => {
      const rawMessage = await readRawFixture("emails", "multi_charset", "ks_c_5601-1987.eml");
      const originalEncoding = rbObjEncoding(rawMessage);
      const mail = Mail.new(rawMessage);
      expect(chomp(mail.decoded() as string)).toBe("스티해");
      expect(rbObjEncoding(rawMessage)).toBe(originalEncoding);
    });

    it("should be able to normalize CRLFs on non-UTF8 encodings", async () => {
      const mail = Mail.new(
        await readRawFixture("emails", "multi_charset", "japanese_shift_jis.eml"),
      );
      expect(rbObjEncoding(mail.rawSource)).toBe(Encoding.BINARY);
    });

    it("should be able to normalize CRLFs on non-UTF8 encodings", async () => {
      const mail = Mail.new(
        await readRawFixture("emails", "multi_charset", "japanese_shift_jis.eml"),
      );
      expect(rbObjEncoding(mail.rawSource)).toBe(Encoding.BINARY);
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

    describe("setting headers", () => {
      it("should accept them in block form", () => {
        const message = Mail.new(function (this: Message) {
          this.bcc("mikel@bcc.lindsaar.net");
          this.cc("mikel@cc.lindsaar.net");
          this.comments("this is a comment");
          this.date("12 Aug 2009 00:00:01 GMT");
          this.from("mikel@from.lindsaar.net");
          this.inReplyTo("<1234@in_reply_to.lindsaar.net>");
          this.keywords('test, "of the new mail", system');
          this.messageId("<1234@message_id.lindsaar.net>");
          this.received("from machine.example by x.y.test; 12 Aug 2009 00:00:02 GMT");
          this.references("<1234@references.lindsaar.net>");
          this.replyTo("mikel@reply-to.lindsaar.net");
          this.resentBcc("mikel@resent-bcc.lindsaar.net");
          this.resentCc("mikel@resent-cc.lindsaar.net");
          this.resentDate("12 Aug 2009 00:00:03 GMT");
          this.resentFrom("mikel@resent-from.lindsaar.net");
          this.resentMessageId("<1234@resent_message_id.lindsaar.net>");
          this.resentSender("mikel@resent-sender.lindsaar.net");
          this.resentTo("mikel@resent-to.lindsaar.net");
          this.sender("mikel@sender.lindsaar.net");
          this.subject("Hello there Mikel");
          this.to("mikel@to.lindsaar.net");
          this.contentType("text/plain; charset=UTF-8");
          this.contentTransferEncoding("7bit");
          this.contentDescription("This is a test");
          this.contentDisposition("attachment; filename=File");
          this.contentId("<1234@message_id.lindsaar.net>");
          this.mimeVersion("1.0");
          this.body("This is a body of text");
        });

        expect([...(message.bcc() as string[])]).toEqual(["mikel@bcc.lindsaar.net"]);
        expect([...(message.cc() as string[])]).toEqual(["mikel@cc.lindsaar.net"]);
        expect(message.comments()).toBe("this is a comment");
        expect(message.date()).toEqual(DateTime.parse("12 Aug 2009 00:00:01 GMT"));
        expect([...(message.from() as string[])]).toEqual(["mikel@from.lindsaar.net"]);
        expect(message.inReplyTo()).toBe("1234@in_reply_to.lindsaar.net");
        expect(message.keywords()).toEqual(["test", "of the new mail", "system"]);
        expect(message.messageId()).toBe("1234@message_id.lindsaar.net");
        expect((message.received() as { dateTime(): unknown }).dateTime()).toEqual(
          DateTime.parse("12 Aug 2009 00:00:02 GMT"),
        );
        expect(message.references()).toBe("1234@references.lindsaar.net");
        expect([...(message.replyTo() as string[])]).toEqual(["mikel@reply-to.lindsaar.net"]);
        expect([...(message.resentBcc() as string[])]).toEqual(["mikel@resent-bcc.lindsaar.net"]);
        expect([...(message.resentCc() as string[])]).toEqual(["mikel@resent-cc.lindsaar.net"]);
        expect(message.resentDate()).toEqual(DateTime.parse("12 Aug 2009 00:00:03 GMT"));
        expect([...(message.resentFrom() as string[])]).toEqual(["mikel@resent-from.lindsaar.net"]);
        expect(message.resentMessageId()).toBe("1234@resent_message_id.lindsaar.net");
        expect([...(message.resentSender() as string[])]).toEqual([
          "mikel@resent-sender.lindsaar.net",
        ]);
        expect([...(message.resentTo() as string[])]).toEqual(["mikel@resent-to.lindsaar.net"]);
        expect(message.sender()).toBe("mikel@sender.lindsaar.net");
        expect(message.subject()).toBe("Hello there Mikel");
        expect([...(message.to() as string[])]).toEqual(["mikel@to.lindsaar.net"]);
        expect(message.contentType()).toBe("text/plain; charset=UTF-8");
        expect(message.contentTransferEncoding()).toBe("7bit");
        expect(message.contentDescription()).toBe("This is a test");
        expect(message.contentDisposition()).toBe("attachment; filename=File");
        expect(message.contentId()).toBe("<1234@message_id.lindsaar.net>");
        expect(message.mimeVersion()).toBe("1.0");
        expect(message.body().toString()).toBe("This is a body of text");
      });

      it("should accept them in assignment form", () => {
        const message = Mail.new();
        message.setBcc("mikel@bcc.lindsaar.net");
        message.setCc("mikel@cc.lindsaar.net");
        message.setComments("this is a comment");
        message.setDate("12 Aug 2009 00:00:01 GMT");
        message.setFrom("mikel@from.lindsaar.net");
        message.setInReplyTo("<1234@in_reply_to.lindsaar.net>");
        message.setKeywords('test, "of the new mail", system');
        message.setMessageId("<1234@message_id.lindsaar.net>");
        message.setReceived("from machine.example by x.y.test; 12 Aug 2009 00:00:02 GMT");
        message.setReferences("<1234@references.lindsaar.net>");
        message.setReplyTo("mikel@reply-to.lindsaar.net");
        message.setResentBcc("mikel@resent-bcc.lindsaar.net");
        message.setResentCc("mikel@resent-cc.lindsaar.net");
        message.setResentDate("12 Aug 2009 00:00:03 GMT");
        message.setResentFrom("mikel@resent-from.lindsaar.net");
        message.setResentMessageId("<1234@resent_message_id.lindsaar.net>");
        message.setResentSender("mikel@resent-sender.lindsaar.net");
        message.setResentTo("mikel@resent-to.lindsaar.net");
        message.setSender("mikel@sender.lindsaar.net");
        message.setSubject("Hello there Mikel");
        message.setTo("mikel@to.lindsaar.net");
        message.setContentType("text/plain; charset=UTF-8");
        message.setContentTransferEncoding("7bit");
        message.setContentDescription("This is a test");
        message.setContentDisposition("attachment; filename=File");
        message.setContentId("<1234@message_id.lindsaar.net>");
        message.setMimeVersion("1.0");
        message.setBody("This is a body of text");

        expect([...(message.bcc() as string[])]).toEqual(["mikel@bcc.lindsaar.net"]);
        expect([...(message.cc() as string[])]).toEqual(["mikel@cc.lindsaar.net"]);
        expect(message.comments()).toBe("this is a comment");
        expect(message.date()).toEqual(DateTime.parse("12 Aug 2009 00:00:01 GMT"));
        expect([...(message.from() as string[])]).toEqual(["mikel@from.lindsaar.net"]);
        expect(message.inReplyTo()).toBe("1234@in_reply_to.lindsaar.net");
        expect(message.keywords()).toEqual(["test", "of the new mail", "system"]);
        expect(message.messageId()).toBe("1234@message_id.lindsaar.net");
        expect((message.received() as { dateTime(): unknown }).dateTime()).toEqual(
          DateTime.parse("12 Aug 2009 00:00:02 GMT"),
        );
        expect(message.references()).toBe("1234@references.lindsaar.net");
        expect([...(message.replyTo() as string[])]).toEqual(["mikel@reply-to.lindsaar.net"]);
        expect([...(message.resentBcc() as string[])]).toEqual(["mikel@resent-bcc.lindsaar.net"]);
        expect([...(message.resentCc() as string[])]).toEqual(["mikel@resent-cc.lindsaar.net"]);
        expect(message.resentDate()).toEqual(DateTime.parse("12 Aug 2009 00:00:03 GMT"));
        expect([...(message.resentFrom() as string[])]).toEqual(["mikel@resent-from.lindsaar.net"]);
        expect(message.resentMessageId()).toBe("1234@resent_message_id.lindsaar.net");
        expect([...(message.resentSender() as string[])]).toEqual([
          "mikel@resent-sender.lindsaar.net",
        ]);
        expect([...(message.resentTo() as string[])]).toEqual(["mikel@resent-to.lindsaar.net"]);
        expect(message.sender()).toBe("mikel@sender.lindsaar.net");
        expect(message.subject()).toBe("Hello there Mikel");
        expect([...(message.to() as string[])]).toEqual(["mikel@to.lindsaar.net"]);
        expect(message.contentType()).toBe("text/plain; charset=UTF-8");
        expect(message.contentTransferEncoding()).toBe("7bit");
        expect(message.contentDescription()).toBe("This is a test");
        expect(message.contentDisposition()).toBe("attachment; filename=File");
        expect(message.contentId()).toBe("<1234@message_id.lindsaar.net>");
        expect(message.mimeVersion()).toBe("1.0");
        expect(message.body().toString()).toBe("This is a body of text");
      });

      it("should accept them in key, value form as symbols", () => {
        const message = Mail.new();
        message.set("bcc", "mikel@bcc.lindsaar.net");
        message.set("cc", "mikel@cc.lindsaar.net");
        message.set("comments", "this is a comment");
        message.set("date", "12 Aug 2009 00:00:01 GMT");
        message.set("from", "mikel@from.lindsaar.net");
        message.set("inReplyTo", "<1234@in_reply_to.lindsaar.net>");
        message.set("keywords", 'test, "of the new mail", system');
        message.set("messageId", "<1234@message_id.lindsaar.net>");
        message.set("received", "from machine.example by x.y.test; 12 Aug 2009 00:00:02 GMT");
        message.set("references", "<1234@references.lindsaar.net>");
        message.set("replyTo", "mikel@reply-to.lindsaar.net");
        message.set("resentBcc", "mikel@resent-bcc.lindsaar.net");
        message.set("resentCc", "mikel@resent-cc.lindsaar.net");
        message.set("resentDate", "12 Aug 2009 00:00:03 GMT");
        message.set("resentFrom", "mikel@resent-from.lindsaar.net");
        message.set("resentMessageId", "<1234@resent_message_id.lindsaar.net>");
        message.set("resentSender", "mikel@resent-sender.lindsaar.net");
        message.set("resentTo", "mikel@resent-to.lindsaar.net");
        message.set("sender", "mikel@sender.lindsaar.net");
        message.set("subject", "Hello there Mikel");
        message.set("to", "mikel@to.lindsaar.net");
        message.set("contentType", "text/plain; charset=UTF-8");
        message.set("contentTransferEncoding", "7bit");
        message.set("contentDescription", "This is a test");
        message.set("contentDisposition", "attachment; filename=File");
        message.set("contentId", "<1234@message_id.lindsaar.net>");
        message.set("mimeVersion", "1.0");
        message.set("body", "This is a body of text");

        expect([...(message.bcc() as string[])]).toEqual(["mikel@bcc.lindsaar.net"]);
        expect([...(message.cc() as string[])]).toEqual(["mikel@cc.lindsaar.net"]);
        expect(message.comments()).toBe("this is a comment");
        expect(message.date()).toEqual(DateTime.parse("12 Aug 2009 00:00:01 GMT"));
        expect([...(message.from() as string[])]).toEqual(["mikel@from.lindsaar.net"]);
        expect(message.inReplyTo()).toBe("1234@in_reply_to.lindsaar.net");
        expect(message.keywords()).toEqual(["test", "of the new mail", "system"]);
        expect(message.messageId()).toBe("1234@message_id.lindsaar.net");
        expect((message.received() as { dateTime(): unknown }).dateTime()).toEqual(
          DateTime.parse("12 Aug 2009 00:00:02 GMT"),
        );
        expect(message.references()).toBe("1234@references.lindsaar.net");
        expect([...(message.replyTo() as string[])]).toEqual(["mikel@reply-to.lindsaar.net"]);
        expect([...(message.resentBcc() as string[])]).toEqual(["mikel@resent-bcc.lindsaar.net"]);
        expect([...(message.resentCc() as string[])]).toEqual(["mikel@resent-cc.lindsaar.net"]);
        expect(message.resentDate()).toEqual(DateTime.parse("12 Aug 2009 00:00:03 GMT"));
        expect([...(message.resentFrom() as string[])]).toEqual(["mikel@resent-from.lindsaar.net"]);
        expect(message.resentMessageId()).toBe("1234@resent_message_id.lindsaar.net");
        expect([...(message.resentSender() as string[])]).toEqual([
          "mikel@resent-sender.lindsaar.net",
        ]);
        expect([...(message.resentTo() as string[])]).toEqual(["mikel@resent-to.lindsaar.net"]);
        expect(message.sender()).toBe("mikel@sender.lindsaar.net");
        expect(message.subject()).toBe("Hello there Mikel");
        expect([...(message.to() as string[])]).toEqual(["mikel@to.lindsaar.net"]);
        expect(message.contentType()).toBe("text/plain; charset=UTF-8");
        expect(message.contentTransferEncoding()).toBe("7bit");
        expect(message.contentDescription()).toBe("This is a test");
        expect(message.contentDisposition()).toBe("attachment; filename=File");
        expect(message.contentId()).toBe("<1234@message_id.lindsaar.net>");
        expect(message.mimeVersion()).toBe("1.0");
        expect(message.body().toString()).toBe("This is a body of text");
      });

      it("should accept them in key, value form as strings", () => {
        const message = Mail.new();
        message.set("bcc", "mikel@bcc.lindsaar.net");
        message.set("cc", "mikel@cc.lindsaar.net");
        message.set("comments", "this is a comment");
        message.set("date", "12 Aug 2009 00:00:01 GMT");
        message.set("from", "mikel@from.lindsaar.net");
        message.set("in_reply_to", "<1234@in_reply_to.lindsaar.net>");
        message.set("keywords", 'test, "of the new mail", system');
        message.set("message_id", "<1234@message_id.lindsaar.net>");
        message.set("received", "from machine.example by x.y.test; 12 Aug 2009 00:00:02 GMT");
        message.set("references", "<1234@references.lindsaar.net>");
        message.set("reply_to", "mikel@reply-to.lindsaar.net");
        message.set("resent_bcc", "mikel@resent-bcc.lindsaar.net");
        message.set("resent_cc", "mikel@resent-cc.lindsaar.net");
        message.set("resent_date", "12 Aug 2009 00:00:03 GMT");
        message.set("resent_from", "mikel@resent-from.lindsaar.net");
        message.set("resent_message_id", "<1234@resent_message_id.lindsaar.net>");
        message.set("resent_sender", "mikel@resent-sender.lindsaar.net");
        message.set("resent_to", "mikel@resent-to.lindsaar.net");
        message.set("sender", "mikel@sender.lindsaar.net");
        message.set("subject", "Hello there Mikel");
        message.set("to", "mikel@to.lindsaar.net");
        message.set("content_type", "text/plain; charset=UTF-8");
        message.set("content_transfer_encoding", "7bit");
        message.set("content_description", "This is a test");
        message.set("content_disposition", "attachment; filename=File");
        message.set("content_id", "<1234@message_id.lindsaar.net>");
        message.set("mime_version", "1.0");
        message.set("body", "This is a body of text");

        expect([...(message.bcc() as string[])]).toEqual(["mikel@bcc.lindsaar.net"]);
        expect([...(message.cc() as string[])]).toEqual(["mikel@cc.lindsaar.net"]);
        expect(message.comments()).toBe("this is a comment");
        expect(message.date()).toEqual(DateTime.parse("12 Aug 2009 00:00:01 GMT"));
        expect([...(message.from() as string[])]).toEqual(["mikel@from.lindsaar.net"]);
        expect(message.inReplyTo()).toBe("1234@in_reply_to.lindsaar.net");
        expect(message.keywords()).toEqual(["test", "of the new mail", "system"]);
        expect(message.messageId()).toBe("1234@message_id.lindsaar.net");
        expect((message.received() as { dateTime(): unknown }).dateTime()).toEqual(
          DateTime.parse("12 Aug 2009 00:00:02 GMT"),
        );
        expect(message.references()).toBe("1234@references.lindsaar.net");
        expect([...(message.replyTo() as string[])]).toEqual(["mikel@reply-to.lindsaar.net"]);
        expect([...(message.resentBcc() as string[])]).toEqual(["mikel@resent-bcc.lindsaar.net"]);
        expect([...(message.resentCc() as string[])]).toEqual(["mikel@resent-cc.lindsaar.net"]);
        expect(message.resentDate()).toEqual(DateTime.parse("12 Aug 2009 00:00:03 GMT"));
        expect([...(message.resentFrom() as string[])]).toEqual(["mikel@resent-from.lindsaar.net"]);
        expect(message.resentMessageId()).toBe("1234@resent_message_id.lindsaar.net");
        expect([...(message.resentSender() as string[])]).toEqual([
          "mikel@resent-sender.lindsaar.net",
        ]);
        expect([...(message.resentTo() as string[])]).toEqual(["mikel@resent-to.lindsaar.net"]);
        expect(message.sender()).toBe("mikel@sender.lindsaar.net");
        expect(message.subject()).toBe("Hello there Mikel");
        expect([...(message.to() as string[])]).toEqual(["mikel@to.lindsaar.net"]);
        expect(message.contentType()).toBe("text/plain; charset=UTF-8");
        expect(message.contentTransferEncoding()).toBe("7bit");
        expect(message.contentDescription()).toBe("This is a test");
        expect(message.contentDisposition()).toBe("attachment; filename=File");
        expect(message.contentId()).toBe("<1234@message_id.lindsaar.net>");
        expect(message.mimeVersion()).toBe("1.0");
        expect(message.body().toString()).toBe("This is a body of text");
      });

      it("should accept them as a hash with symbols", () => {
        const message = Mail.new({
          bcc: "mikel@bcc.lindsaar.net",
          cc: "mikel@cc.lindsaar.net",
          comments: "this is a comment",
          date: "12 Aug 2009 00:00:01 GMT",
          from: "mikel@from.lindsaar.net",
          inReplyTo: "<1234@in_reply_to.lindsaar.net>",
          keywords: 'test, "of the new mail", system',
          messageId: "<1234@message_id.lindsaar.net>",
          received: "from machine.example by x.y.test; 12 Aug 2009 00:00:02 GMT",
          references: "<1234@references.lindsaar.net>",
          replyTo: "mikel@reply-to.lindsaar.net",
          resentBcc: "mikel@resent-bcc.lindsaar.net",
          resentCc: "mikel@resent-cc.lindsaar.net",
          resentDate: "12 Aug 2009 00:00:03 GMT",
          resentFrom: "mikel@resent-from.lindsaar.net",
          resentMessageId: "<1234@resent_message_id.lindsaar.net>",
          resentSender: "mikel@resent-sender.lindsaar.net",
          resentTo: "mikel@resent-to.lindsaar.net",
          sender: "mikel@sender.lindsaar.net",
          subject: "Hello there Mikel",
          to: "mikel@to.lindsaar.net",
          contentType: "text/plain; charset=UTF-8",
          contentTransferEncoding: "7bit",
          contentDescription: "This is a test",
          contentDisposition: "attachment; filename=File",
          contentId: "<1234@message_id.lindsaar.net>",
          mimeVersion: "1.0",
          body: "This is a body of text",
        });

        expect([...(message.bcc() as string[])]).toEqual(["mikel@bcc.lindsaar.net"]);
        expect([...(message.cc() as string[])]).toEqual(["mikel@cc.lindsaar.net"]);
        expect(message.comments()).toBe("this is a comment");
        expect(message.date()).toEqual(DateTime.parse("12 Aug 2009 00:00:01 GMT"));
        expect([...(message.from() as string[])]).toEqual(["mikel@from.lindsaar.net"]);
        expect(message.inReplyTo()).toBe("1234@in_reply_to.lindsaar.net");
        expect(message.keywords()).toEqual(["test", "of the new mail", "system"]);
        expect(message.messageId()).toBe("1234@message_id.lindsaar.net");
        expect((message.received() as { dateTime(): unknown }).dateTime()).toEqual(
          DateTime.parse("12 Aug 2009 00:00:02 GMT"),
        );
        expect(message.references()).toBe("1234@references.lindsaar.net");
        expect([...(message.replyTo() as string[])]).toEqual(["mikel@reply-to.lindsaar.net"]);
        expect([...(message.resentBcc() as string[])]).toEqual(["mikel@resent-bcc.lindsaar.net"]);
        expect([...(message.resentCc() as string[])]).toEqual(["mikel@resent-cc.lindsaar.net"]);
        expect(message.resentDate()).toEqual(DateTime.parse("12 Aug 2009 00:00:03 GMT"));
        expect([...(message.resentFrom() as string[])]).toEqual(["mikel@resent-from.lindsaar.net"]);
        expect(message.resentMessageId()).toBe("1234@resent_message_id.lindsaar.net");
        expect([...(message.resentSender() as string[])]).toEqual([
          "mikel@resent-sender.lindsaar.net",
        ]);
        expect([...(message.resentTo() as string[])]).toEqual(["mikel@resent-to.lindsaar.net"]);
        expect(message.sender()).toBe("mikel@sender.lindsaar.net");
        expect(message.subject()).toBe("Hello there Mikel");
        expect([...(message.to() as string[])]).toEqual(["mikel@to.lindsaar.net"]);
        expect(message.contentType()).toBe("text/plain; charset=UTF-8");
        expect(message.contentTransferEncoding()).toBe("7bit");
        expect(message.contentDescription()).toBe("This is a test");
        expect(message.contentDisposition()).toBe("attachment; filename=File");
        expect(message.contentId()).toBe("<1234@message_id.lindsaar.net>");
        expect(message.mimeVersion()).toBe("1.0");
        expect(message.body().toString()).toBe("This is a body of text");
      });

      it("should accept them as a hash with strings", () => {
        const message = Mail.new({
          bcc: "mikel@bcc.lindsaar.net",
          cc: "mikel@cc.lindsaar.net",
          comments: "this is a comment",
          date: "12 Aug 2009 00:00:01 GMT",
          from: "mikel@from.lindsaar.net",
          in_reply_to: "<1234@in_reply_to.lindsaar.net>",
          keywords: 'test, "of the new mail", system',
          message_id: "<1234@message_id.lindsaar.net>",
          received: "from machine.example by x.y.test; 12 Aug 2009 00:00:02 GMT",
          references: "<1234@references.lindsaar.net>",
          reply_to: "mikel@reply-to.lindsaar.net",
          resent_bcc: "mikel@resent-bcc.lindsaar.net",
          resent_cc: "mikel@resent-cc.lindsaar.net",
          resent_date: "12 Aug 2009 00:00:03 GMT",
          resent_from: "mikel@resent-from.lindsaar.net",
          resent_message_id: "<1234@resent_message_id.lindsaar.net>",
          resent_sender: "mikel@resent-sender.lindsaar.net",
          resent_to: "mikel@resent-to.lindsaar.net",
          sender: "mikel@sender.lindsaar.net",
          subject: "Hello there Mikel",
          to: "mikel@to.lindsaar.net",
          content_type: "text/plain; charset=UTF-8",
          content_transfer_encoding: "7bit",
          content_description: "This is a test",
          content_disposition: "attachment; filename=File",
          content_id: "<1234@message_id.lindsaar.net>",
          mime_version: "1.0",
          body: "This is a body of text",
        });

        expect([...(message.bcc() as string[])]).toEqual(["mikel@bcc.lindsaar.net"]);
        expect([...(message.cc() as string[])]).toEqual(["mikel@cc.lindsaar.net"]);
        expect(message.comments()).toBe("this is a comment");
        expect(message.date()).toEqual(DateTime.parse("12 Aug 2009 00:00:01 GMT"));
        expect([...(message.from() as string[])]).toEqual(["mikel@from.lindsaar.net"]);
        expect(message.inReplyTo()).toBe("1234@in_reply_to.lindsaar.net");
        expect(message.keywords()).toEqual(["test", "of the new mail", "system"]);
        expect(message.messageId()).toBe("1234@message_id.lindsaar.net");
        expect((message.received() as { dateTime(): unknown }).dateTime()).toEqual(
          DateTime.parse("12 Aug 2009 00:00:02 GMT"),
        );
        expect(message.references()).toBe("1234@references.lindsaar.net");
        expect([...(message.replyTo() as string[])]).toEqual(["mikel@reply-to.lindsaar.net"]);
        expect([...(message.resentBcc() as string[])]).toEqual(["mikel@resent-bcc.lindsaar.net"]);
        expect([...(message.resentCc() as string[])]).toEqual(["mikel@resent-cc.lindsaar.net"]);
        expect(message.resentDate()).toEqual(DateTime.parse("12 Aug 2009 00:00:03 GMT"));
        expect([...(message.resentFrom() as string[])]).toEqual(["mikel@resent-from.lindsaar.net"]);
        expect(message.resentMessageId()).toBe("1234@resent_message_id.lindsaar.net");
        expect([...(message.resentSender() as string[])]).toEqual([
          "mikel@resent-sender.lindsaar.net",
        ]);
        expect([...(message.resentTo() as string[])]).toEqual(["mikel@resent-to.lindsaar.net"]);
        expect(message.sender()).toBe("mikel@sender.lindsaar.net");
        expect(message.subject()).toBe("Hello there Mikel");
        expect([...(message.to() as string[])]).toEqual(["mikel@to.lindsaar.net"]);
        expect(message.contentType()).toBe("text/plain; charset=UTF-8");
        expect(message.contentTransferEncoding()).toBe("7bit");
        expect(message.contentDescription()).toBe("This is a test");
        expect(message.contentDisposition()).toBe("attachment; filename=File");
        expect(message.contentId()).toBe("<1234@message_id.lindsaar.net>");
        expect(message.mimeVersion()).toBe("1.0");
        expect(message.body().toString()).toBe("This is a body of text");
      });

      it("should let you set custom headers with a :headers => {hash}", () => {
        const message = Mail.new({ headers: { "custom-header": "mikel" } });
        expect((message.get("custom-header") as Field).decoded()).toBe("mikel");
      });

      it("should assign the body to a part on creation", () => {
        const message = Mail.new(function (this: Message) {
          this.part({
            contentType: "multipart/alternative",
            contentDisposition: "inline",
            body: "Nothing to see here.",
          });
        });
        expect(message.parts[0].body().decoded()).toBe("Nothing to see here.");
      });

      it("should not overwrite bodies on creation", () => {
        const message = Mail.new(function (this: Message) {
          this.part(
            {
              contentType: "multipart/alternative",
              contentDisposition: "inline",
              body: "Nothing to see here.",
            },
            (p) => {
              p.part({ contentType: "text/html", body: "<b>test</b> HTML<br/>" });
            },
          );
        });
        expect(message.parts[0].parts[0].body().decoded()).toBe("Nothing to see here.");
        expect(message.parts[0].parts[1].body().decoded()).toBe("<b>test</b> HTML<br/>");
        expect(message.encoded()).toMatch(/Nothing to see here\./);
        expect(message.encoded()).toMatch(/<b>test<\/b> HTML<br\/>/);
      });

      it("should allow you to init on an array of addresses from a hash", () => {
        const mail = Mail.new({ to: ["test1@lindsaar.net", "Mikel <test2@lindsaar.net>"] });
        expect([...(mail.to() as string[])]).toEqual(["test1@lindsaar.net", "test2@lindsaar.net"]);
      });

      it("should allow you to init on an array of addresses directly", () => {
        const mail = Mail.new();
        mail.setTo(["test1@lindsaar.net", "Mikel <test2@lindsaar.net>"]);
        expect([...(mail.to() as string[])]).toEqual(["test1@lindsaar.net", "test2@lindsaar.net"]);
      });

      it("should allow you to init on an array of addresses directly", () => {
        const mail = Mail.new();
        mail.set("to", ["test1@lindsaar.net", "Mikel <test2@lindsaar.net>"]);
        expect([...(mail.to() as string[])]).toEqual(["test1@lindsaar.net", "test2@lindsaar.net"]);
      });
    });
  });
  describe("making a copy of a message with dup", () => {
    function messageShouldHaveDefaultValues(message: Message) {
      expect(message.bcc()).toBeNull();
      expect(message.cc()).toBeNull();
      expect(message.comments()).toBeNull();
      expect(message.date()).toBeNull();
      expect(message.from()).toBeNull();
      expect(message.inReplyTo()).toBeNull();
      expect(message.keywords()).toBeNull();
      expect(message.messageId()).toBeNull();
      expect(message.received()).toBeNull();
      expect(message.references()).toBeNull();
      expect(message.replyTo()).toBeNull();
      expect(message.resentBcc()).toBeNull();
      expect(message.resentCc()).toBeNull();
      expect(message.resentDate()).toBeNull();
      expect(message.resentFrom()).toBeNull();
      expect(message.resentMessageId()).toBeNull();
      expect(message.resentSender()).toBeNull();
      expect(message.resentTo()).toBeNull();
      expect(message.sender()).toBeNull();
      expect(message.subject()).toBeNull();
      expect(message.to()).toBeNull();
      expect(message.contentType()).toBeNull();
      expect(message.contentTransferEncoding()).toBeNull();
      expect(message.contentDescription()).toBeNull();
      expect(message.contentDisposition()).toBeNull();
      expect(message.contentId()).toBeNull();
      expect(message.mimeVersion()).toBeNull();
      expect(message.body().toString()).toBe("");
    }

    it("its headers should not be changed when you change the headers of the original", () => {
      const message = Mail.new();
      const messageCopy = rbObjDup(message);
      messageShouldHaveDefaultValues(message);
      messageShouldHaveDefaultValues(messageCopy);

      message.set("bcc", "mikel@bcc.lindsaar.net");
      message.set("cc", "mikel@cc.lindsaar.net");
      message.set("comments", "this is a comment");
      message.set("date", "12 Aug 2009 00:00:01 GMT");
      message.set("from", "mikel@from.lindsaar.net");
      message.set("in_reply_to", "<1234@in_reply_to.lindsaar.net>");
      message.set("keywords", 'test, "of the new mail", system');
      message.set("message_id", "<1234@message_id.lindsaar.net>");
      message.set("received", "from machine.example by x.y.test; 12 Aug 2009 00:00:02 GMT");
      message.set("references", "<1234@references.lindsaar.net>");
      message.set("reply_to", "mikel@reply-to.lindsaar.net");
      message.set("resent_bcc", "mikel@resent-bcc.lindsaar.net");
      message.set("resent_cc", "mikel@resent-cc.lindsaar.net");
      message.set("resent_date", "12 Aug 2009 00:00:03 GMT");
      message.set("resent_from", "mikel@resent-from.lindsaar.net");
      message.set("resent_message_id", "<1234@resent_message_id.lindsaar.net>");
      message.set("resent_sender", "mikel@resent-sender.lindsaar.net");
      message.set("resent_to", "mikel@resent-to.lindsaar.net");
      message.set("sender", "mikel@sender.lindsaar.net");
      message.set("subject", "Hello there Mikel");
      message.set("to", "mikel@to.lindsaar.net");
      message.set("content_type", "text/plain; charset=UTF-8");
      message.set("content_transfer_encoding", "7bit");
      message.set("content_description", "This is a test");
      message.set("content_disposition", "attachment; filename=File");
      message.set("content_id", "<1234@message_id.lindsaar.net>");
      message.set("mime_version", "1.0");
      message.set("body", "This is a body of text");

      messageShouldHaveDefaultValues(messageCopy);
    });

    function messageHeadersShouldMatch(message: Message, other: Message) {
      expect(message.bcc()).toEqual(other.bcc());
      expect(message.cc()).toEqual(other.cc());
      expect(message.comments()).toEqual(other.comments());
      expect(message.date()).toEqual(other.date());
      expect(message.from()).toEqual(other.from());
      expect(message.inReplyTo()).toEqual(other.inReplyTo());
      expect(message.keywords()).toEqual(other.keywords());
      expect(message.messageId()).toEqual(other.messageId());
      expect(message.received()).toEqual(other.received());
      expect(message.references()).toEqual(other.references());
      expect(message.replyTo()).toEqual(other.replyTo());
      expect(message.resentBcc()).toEqual(other.resentBcc());
      expect(message.resentCc()).toEqual(other.resentCc());
      expect(message.resentDate()).toEqual(other.resentDate());
      expect(message.resentFrom()).toEqual(other.resentFrom());
      expect(message.resentMessageId()).toEqual(other.resentMessageId());
      expect(message.resentSender()).toEqual(other.resentSender());
      expect(message.resentTo()).toEqual(other.resentTo());
      expect(message.sender()).toEqual(other.sender());
      expect(message.subject()).toEqual(other.subject());
      expect(message.to()).toEqual(other.to());
      expect(message.contentType()).toEqual(other.contentType());
      expect(message.contentTransferEncoding()).toEqual(other.contentTransferEncoding());
      expect(message.contentDescription()).toEqual(other.contentDescription());
      expect(message.contentDisposition()).toEqual(other.contentDisposition());
      expect(message.contentId()).toEqual(other.contentId());
      expect(message.mimeVersion()).toEqual(other.mimeVersion());
      expect(message.body().toString()).toBe(other.body().toString());
    }

    it("its headers should be copies of the headers of the original", () => {
      const message = Mail.new();
      message.set("bcc", "mikel@bcc.lindsaar.net");
      message.set("cc", "mikel@cc.lindsaar.net");
      message.set("comments", "this is a comment");
      message.set("date", "12 Aug 2009 00:00:01 GMT");
      message.set("from", "mikel@from.lindsaar.net");
      message.set("in_reply_to", "<1234@in_reply_to.lindsaar.net>");
      message.set("keywords", 'test, "of the new mail", system');
      message.set("message_id", "<1234@message_id.lindsaar.net>");
      message.set("received", "from machine.example by x.y.test; 12 Aug 2009 00:00:02 GMT");
      message.set("references", "<1234@references.lindsaar.net>");
      message.set("reply_to", "mikel@reply-to.lindsaar.net");
      message.set("resent_bcc", "mikel@resent-bcc.lindsaar.net");
      message.set("resent_cc", "mikel@resent-cc.lindsaar.net");
      message.set("resent_date", "12 Aug 2009 00:00:03 GMT");
      message.set("resent_from", "mikel@resent-from.lindsaar.net");
      message.set("resent_message_id", "<1234@resent_message_id.lindsaar.net>");
      message.set("resent_sender", "mikel@resent-sender.lindsaar.net");
      message.set("resent_to", "mikel@resent-to.lindsaar.net");
      message.set("sender", "mikel@sender.lindsaar.net");
      message.set("subject", "Hello there Mikel");
      message.set("to", "mikel@to.lindsaar.net");
      message.set("content_type", "text/plain; charset=UTF-8");
      message.set("content_transfer_encoding", "7bit");
      message.set("content_description", "This is a test");
      message.set("content_disposition", "attachment; filename=File");
      message.set("content_id", "<1234@message_id.lindsaar.net>");
      message.set("mime_version", "1.0");
      message.set("body", "This is a body of text");

      const messageCopy = rbObjDup(message);
      messageHeadersShouldMatch(messageCopy, message);
    });
  });

  describe("handling missing required fields:", () => {
    describe("every email", () => {
      describe("Message-ID", () => {
        it("should say if it has a message id", () => {
          const mail = Mail.new(function (this: Message) {
            this.from("mikel@test.lindsaar.net");
            this.to("you@test.lindsaar.net");
            this.subject("This is a test email");
            this.body("This is a body of the email");
          });
          expect(mail.hasMessageId()).toBeFalsy();
        });

        it("should preserve any message id that you pass it if add_message_id is called explicitly", () => {
          const mail = Mail.new(function (this: Message) {
            this.from("mikel@test.lindsaar.net");
            this.to("you@test.lindsaar.net");
            this.subject("This is a test email");
            this.body("This is a body of the email");
          });
          mail.addMessageId("<ThisIsANonUniqueMessageId@me.com>");
          expect(mail.toString()).toMatch(/Message-ID: <ThisIsANonUniqueMessageId@me.com>\r\n/);
        });

        it("should generate a random message ID if nothing is passed to add_message_id", () => {
          const mail = Mail.new(function (this: Message) {
            this.from("mikel@test.lindsaar.net");
            this.to("you@test.lindsaar.net");
            this.subject("This is a test email");
            this.body("This is a body of the email");
          });
          mail.addMessageId();
          expect(mail.toString()).toMatch(
            new RegExp(`Message-ID: <[\\w]+@${Socket.gethostname()}.mail>\r\n`),
          );
        });

        it("should make an email and inject a message ID if none was set if told to_s", () => {
          const mail = Mail.new(function (this: Message) {
            this.from("mikel@test.lindsaar.net");
            this.to("you@test.lindsaar.net");
            this.subject("This is a test email");
            this.body("This is a body of the email");
          });
          expect(mail.toString().match(/Message-ID: <.+@.+.mail>/i)).not.toBeNull();
        });

        it("should add the message id to the message permanently once sent to_s", () => {
          const mail = Mail.new(function (this: Message) {
            this.from("mikel@test.lindsaar.net");
            this.to("you@test.lindsaar.net");
            this.subject("This is a test email");
            this.body("This is a body of the email");
          });
          mail.toString();
          expect(mail.hasMessageId()).toBeTruthy();
        });

        it("should add a body part if it is missing", () => {
          const mail = Mail.new();
          mail.toString();
          expect(mail.body().constructor).toBe(Body);
        });
      });

      describe("Date", () => {
        it("should say if it has a date", () => {
          const mail = Mail.new(function (this: Message) {
            this.from("mikel@test.lindsaar.net");
            this.to("you@test.lindsaar.net");
            this.subject("This is a test email");
            this.body("This is a body of the email");
          });
          expect(mail.hasDate()).toBeFalsy();
        });

        it("should preserve any date that you pass it if add_date is called explicitly", () => {
          const mail = Mail.new(function (this: Message) {
            this.from("mikel@test.lindsaar.net");
            this.to("you@test.lindsaar.net");
            this.subject("This is a test email");
            this.body("This is a body of the email");
          });
          mail.addDate("Mon, 24 Nov 1997 14:22:01 -0800");
          expect(mail.toString()).toMatch(/Date: Mon, 24 Nov 1997 14:22:01 -0800/);
        });

        it("should generate a current date if nothing is passed to add_date", () => {
          const mail = Mail.new(function (this: Message) {
            this.from("mikel@test.lindsaar.net");
            this.to("you@test.lindsaar.net");
            this.subject("This is a test email");
            this.body("This is a body of the email");
          });
          mail.addDate();
          expect(mail.toString()).toMatch(
            /Date: \w{3}, [\s\d]\d \w{3} \d{4} \d{2}:\d{2}:\d{2} [-+]?\d{4}\r\n/,
          );
        });

        it("should make an email and inject a date if none was set if told to_s", () => {
          const mail = Mail.new(function (this: Message) {
            this.from("mikel@test.lindsaar.net");
            this.to("you@test.lindsaar.net");
            this.subject("This is a test email");
            this.body("This is a body of the email");
          });
          expect(mail.toString()).toMatch(
            /Date: \w{3}, [\s\d]\d \w{3} \d{4} \d{2}:\d{2}:\d{2} [-+]?\d{4}\r\n/,
          );
        });

        it("should add the date to the message permanently once sent to_s", () => {
          const mail = Mail.new(function (this: Message) {
            this.from("mikel@test.lindsaar.net");
            this.to("you@test.lindsaar.net");
            this.subject("This is a test email");
            this.body("This is a body of the email");
          });
          mail.toString();
          expect(mail.hasDate()).toBeTruthy();
        });
      });
    });

    describe("mime emails", () => {
      function testEmail() {
        return Mail.new(function (this: Message) {
          this.from("mikel@test.lindsaar.net");
          this.to("you@test.lindsaar.net");
          this.subject("This is a test email");
          this.body("This is a body of the email");
        });
      }
      const nonAscii = "This is NOT plain text ASCII　− かきくけこ";
      const defaultingWarning =
        /Non US-ASCII detected and no charset defined.\nDefaulting to UTF-8, set your own if this is incorrect./;

      describe("mime-version", () => {
        it("should say if it has a mime-version", () => {
          const mail = testEmail();
          expect(mail.hasMimeVersion()).toBeFalsy();
        });

        it("should preserve any mime version that you pass it if add_mime_version is called explicitly", () => {
          const mail = testEmail();
          mail.addMimeVersion("3.0 (This is an unreal version number)");
          expect(mail.toString()).toMatch(/Mime-Version: 3.0\r\n/);
        });

        it("should generate a mime version if nothing is passed to add_date", () => {
          const mail = testEmail();
          mail.addMimeVersion();
          expect(mail.toString()).toMatch(/Mime-Version: 1.0\r\n/);
        });

        it("should make an email and inject a mime_version if none was set if told to_s", () => {
          const mail = testEmail();
          expect(mail.toString()).toMatch(/Mime-Version: 1.0\r\n/);
        });

        it("should add the mime version to the message permanently once sent to_s", () => {
          const mail = testEmail();
          mail.toString();
          expect(mail.hasMimeVersion()).toBeTruthy();
        });
      });

      describe("content type", () => {
        it("should say if it has a content type", () => {
          const mail = Mail.new("Content-Type: text/plain");
          expect(mail.hasContentType()).toBeTruthy();
        });

        it("should say if it does not have a content type", () => {
          const mail = Mail.new();
          expect(mail.hasContentType()).toBeFalsy();
        });

        it("should say if it has a charset", () => {
          const mail = Mail.new("Content-Type: text/plain; charset=US-ASCII");
          expect(mail.hasCharset()).toBeTruthy();
        });

        it("should say if it has a charset", () => {
          const mail = Mail.new("Content-Type: text/plain");
          expect(mail.hasCharset()).toBeFalsy();
        });

        it("should not raise a warning if there is no charset defined and only US-ASCII chars", async () => {
          const body = "This is plain text US-ASCII";
          const mail = Mail.new();
          mail.setBody(body);
          await expect(() => mail.toString()).not.toOutput(undefined, "stderr");
        });

        it("should set the content type to text/plain; charset=us-ascii", () => {
          const body = "This is plain text US-ASCII";
          const mail = Mail.new();
          mail.setBody(body);
          expect(mail.toString()).toMatch(/|Content-Type: text\/plain; charset=US-ASCII|/);
        });

        it("should not set the charset if the file is an attachment", () => {
          const body = "This is plain text US-ASCII";
          const mail = Mail.new();
          mail.setBody(body);
          mail.setContentDisposition('attachment; filename="foo.jpg"');
          expect(mail.toString()).toMatch("Content-Type: text/plain;\r\n");
        });

        it("should not set the charset if the content_type is not text", () => {
          const mail = Mail.new();
          mail.setBody(nonAscii);
          mail.setContentType("image/png");
          expect(mail.toString()).not.toMatch(/Content-Type: image\/png;\s+charset=UTF-8/);
        });

        it("should raise a warning if there is no content type and there is non ascii chars and default to text/plain, UTF-8", async () => {
          const mail = Mail.new();
          mail.setBody(nonAscii);
          mail.setContentTransferEncoding("8bit");

          let result: string | null = null;
          await expect(() => {
            result = mail.toString();
          }).toOutput(defaultingWarning, "stderr");
          expect(result).toMatch(/|Content-Type: text\/plain; charset=UTF-8|/);
        });

        it("should raise a warning if there is no charset parameter and there is non ascii chars and default to text/plain, UTF-8", async () => {
          const mail = Mail.new();
          mail.setBody(nonAscii);
          mail.setContentType("text/plain");
          mail.setContentTransferEncoding("8bit");

          let result: string | null = null;
          await expect(() => {
            result = mail.toString();
          }).toOutput(defaultingWarning, "stderr");
          expect(result).toMatch(/|Content-Type: text\/plain; charset=UTF-8|/);
        });

        it("should not raise a warning if there is no charset parameter and the content-type is not text", async () => {
          const mail = Mail.new();
          mail.setBody(nonAscii);
          mail.setContentType("image/png");
          mail.setContentTransferEncoding("8bit");
          await expect(() => mail.toString()).not.toOutput(undefined, "stderr");
        });

        it("should not raise a warning if there is a charset defined and there is non ascii chars", async () => {
          const mail = Mail.new();
          mail.setBody(nonAscii);
          mail.setContentTransferEncoding("8bit");
          mail.setContentType("text/plain; charset=UTF-8");
          await expect(() => mail.toString()).not.toOutput(undefined, "stderr");
        });

        it("should be able to set a content type with an array and hash", () => {
          const mail = Mail.new();
          mail.setContentType(["text", "plain", { charset: "US-ASCII" }]);
          expect((mail.get("content_type") as Field).encoded()).toBe(
            "Content-Type: text/plain;\r\n charset=US-ASCII\r\n",
          );
          expect(Object.fromEntries(mail.contentTypeParameters()!.entries())).toEqual({
            charset: "US-ASCII",
          });
        });

        it("should be able to set a content type with an array and hash with a non-usascii field", () => {
          const mail = Mail.new();
          mail.setContentType(["text", "plain", { charset: "UTF-8" }]);
          expect((mail.get("content_type") as Field).encoded()).toBe(
            "Content-Type: text/plain;\r\n charset=UTF-8\r\n",
          );
          expect(Object.fromEntries(mail.contentTypeParameters()!.entries())).toEqual({
            charset: "UTF-8",
          });
        });

        it("should allow us to specify a content type in a block", () => {
          const mail = Mail.new(function (this: Message) {
            this.contentType(["text", "plain", { charset: "UTF-8" }]);
          });
          expect(Object.fromEntries(mail.contentTypeParameters()!.entries())).toEqual({
            charset: "UTF-8",
          });
        });
      });

      it("rfc2046 can be decoded", () => {
        const mail = Mail.new();
        const part = new Part();
        part.setContentDisposition('attachment; filename="test.eml"');
        part.setContentType("message/rfc822");
        part.setBody(nonAscii.repeat(30));
        mail.body().push(part);

        const roundtripped = Mail.new(mail.encoded());
        expect(roundtripped.contentTransferEncoding()).toBe("7bit");
        expect((roundtripped.parts.at(-1) as Part).contentTransferEncoding()).toBe("");

        expect(roundtripped.encoded()).toContain("NOT plain");
        expect(roundtripped.contentTransferEncoding()).toBe("7bit");
        expect((roundtripped.parts.at(-1) as Part).contentTransferEncoding()).toBe("");
      });

      it("rfc2046", () => {
        const mail = Mail.new();
        const part = new Part();
        part.setContentDisposition('attachment; filename="test.eml"');
        part.setContentType("message/rfc822");
        part.setBody("a".repeat(999));
        mail.body().push(part);
        mail.encoded();

        expect(mail.parts.length).toBe(1);
        expect((mail.parts.at(-1) as Part).contentTransferEncoding()).toMatch(/7bit|8bit|binary/);
      });

      describe("charset", () => {
        it("should return a default value for multipart mails", () => {
          const mail = Mail.new();
          mail.addPart(new Part({ body: "PLAIN TEXT", contentType: "text/plain" }));
          expect(mail.charset).toBe("UTF-8");
        });
      });

      describe("charset=", () => {
        let mail: Message;
        beforeEach(() => {
          mail = Mail.new(function (this: Message) {
            this.to("mikel@test.lindsaar.net");
            this.from("bob@test.lindsaar.net");
            this.subject("Multipart email");
            this.textPart(function (this: Message) {
              this.body("This is plain text");
            });
            this.htmlPart(function (this: Message) {
              this.contentType("text/html; charset=UTF-8");
              this.body("<h1>This is HTML</h1>");
            });
          });
        });

        it("should not add an empty charset header", () => {
          mail.charset = null;

          expect(mail.isMultipart()).toBe(true);
          expect(mail.parts.length).toBe(2);
          expect((mail.encoded() as string).match(/charset=UTF-8/g)?.length ?? 0).toBe(2);
        });

        it("should remove the charset header", () => {
          mail.charset = "iso-8859-1";
          mail.charset = null;

          expect((mail.encoded() as string).match(/charset=UTF-8/g)?.length ?? 0).toBe(2);
          expect((mail.encoded() as string).match(/charset=iso-8859-1/g)?.length ?? 0).toBe(0);
        });
      });

      describe("convert_to_multipart", () => {
        let subject: Message;
        beforeEach(async () => {
          subject = await readFixture("emails", "attachment_emails", "attachment_only_email.eml");
          subject.convertToMultipart();
        });

        it("original content headers move to the new part", () => {
          expect(subject.header().get("content_type")).toBeNull();
          expect(subject.header().get("content_disposition")).toBeNull();
          expect(subject.header().get("content_description")).toBeNull();
          expect(subject.header().get("content_transfer_encoding")).toBeNull();

          const header = subject.parts[0].header();
          expect((header.get("content_type") as Field).value).toBe(
            "application/x-gzip; NAME=blah.gz",
          );
          expect((header.get("content_disposition") as Field).value).toBe(
            "attachment; filename=blah.gz",
          );
          expect((header.get("content_description") as Field).value).toBe(
            "Attachment has identical content to above foo.gz",
          );
          expect((header.get("content_transfer_encoding") as Field).value).toBe("base64");
        });
      });

      describe("content-transfer-encoding", () => {
        it("should use 7bit for only US-ASCII chars", () => {
          const body = "This is plain text US-ASCII";
          const mail = Mail.new();
          mail.setBody(body);
          expect(mail.toString()).toMatch(/Content-Transfer-Encoding: 7bit/);
        });

        it("should use QP transfer encoding for 7bit text with lines longer than 998 octets", () => {
          const body = "a".repeat(999);
          const mail = Mail.new();
          mail.charset = "UTF-8";
          mail.setBody(body);
          expect(mail.toString()).toMatch(/Content-Transfer-Encoding: quoted-printable/);
        });

        it("should use QP transfer encoding for 8bit text with only a few 8bit characters", () => {
          const body = "Maxfeldstraße 5, 90409 Nürnberg";
          const mail = Mail.new();
          mail.charset = "UTF-8";
          mail.setBody(body);
          expect(mail.toString()).toMatch(/Content-Transfer-Encoding: quoted-printable/);
        });

        it("should use QP transfer encoding for 8bit text attachment with only a few 8bit characters", async () => {
          const mail = Mail.new();
          const fileContent = new Uint8Array([0x50, 0x6f, 0x6b, 0xe9, 0x6d, 0x6f, 0x6e]);
          await mail.attachments().set("iso_text.txt", fileContent);
          mail.setBody("This is plain text US-ASCII");
          expect(mail.toString()).toMatch(
            /Content-Transfer-Encoding: 7bit.*This is plain text US-ASCII.*Content-Transfer-Encoding: quoted-printable.*Pok=E9mon/s,
          );
        });

        it("should use base64 transfer encoding for 8-bit text with lots of 8bit characters", () => {
          const mail = Mail.new();
          mail.charset = "UTF-8";
          mail.setBody(nonAscii);
          mail.setContentType("text/plain; charset=utf-8");
          expect(mail.hasContentType()).toBeTruthy();
          expect(mail.hasCharset()).toBeTruthy();
          expect(mail.toString()).toMatch(/Content-Transfer-Encoding: base64/);
        });

        it("should use 8bit transfer encoding when 8bit is forced", () => {
          const mail = Mail.new();
          mail.charset = "UTF-8";
          mail.setBody(nonAscii);
          mail.setContentType("text/plain; charset=utf-8");
          mail.setTransportEncoding("8bit");
          expect(mail.toString()).toMatch(/Content-Transfer-Encoding: 8bit/);
        });
      });
    });
  });
  describe("helper methods", () => {
    it("should implement the spaceship operator on the date field", () => {
      const now = new Date();
      const mail1 = Mail.new(function (this: Message) {
        this.date(now);
      });
      const mail2 = Mail.new(function (this: Message) {
        this.date(new Date(now.getTime() - 10_000));
      });
      expect(sort([mail2, mail1])).toEqual([mail2, mail1]);
    });
    describe("==", () => {
      it("should be implemented", () => {
        expect(() => Mail.new().equals(Mail.new())).not.toThrow();
      });

      it("should ignore the message id value if both have a nil message id", () => {
        const m1 = Mail.new("To: mikel@test.lindsaar.net\r\nSubject: Yo!\r\n\r\nHello there");
        const m2 = Mail.new("To: mikel@test.lindsaar.net\r\nSubject: Yo!\r\n\r\nHello there");
        expect(m1).toEqualRuby(m2);
        expect(m1.get("message_id")).toBeNull();
        expect(m2.get("message_id")).toBeNull();
      });

      it("should ignore the message id value if self has a nil message id", () => {
        const m1 = Mail.new("To: mikel@test.lindsaar.net\r\nSubject: Yo!\r\n\r\nHello there");
        const m2 = Mail.new(
          "To: mikel@test.lindsaar.net\r\nMessage-ID: <1234@test.lindsaar.net>\r\nSubject: Yo!\r\n\r\nHello there",
        );

        expect(m1.get("message_id")).toBeNull();
        expect((m2.get("message_id") as Field).value).toBe("<1234@test.lindsaar.net>");

        expect(m1).toEqualRuby(m2);
      });

      it("should ignore the message id value if other has a nil message id", () => {
        const m1 = Mail.new(
          "To: mikel@test.lindsaar.net\r\nMessage-ID: <1234@test.lindsaar.net>\r\nSubject: Yo!\r\n\r\nHello there",
        );
        const m2 = Mail.new("To: mikel@test.lindsaar.net\r\nSubject: Yo!\r\n\r\nHello there");

        expect((m1.get("message_id") as Field).value).toBe("<1234@test.lindsaar.net>");
        expect(m2.get("message_id")).toBeNull();

        expect(m1).toEqualRuby(m2);
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

    it("should provide a way to instantiate a new part as you go down", () => {
      const mail = Mail.new(function (this: Message) {
        this.to("mikel@test.lindsaar.net");
        this.subject("nested multipart");
        this.from("test@example.com");
        this.contentType("multipart/mixed");

        this.part(
          {
            contentType: "multipart/alternative",
            contentDisposition: "inline",
            headers: { foo: "bar" },
          },
          (p: Part) => {
            p.part({ contentType: "text/plain", body: "test text\nline #2" });
            p.part({ contentType: "text/html", body: "<b>test</b> HTML<br/>\nline #2" });
          },
        );
      });

      const first = mail.parts[0];
      expect(first.isMultipart()).toBeTruthy();
      expect(first.parts.length).toBe(2);
      expect((first.parts[0].get("content_type") as Field & { string(): string }).string()).toBe(
        "text/plain",
      );
      expect(first.parts[0].body().decoded()).toBe("test text\nline #2");
      expect((first.parts[1].get("content_type") as Field & { string(): string }).string()).toBe(
        "text/html",
      );
      expect(first.parts[1].body().decoded()).toBe("<b>test</b> HTML<br/>\nline #2");
    });
  });

  describe("deliver", () => {
    class DeliveryAgent {
      static deliverMail(_mail: Message, _block?: () => unknown): void {}
    }

    class ObserverAgent {
      static deliveredEmail(_mail: Message): void {}
    }

    class InterceptorAgent {
      static intercept = false;
      static setIntercept(val: boolean): void {
        InterceptorAgent.intercept = val;
      }
      static deliveringEmail(mail: Message): void {
        if (InterceptorAgent.intercept) {
          mail.setTo("bob@example.com");
        }
      }
    }

    afterEach(() => {
      vi.restoreAllMocks();
      Mail.unregisterObserver(ObserverAgent);
      Mail.unregisterInterceptor(InterceptorAgent);
    });

    it("should return self after delivery", async () => {
      const mail = Mail.new();
      mail.performDeliveries = false;
      expect(await mail.deliver()).toBe(mail);
    });

    it("should pass self to a delivery agent", async () => {
      const mail = Mail.new();
      mail.deliveryHandler = DeliveryAgent;
      const spy = vi.spyOn(DeliveryAgent, "deliverMail");
      await mail.deliver();
      expect(spy).toHaveBeenCalledWith(mail, expect.any(Function));
    });

    it("should inform observers that the mail was sent", async () => {
      const mail = Mail.new({ from: "bob@example.com", to: "bobette@example.com" });
      mail.deliveryMethod("test");
      Mail.registerObserver(ObserverAgent);
      const spy = vi.spyOn(ObserverAgent, "deliveredEmail");
      await mail.deliver();
      expect(spy).toHaveBeenCalledWith(mail);
    });

    it("should allow observers to be unregistered", async () => {
      const mail = Mail.new({ from: "bob@example.com", to: "bobette@example.com" });
      mail.deliveryMethod("test");
      Mail.registerObserver(ObserverAgent);
      Mail.unregisterObserver(ObserverAgent);
      const spy = vi.spyOn(ObserverAgent, "deliveredEmail");
      await mail.deliver();
      expect(spy).not.toHaveBeenCalledWith(mail);
    });

    it("should inform observers that the mail was sent, even if a delivery agent is used", async () => {
      const mail = Mail.new();
      mail.deliveryHandler = DeliveryAgent;
      Mail.registerObserver(ObserverAgent);
      const spy = vi.spyOn(ObserverAgent, "deliveredEmail");
      await mail.deliver();
      expect(spy).toHaveBeenCalledWith(mail);
    });

    it("should pass to the interceptor the email just before it gets sent", async () => {
      const mail = Mail.new({ from: "bob@example.com", to: "bobette@example.com" });
      mail.deliveryMethod("test");
      Mail.registerInterceptor(InterceptorAgent);
      const spy = vi.spyOn(InterceptorAgent, "deliveringEmail");
      InterceptorAgent.setIntercept(true);
      await mail.deliver();
      InterceptorAgent.setIntercept(false);
      expect(spy).toHaveBeenCalledWith(mail);
    });

    it("should let the interceptor that the mail was sent", async () => {
      const mail = Mail.new({ from: "bob@example.com", to: "bobette@example.com" });
      mail.setTo("fred@example.com");
      mail.deliveryMethod("test");
      Mail.registerInterceptor(InterceptorAgent);
      InterceptorAgent.setIntercept(true);
      await mail.deliver();
      InterceptorAgent.setIntercept(false);
      expect([...(mail.to() as string[])]).toEqual(["bob@example.com"]);
    });

    it("should allow interceptors to be unregistered", async () => {
      const mail = Mail.new({ from: "bob@example.com", to: "bobette@example.com" });
      mail.setTo("fred@example.com");
      mail.deliveryMethod("test");
      Mail.registerInterceptor(InterceptorAgent);
      InterceptorAgent.setIntercept(true);
      Mail.unregisterInterceptor(InterceptorAgent);
      await mail.deliver();
      InterceptorAgent.setIntercept(false);
      expect([...(mail.to() as string[])]).toEqual(["fred@example.com"]);
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

  describe("output", () => {
    it("should make an email and allow you to call :to_s on it to get a string", () => {
      const mail = Mail.new(function (this: Message) {
        this.from("mikel@test.lindsaar.net");
        this.to("you@test.lindsaar.net");
        this.subject("This is a test email");
        this.body("This is a body of the email");
      });

      expect(mail.toString()).toMatch(/From: mikel@test.lindsaar.net\r\n/);
      expect(mail.toString()).toMatch(/To: you@test.lindsaar.net\r\n/);
      expect(mail.toString()).toMatch(/Subject: This is a test email\r\n/);
      expect(mail.toString()).toMatch(/This is a body of the email/);
    });

    it("should raise an error and message if you try and call decoded on a multipart email", () => {
      const mail = Mail.new(function (this: Message) {
        this.to("mikel@test.lindsaar.net");
        this.from("bob@test.lindsaar.net");
        this.subject("Multipart email");
        this.textPart(function (this: Message) {
          this.body("This is plain text");
        });
        this.htmlPart(function (this: Message) {
          this.contentType("text/html; charset=UTF-8");
          this.body("<h1>This is HTML</h1>");
        });
      });
      expect(() => mail.decoded()).toThrow(
        new NoMethodError(
          "Can not decode an entire message, try calling #decoded on the various fields and body or parts if it is a multipart message.",
        ),
      );
    });

    it("should return the decoded body if you call decode and the message is not multipart", () => {
      const mail = Mail.new(function (this: Message) {
        this.contentTransferEncoding("base64");
        this.body("VGhlIGJvZHk=\n");
      });
      expect(mail.decoded()).toEqual(binaryBytes("The body"));
    });

    describe("decoding bodies", () => {
      it("should not change a body on decode if not given an encoding type to decode", () => {
        const mail = Mail.new(function (this: Message) {
          this.body("The=3Dbody");
        });
        expect(mail.body().decoded()).toBe("The=3Dbody");
        expect(mail.body().encoded()).toBe("The=3Dbody");
      });

      it("should change a body on decode if given an encoding type to decode", () => {
        const mail = Mail.new(function (this: Message) {
          this.contentTransferEncoding("quoted-printable");
          this.body("The=3Dbody");
        });
        expect(mail.body().decoded()).toEqual(binaryBytes("The=body"));
        expect(mail.body().encoded()).toBe("The=3Dbody=\r\n");
      });

      it("should change a body on decode if given an encoding type to decode", () => {
        const mail = Mail.new(function (this: Message) {
          this.contentTransferEncoding("base64");
          this.body("VGhlIGJvZHk=\n");
        });
        expect(mail.body().decoded()).toEqual(binaryBytes("The body"));
        expect(mail.body().encoded()).toBe("VGhlIGJvZHk=\r\n");
      });

      it("should not strip the raw mail source in case the trailing \\r\\n is meaningful", () => {
        expect(
          Mail.new(
            "Content-Transfer-Encoding: quoted-printable;\r\n\r\nfoo=\r\nbar=\r\nbaz=\r\n",
          ).decoded(),
        ).toEqual(binaryBytes("foobarbaz"));
      });
    });
  });

  describe("text messages", () => {
    function messageWithIso88591Charset() {
      return (
        "From: test@example.com\r\n" +
        "Content-Type: text/plain; charset=iso-8859-1\r\n" +
        "Content-Transfer-Encoding: quoted-printable\r\n" +
        "Date: Tue, 27 Sep 2011 16:59:48 +0100 (BST)\r\n" +
        "Subject: test\r\n\r\n" +
        "Am=E9rica"
      );
    }

    function withEncoder(encoder: typeof Utilities.charsetEncoder, block: () => void) {
      const old = Utilities.charsetEncoder;
      Utilities.charsetEncoder = encoder;
      try {
        block();
      } finally {
        Utilities.charsetEncoder = old;
      }
    }

    let message: Message;
    beforeEach(() => {
      message = Mail.new(messageWithIso88591Charset());
    });

    it("should be decoded using content type charset", () => {
      expect(message.decoded()).toBe("América");
    });

    it("should respond true to text?", () => {
      expect(message.isText()).toBe(true);
    });

    it("inspect_structure should return the same as inspect (no attachments)", () => {
      expect(message.inspectStructure()).toBe(message.inspect());
    });

    it("uses the Utilities charset encoder", () => {
      withEncoder(new Utilities.BestEffortCharsetEncoder(), () => {
        const message = Mail.new(
          "Content-Type: text/plain;\r\n charset=windows-1258\r\nContent-Transfer-Encoding: base64\r\n\r\nSGkglg==\r\n",
        );
        expect(message.decoded()).toBe("Hi –");
      });
    });
  });

  describe("ordering messages", () => {
    it("should put all attachments as the last item", async () => {
      const mail = Mail.new();
      await mail.attachments().set("image.png", new Uint8Array([0xc2, 0xc2, 0xc2, 0xc2]));
      const p = new Part({ contentType: "multipart/alternative" });
      p.addPart(new Part({ contentType: "text/html", body: "HTML TEXT" }));
      p.addPart(new Part({ contentType: "text/plain", body: "PLAIN TEXT" }));
      mail.addPart(p);
      mail.encoded();
      expect(mail.parts[0].mimeType()).toBe("multipart/alternative");
      expect(mail.parts[0].parts[0].mimeType()).toBe("text/plain");
      expect(mail.parts[0].parts[1].mimeType()).toBe("text/html");
      expect(mail.parts[1].mimeType()).toBe("image/png");
    });

    it("should allow overwriting sort order", async () => {
      const mail = Mail.new();
      mail.body().setSortOrder([]);
      await mail.attachments().set("image.png", new Uint8Array([0xc2, 0xc2, 0xc2, 0xc2]));
      const p = new Part({ contentType: "multipart/alternative" });
      p.addPart(new Part({ contentType: "text/plain", body: "PLAIN TEXT" }));
      p.addPart(new Part({ contentType: "text/html", body: "HTML TEXT" }));
      mail.addPart(p);
      mail.encoded();
      expect(mail.parts[0].mimeType()).toBe("multipart/alternative");
      expect(mail.parts[0].parts[0].mimeType()).toBe("text/plain");
      expect(mail.parts[0].parts[1].mimeType()).toBe("text/html");
      expect(mail.parts[1].mimeType()).toBe("image/png");
    });
  });

  describe("without_attachments!", () => {
    it("should delete all attachments", async () => {
      const emailsWithAttachments = [
        ["attachment_emails", "attachment_content_disposition.eml"],
        ["attachment_emails", "attachment_content_location.eml"],
        ["attachment_emails", "attachment_pdf.eml"],
        ["attachment_emails", "attachment_with_encoded_name.eml"],
        ["attachment_emails", "attachment_with_quoted_filename.eml"],
        ["mime_emails", "raw_email7.eml"],
      ];

      for (const fileName of emailsWithAttachments) {
        const mail = await readFixture("emails", ...fileName);
        const nonAttachmentParts = mail.allParts().filter((p) => !p.isAttachment());
        expect(mail.hasAttachments()).toBeTruthy();
        mail.withoutAttachmentsBang();

        expect(mail.allParts()).toEqualRuby(nonAttachmentParts);
        expect(mail.hasAttachments()).toBeFalsy();
      }
    });
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
    describe("to a basic message", () => {
      let mail: Message;
      beforeEach(async () => {
        mail = await readFixture("emails", "plain_emails", "basic_email.eml");
      });

      it("should create a new message", () => {
        expect(mail.reply()).toBeInstanceOf(Message);
      });

      it("should be in-reply-to the original message", () => {
        expect(mail.reply().inReplyTo()).toBe(
          "6B7EC235-5B17-4CA8-B2B8-39290DEB43A3@test.lindsaar.net",
        );
      });

      it("should reference the original message", () => {
        expect(mail.reply().references()).toBe(
          "6B7EC235-5B17-4CA8-B2B8-39290DEB43A3@test.lindsaar.net",
        );
      });

      it("should Re: the original subject", () => {
        expect(mail.reply().subject()).toBe("Re: Testing 123");
      });

      it("should be sent to the original sender", () => {
        expect([...(mail.reply().to() as string[])]).toEqual(["test@lindsaar.net"]);
        expect(String(mail.reply().get("to"))).toBe("Mikel Lindsaar <test@lindsaar.net>");
      });

      it("should be sent from the original recipient", () => {
        expect([...(mail.reply().from() as string[])]).toEqual(["raasdnil@gmail.com"]);
        expect(String(mail.reply().get("from"))).toBe("Mikel Lindsaar <raasdnil@gmail.com>");
      });

      it("should accept args", () => {
        expect([
          ...(mail.reply({ from: "Donald Ball <donald.ball@gmail.com>" }).from() as string[]),
        ]).toEqual(["donald.ball@gmail.com"]);
      });

      it("should accept a block", () => {
        expect([
          ...(mail
            .reply(function (this: Message) {
              this.from("Donald Ball <donald.ball@gmail.com>");
            })
            .from() as string[]),
        ]).toEqual(["donald.ball@gmail.com"]);
      });
    });

    describe("to a message with an explicit reply-to address", () => {
      let mail: Message;
      beforeEach(async () => {
        mail = await readFixture("emails", "rfc2822", "example06.eml");
      });

      it("should be sent to the reply-to address", () => {
        expect(String(mail.reply().get("to"))).toBe(
          '"Mary Smith: Personal Account" <smith@home.example>',
        );
      });
    });

    describe("to a message with more than one recipient", () => {
      let mail: Message;
      beforeEach(async () => {
        mail = await readFixture("emails", "rfc2822", "example03.eml");
      });

      it("should be sent from the first to address", () => {
        expect(String(mail.reply().get("from"))).toBe("Mary Smith <mary@x.test>");
      });
    });

    describe("to a reply", () => {
      let mail: Message;
      beforeEach(async () => {
        mail = await readFixture("emails", "plain_emails", "raw_email_reply.eml");
      });

      it("should be in-reply-to the original message", () => {
        expect(mail.reply().inReplyTo()).toBe("473FFE27.20003@xxx.org");
      });

      it("should append to the original's references list", () => {
        expect(
          (mail.reply().get("references") as Field & { messageIds(): string[] }).messageIds(),
        ).toEqual([
          "473FF3B8.9020707@xxx.org",
          "348F04F142D69C21-291E56D292BC@xxxx.net",
          "473FFE27.20003@xxx.org",
        ]);
      });

      it("should not append another Re:", () => {
        expect(mail.reply().subject()).toBe("Re: Test reply email");
      });
    });

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
