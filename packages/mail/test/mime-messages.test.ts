import type {} from "@blazetrails/vitest-matchers";
import {
  binaryString,
  Dir,
  File,
  Encoding,
  forceEncoding,
  IO,
  rbObjEncoding,
} from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import "../lib/index.js";
import { Mail } from "../lib/mail.js";
import type { Message } from "../lib/message.js";
import { Part } from "../lib/part.js";
import type { ContentTypeField } from "../lib/fields/content-type-field.js";

const fixturePath = (...path: string[]) =>
  decodeURIComponent(new URL(`./fixtures/${path.join("/")}`, import.meta.url).pathname);
const readFixture = (...path: string[]) => Mail.read(fixturePath(...path));
const readRawFixture = async (...path: string[]) => await IO.binreadAsync(fixturePath(...path));

const testAttachments = await Dir.globAsync(fixturePath("attachments", "test.*"));

describe("MIME Emails", () => {
  describe("general helper methods", () => {
    it("should read a mime version from an email", () => {
      const mail = Mail.new("Mime-Version: 1.0");
      expect(mail.mimeVersion()).toEqual("1.0");
    });

    it("should return nil if the email has no mime version", () => {
      const mail = Mail.new("To: bob");
      expect(mail.mimeVersion()).toBeNull();
    });

    it("should read the content-transfer-encoding", () => {
      const mail = Mail.new("Content-Transfer-Encoding: quoted-printable");
      expect(mail.contentTransferEncoding()).toEqual("quoted-printable");
    });

    it("should read the content-description", () => {
      const mail = Mail.new("Content-Description: This is a description");
      expect(mail.contentDescription()).toEqual("This is a description");
    });

    it("should return the content-type", () => {
      const mail = Mail.new("Content-Type: text/plain");
      expect(mail.mimeType()).toEqual("text/plain");
    });

    it("should return the charset", () => {
      const mail = Mail.new("Content-Type: text/plain; charset=utf-8");
      expect(mail.charset).toEqual("utf-8");
    });

    it("should allow you to set the charset", () => {
      const mail = Mail.new();
      mail.charset = "utf-8";
      expect(mail.charset).toEqual("utf-8");
    });

    it("should return the main content-type", () => {
      const mail = Mail.new("Content-Type: text/plain");
      expect(mail.mainType()).toEqual("text");
    });

    it("should return the sub content-type", () => {
      const mail = Mail.new("Content-Type: text/plain");
      expect(mail.subType()).toEqual("plain");
    });

    it("should return the content-type parameters", () => {
      const mail = Mail.new("Content-Type: text/plain; charset=US-ASCII; format=flowed");
      expect(Object.fromEntries(mail.contentTypeParameters()!.entries())).toEqual({
        charset: "US-ASCII",
        format: "flowed",
      });
    });

    describe("a multipart email (raw_email7.eml)", () => {
      const mail = () => readFixture("emails", "mime_emails", "raw_email7.eml");
      it("should recognize a multipart email", async () => {
        expect((await mail()).isMultipart()).toBeRubyTruthy();
      });

      it("inspect_structure should return what is expected", async () => {
        const m = await mail();
        expect(m.inspectStructure()).toEqual(
          [
            m.inspect(),
            `1. ${m.parts[0].inspect()}`,
            `1.1. ${m.parts[0].parts[0].inspect()}`,
            `1.2. ${m.parts[0].parts[1].inspect()}`,
            `1.3. ${m.parts[0].parts[2].inspect()}`,
            `1.4. ${m.parts[0].parts[3].inspect()}`,
            `2. ${m.parts[1].inspect()}`,
          ].join("\n"),
        );
      });
    });

    it("should recognize a non multipart email", async () => {
      const mail = await readFixture("emails", "plain_emails", "basic_email.eml");
      expect(mail.isMultipart()).toBeRubyFalsy();
    });

    it("should not report the email as :attachment?", async () => {
      const mail = await readFixture("emails", "attachment_emails", "attachment_pdf.eml");
      expect(mail.isAttachment()).toEqual(false);
    });

    describe("attachment_only_email.eml", () => {
      const mail = () => readFixture("emails", "attachment_emails", "attachment_only_email.eml");
      it("should report the email as :attachment?", async () => {
        expect((await mail()).isAttachment()).toEqual(true);
      });
      it("inspect_structure should return what is expected", async () => {
        const m = await mail();
        expect(m.inspectStructure()).toEqual(m.inspect());
      });
    });

    it("should recognize an attachment part", async () => {
      const mail = await readFixture("emails", "attachment_emails", "attachment_pdf.eml");
      expect(mail.isAttachment()).toBeRubyFalsy();
      expect(mail.parts[0].isAttachment()).toEqual(false);
      expect(mail.parts[1].isAttachment()).toEqual(true);
    });

    it("should give how may (top level) parts there are", async () => {
      const mail = await readFixture("emails", "mime_emails", "raw_email7.eml");
      expect(mail.parts.length).toEqual(2);
    });

    describe("a multipart/alternative mail (raw_email11.eml)", () => {
      const mail = () => readFixture("emails", "mime_emails", "raw_email11.eml");
      it("should give the content_type of each part", async () => {
        const m = await mail();
        expect(m.mimeType()).toEqual("multipart/alternative");
        expect(m.parts[0].mimeType()).toEqual("text/plain");
        expect(m.parts[1].mimeType()).toEqual("text/enriched");
      });
      it("inspect_structure should return what is expected", async () => {
        const m = await mail();
        expect(m.inspectStructure()).toEqual(
          [m.inspect(), `1. ${m.parts[0].inspect()}`, `2. ${m.parts[1].inspect()}`].join("\n"),
        );
      });
    });

    it("should report the mail :has_attachments?", async () => {
      const mail = await readFixture("emails", "attachment_emails", "attachment_pdf.eml");
      expect(mail.hasAttachments()).toBeRubyTruthy();
    });

    it("should only split on exact boundary matches", async () => {
      const mail = await readFixture("emails", "mime_emails", "email_with_similar_boundaries.eml");
      expect(mail.parts.length).toEqual(2);
      expect(mail.parts[0].parts.length).toEqual(2);
      expect(mail.boundary()).toEqual("----=_NextPart_476c4fde88e507bb8028170e8cf47c73");
      expect(mail.parts[0].boundary()).toEqual(
        "----=_NextPart_476c4fde88e507bb8028170e8cf47c73_alt",
      );
    });
  });

  describe("multipart emails", () => {
    it("should add a boundary if there is none defined and a part is added", () => {
      const mail = Mail.new(function (this: Message) {
        this.part("This is a part");
        this.part("This is another part");
      });
      expect(mail.boundary()).not.toBeNull();
    });

    it("should not add a boundary for a message that is only an attachment", async () => {
      const mail = Mail.new();
      await mail.attachments().set("test.png", "2938492384923849");
      expect(mail.boundary()).toBeNull();
    });
  });

  describe("multipart/alternative emails", () => {
    it("should know what its boundary is if it is a multipart document", () => {
      const mail = Mail.new('Content-Type: multipart/mixed; boundary="--==Boundary"');
      expect(mail.boundary()).toEqual("--==Boundary");
    });

    it("should return nil if there is no content-type defined", () => {
      const mail = Mail.new();
      expect(mail.boundary()).toBeNull();
    });

    it("should assign the text part and allow you to reference", () => {
      const mail = Mail.new();
      const textMail = Mail.new("This is Text");
      mail.setTextPart(textMail);
      expect(mail.textPart()).toBe(textMail);
    });

    it("should convert strings assigned to the text part into Mail::Part objects with sensible defaults", () => {
      const mail = Mail.new();
      mail.setTextPart("This is text");
      const textPart = mail.textPart() as Message;
      expect(textPart.body().decoded()).toEqual("This is text");
      expect(textPart.contentType()).toEqual("text/plain");
    });

    it("should not assign a nil text part", () => {
      const mail = Mail.new();
      mail.setTextPart(null);
      expect(mail.textPart()).toBeNull();
    });

    it("should assign the html part and allow you to reference", () => {
      const mail = Mail.new();
      const htmlMail = Mail.new("<b>This is HTML</b>");
      mail.setHtmlPart(htmlMail);
      expect(mail.htmlPart()).toBe(htmlMail);
    });

    it("should convert strings assigned to the html part into Mail::Part objects with sensible defaults", () => {
      const mail = Mail.new();
      mail.setHtmlPart("<b>This is HTML</b>");
      const htmlPart = mail.htmlPart() as Message;
      expect(htmlPart.body().decoded()).toEqual("<b>This is HTML</b>");
      expect(htmlPart.contentType()).toEqual("text/html");
    });

    it("should not assign a nil html part", () => {
      const mail = Mail.new();
      mail.setHtmlPart(null);
      expect(mail.htmlPart()).toBeNull();
    });

    it("should set default content type on assigned text and html parts", () => {
      const mail = Mail.new();
      mail.setTextPart(Mail.new());
      expect((mail.textPart() as Message).contentType()).toEqual("text/plain");
      mail.setHtmlPart(Mail.new());
      expect((mail.htmlPart() as Message).contentType()).toEqual("text/html");
    });

    it("should set default content type on declared text and html parts", () => {
      const mail = Mail.new();
      mail.textPart(() => {});
      expect((mail.textPart() as Message).contentType()).toEqual("text/plain");
      mail.htmlPart(() => {});
      expect((mail.htmlPart() as Message).contentType()).toEqual("text/html");
    });

    it("should not override content type", () => {
      const mail = Mail.new();
      mail.textPart(function (this: Message) {
        this.contentType("text/plain+foo");
      });
      expect((mail.textPart() as Message).contentType()).toEqual("text/plain+foo");
      mail.htmlPart(function (this: Message) {
        this.contentType("text/html+foo");
      });
      expect((mail.htmlPart() as Message).contentType()).toEqual("text/html+foo");
    });

    it("should add the html part and text part", () => {
      const mail = Mail.new();
      mail.setTextPart(
        new Mail.Part(function (this: Part) {
          this.body("This is Text");
        }),
      );
      mail.setHtmlPart(
        new Mail.Part(function (this: Part) {
          this.contentType("text/html; charset=US-ASCII");
          this.body("<b>This is HTML</b>");
        }),
      );
      expect(mail.parts.length).toEqual(2);
      expect(mail.parts[0].constructor).toBe(Part);
      expect(mail.parts.at(-1)!.constructor).toBe(Part);
    });

    it("should remove the html part and back out of multipart/alternative if set to nil", () => {
      const mail = Mail.new();
      mail.setTextPart(new Mail.Part());
      mail.setHtmlPart(new Mail.Part());
      expect(mail.parts.length).toEqual(2);

      mail.setHtmlPart(null);
      expect(mail.parts.length).toEqual(1);
      expect(mail.boundary()).toBeNull();
      expect(mail.contentType()).toBeNull();
    });

    it("should remove the text part and back out of multipart/alternative if set to nil", () => {
      const mail = Mail.new();
      mail.setTextPart(new Mail.Part());
      mail.setHtmlPart(new Mail.Part());
      expect(mail.parts.length).toEqual(2);

      mail.setTextPart(null);
      expect(mail.parts.length).toEqual(1);
      expect(mail.boundary()).toBeNull();
      expect(mail.contentType()).toBeNull();
    });

    it("should set the content type to multipart/alternative if you assign html and text parts", () => {
      const mail = Mail.new();
      mail.setTextPart(
        new Mail.Part(function (this: Part) {
          this.body("This is Text");
        }),
      );
      mail.setHtmlPart(
        new Mail.Part(function (this: Part) {
          this.contentType("text/html; charset=US-ASCII");
          this.body("<b>This is HTML</b>");
        }),
      );
      expect(mail.toString()).toMatch(
        new RegExp(`Content-Type: multipart/alternative;\\s+boundary="${mail.boundary()}"`),
      );
    });

    it("should set the content type to multipart/alternative if you declare html and text parts", () => {
      const mail = Mail.new();
      mail.textPart(() => {});
      mail.htmlPart(() => {});
      expect(mail.toString()).toMatch(
        new RegExp(`Content-Type: multipart/alternative;\\s+boundary="${mail.boundary()}"`),
      );
    });

    it("should not set the content type to multipart/alternative if you declare an html part but not a text part", () => {
      const mail = Mail.new();
      mail.htmlPart(() => {});
      expect(mail.toString()).not.toMatch(
        new RegExp(`Content-Type: multipart/alternative;\\s+boundary="${mail.boundary()}"`),
      );
    });

    it("should not set the content type to multipart/alternative if you declare a text part but not an html part", () => {
      const mail = Mail.new();
      mail.textPart(() => {});
      expect(mail.toString()).not.toMatch(
        new RegExp(`Content-Type: multipart/alternative;\\s+boundary="${mail.boundary()}"`),
      );
    });

    it("should add the end boundary tag", () => {
      const mail = Mail.new();
      mail.setTextPart(
        new Mail.Part(function (this: Part) {
          this.body("This is Text");
        }),
      );
      mail.setHtmlPart(
        new Mail.Part(function (this: Part) {
          this.contentType("text/html; charset=US-ASCII");
          this.body("<b>This is HTML</b>");
        }),
      );
      expect(mail.toString()).toMatch(new RegExp(`${mail.boundary()}--`));
    });

    it("should not put message-ids into parts", () => {
      const mail = Mail.new("Subject: FooBar");
      mail.setTextPart(
        new Mail.Part(function (this: Part) {
          this.body("This is Text");
        }),
      );
      mail.setHtmlPart(
        new Mail.Part(function (this: Part) {
          this.contentType("text/html; charset=US-ASCII");
          this.body("<b>This is HTML</b>");
        }),
      );
      mail.toString();
      expect(mail.parts[0].messageId()).toBeNull();
      expect(mail.parts.at(-1)!.messageId()).toBeNull();
    });

    it("should create a multipart/alternative email through a block", () => {
      const mail = Mail.new(function (this: Message) {
        this.to("nicolas.fouche@gmail.com");
        this.from("Mikel Lindsaar <raasdnil@gmail.com>");
        this.subject("First multipart email sent with Mail");
        this.textPart(function (this: Message) {
          this.body("This is plain text");
        });
        this.htmlPart(function (this: Message) {
          this.contentType("text/html; charset=UTF-8");
          this.body("<h1>This is HTML</h1>");
        });
      });
      expect(mail.isMultipart()).toBeRubyTruthy();
      expect(mail.parts.length).toEqual(2);
      const textPart = mail.textPart() as Message;
      const htmlPart = mail.htmlPart() as Message;
      expect(textPart.constructor).toBe(Part);
      expect(textPart.body().toString()).toEqual("This is plain text");
      expect(htmlPart.constructor).toBe(Part);
      expect(htmlPart.body().toString()).toEqual("<h1>This is HTML</h1>");
    });

    it("should detect an html_part in an existing email", () => {
      const m = Mail.new({ contentType: "multipart/alternative" });
      m.addPart(new Mail.Part({ contentType: "text/html", body: "HTML TEXT" }));
      m.addPart(new Mail.Part({ contentType: "text/plain", body: "PLAIN TEXT" }));
      expect((m.textPart() as Message).body().decoded()).toEqual("PLAIN TEXT");
      expect((m.htmlPart() as Message).body().decoded()).toEqual("HTML TEXT");
    });

    it("should detect a text_part in an existing email with plain text attachment", async () => {
      const m = Mail.new({ contentType: "multipart/alternative" });
      await m.addFile(fixturePath("attachments", "てすと.txt"));
      m.addPart(new Mail.Part({ contentType: "text/html", body: "HTML TEXT" }));
      m.addPart(new Mail.Part({ contentType: "text/plain", body: "PLAIN TEXT" }));
      expect((m.textPart() as Message).body().decoded()).toEqual("PLAIN TEXT");
      expect((m.htmlPart() as Message).body().decoded()).toEqual("HTML TEXT");
    });

    it("should detect an html_part in a multi level mime email", () => {
      const m = Mail.new({ contentType: "multipart/mixed" });
      const a = new Mail.Part({ contentType: "text/script", body: "12345" });
      const p = new Mail.Part({ contentType: "multipart/alternative" });
      p.addPart(new Mail.Part({ contentType: "text/html", body: "HTML TEXT" }));
      p.addPart(new Mail.Part({ contentType: "text/plain", body: "PLAIN TEXT" }));
      m.addPart(p);
      m.addPart(a);
      expect((m.textPart() as Message).body().decoded()).toEqual("PLAIN TEXT");
      expect((m.htmlPart() as Message).body().decoded()).toEqual("HTML TEXT");
    });

    it("should only the first part on a stupidly overly complex email", () => {
      const m = Mail.new({ contentType: "multipart/mixed" });
      const a = new Mail.Part({ contentType: "text/script", body: "12345" });
      m.addPart(a);

      const b = new Mail.Part({ contentType: "multipart/alternative" });
      b.addPart(new Mail.Part({ contentType: "text/html", body: "HTML TEXT" }));
      b.addPart(new Mail.Part({ contentType: "text/plain", body: "PLAIN TEXT" }));
      m.addPart(b);

      const c = new Mail.Part({ contentType: "multipart/alternative" });
      c.addPart(new Mail.Part({ contentType: "text/html", body: "HTML 2 TEXT" }));
      c.addPart(new Mail.Part({ contentType: "text/plain", body: "PLAIN 2 TEXT" }));
      b.addPart(c);

      const d = new Mail.Part({ contentType: "multipart/alternative" });
      d.addPart(new Mail.Part({ contentType: "text/html", body: "HTML 3 TEXT" }));
      d.addPart(new Mail.Part({ contentType: "text/plain", body: "PLAIN 3 TEXT" }));
      b.addPart(d);

      expect((m.textPart() as Message).body().decoded()).toEqual("PLAIN TEXT");
      expect((m.htmlPart() as Message).body().decoded()).toEqual("HTML TEXT");
    });
  });

  describe("finding attachments", () => {
    it("should return an array of attachments", async () => {
      const mail = await readFixture(
        "emails",
        "attachment_emails",
        "attachment_content_disposition.eml",
      );
      expect(mail.attachments().length).toEqual(1);
      expect(mail.attachments()[0].filename()).toEqual("api.rb");
    });

    it("should return an array of attachments", async () => {
      const mail = await readFixture(
        "emails",
        "mime_emails",
        "raw_email_with_nested_attachment.eml",
      );
      expect(mail.attachments().length).toEqual(2);
      expect(mail.attachments()[0].filename()).toEqual("truncated.png");
      expect(mail.attachments()[1].filename()).toEqual("smime.p7s");
    });

    for (const testAttachment of testAttachments) {
      it(`should find binary encoded attachments of type ${File.extname(testAttachment)}`, async () => {
        const raw = await readRawFixture(
          "emails",
          "mime_emails",
          "raw_email_with_binary_encoded.eml",
        );
        const marker = binaryString(raw).indexOf("BINARY_CONTENT_GOES_HERE");
        const [pre, post] = [
          raw.subarray(0, marker),
          raw.subarray(marker + "BINARY_CONTENT_GOES_HERE".length),
        ];
        const rawFile = await IO.binreadAsync(testAttachment);

        const rawMail = forceEncoding(
          new Uint8Array([...pre, ...rawFile, ...post]),
          Encoding.ASCII_8BIT,
        );
        expect(rbObjEncoding(rawMail)).toEqual(Encoding.ASCII_8BIT);

        const mail = Mail.new(rawMail);

        expect(mail.attachments().length).toEqual(1);
        const decoded = mail.attachments()[0].decoded() as Uint8Array;
        expect(decoded.length).toEqual(rawFile.length);
        expect(decoded).toEqual(rawFile);
      });
    }
  });

  describe("adding a file attachment", () => {
    it("should set to multipart/mixed if a text part and you add an attachment", async () => {
      const mail = Mail.new();
      mail.textPart(function (this: Message) {
        this.body("log message goes here");
      });
      await mail.addFile(fixturePath("attachments", "test.png"));
      expect(mail.mimeType()).toEqual("multipart/mixed");
    });

    it("should set to multipart/mixed if you add an attachment and then a text part", async () => {
      const mail = Mail.new();
      await mail.addFile(fixturePath("attachments", "test.png"));
      mail.textPart(function (this: Message) {
        this.body("log message goes here");
      });
      expect(mail.mimeType()).toEqual("multipart/mixed");
    });

    it("should add a part given a filename", async () => {
      const mail = Mail.new();
      await mail.addFile(fixturePath("attachments", "test.png"));
      expect(mail.parts.length).toEqual(1);
    });

    it("should give the part the right content type", async () => {
      const mail = Mail.new();
      await mail.addFile(fixturePath("attachments", "test.png"));
      expect(
        (mail.parts[0].get("content_type") as unknown as ContentTypeField).contentType(),
      ).toEqual("image/png");
    });

    it("should return attachment objects", async () => {
      const mail = Mail.new();
      await mail.addFile(fixturePath("attachments", "test.png"));
      expect(mail.attachments()[0].constructor).toBe(Part);
    });

    it("should be return an aray of attachments", async () => {
      const mail = Mail.new(function (this: Message) {
        this.from("mikel@from.lindsaar.net");
        this.subject("Hello there Mikel");
        this.to("mikel@to.lindsaar.net");
      });
      await mail.addFile(fixturePath("attachments", "test.png"));
      await mail.addFile(fixturePath("attachments", "test.jpg"));
      await mail.addFile(fixturePath("attachments", "test.pdf"));
      await mail.addFile(fixturePath("attachments", "test.zip"));
      expect(mail.attachments().length).toEqual(4);
      for (const a of mail.attachments()) expect(a.constructor).toBe(Part);
    });

    it("should return the filename of each attachment", async () => {
      const mail = Mail.new(function (this: Message) {
        this.from("mikel@from.lindsaar.net");
        this.subject("Hello there Mikel");
        this.to("mikel@to.lindsaar.net");
      });
      await mail.addFile(fixturePath("attachments", "test.png"));
      await mail.addFile(fixturePath("attachments", "test.jpg"));
      await mail.addFile(fixturePath("attachments", "test.pdf"));
      await mail.addFile(fixturePath("attachments", "test.zip"));
      expect(mail.attachments()[0].filename()).toEqual("test.png");
      expect(mail.attachments()[1].filename()).toEqual("test.jpg");
      expect(mail.attachments()[2].filename()).toEqual("test.pdf");
      expect(mail.attachments()[3].filename()).toEqual("test.zip");
    });

    it("should return the type/subtype of each attachment", async () => {
      const mail = Mail.new(function (this: Message) {
        this.from("mikel@from.lindsaar.net");
        this.subject("Hello there Mikel");
        this.to("mikel@to.lindsaar.net");
      });
      await mail.addFile(fixturePath("attachments", "test.png"));
      await mail.addFile(fixturePath("attachments", "test.jpg"));
      await mail.addFile(fixturePath("attachments", "test.pdf"));
      await mail.addFile(fixturePath("attachments", "test.zip"));
      expect(mail.attachments()[0].mimeType()).toEqual("image/png");
      expect(mail.attachments()[1].mimeType()).toEqual("image/jpeg");
      expect(mail.attachments()[2].mimeType()).toEqual("application/pdf");
      expect(mail.attachments()[3].mimeType()).toEqual("application/zip");
    });

    it("should return the content of each attachment", async () => {
      const mail = Mail.new(function (this: Message) {
        this.from("mikel@from.lindsaar.net");
        this.subject("Hello there Mikel");
        this.to("mikel@to.lindsaar.net");
      });
      await mail.addFile(fixturePath("attachments", "test.png"));
      await mail.addFile(fixturePath("attachments", "test.jpg"));
      await mail.addFile(fixturePath("attachments", "test.pdf"));
      await mail.addFile(fixturePath("attachments", "test.zip"));

      let tripped = mail.attachments()[0].decoded();
      let original = await readRawFixture("attachments", "test.png");
      expect(tripped).toEqual(original);
      tripped = mail.attachments()[1].decoded();
      original = await readRawFixture("attachments", "test.jpg");
      expect(tripped).toEqual(original);
      tripped = mail.attachments()[2].decoded();
      original = await readRawFixture("attachments", "test.pdf");
      expect(tripped).toEqual(original);
      tripped = mail.attachments()[3].decoded();
      original = await readRawFixture("attachments", "test.zip");
      expect(tripped).toEqual(original);
    });

    it("should allow you to send in file data instead of having to read it", async () => {
      const fileData = await readRawFixture("attachments", "test.png");
      const mail = Mail.new(function (this: Message) {
        this.from("mikel@from.lindsaar.net");
        this.subject("Hello there Mikel");
        this.to("mikel@to.lindsaar.net");
      });
      await mail.addFile({ filename: "test.png", content: fileData });

      const tripped = mail.attachments()[0].decoded();
      const original = await readRawFixture("attachments", "test.png");
      expect(tripped).toEqual(original);
    });

    it("should support :mime_type option", async () => {
      const mail = Mail.new();
      await mail.addFile({ filename: "test.png", content: "a", mimeType: "text/plain" });
      expect(mail.attachments()[0].contentType()).toEqual("text/plain");
    });

    it("should be able to add a body before adding a file", async () => {
      const m = Mail.new(function (this: Message) {
        this.from("mikel@from.lindsaar.net");
        this.subject("Hello there Mikel");
        this.to("mikel@to.lindsaar.net");
        this.body("Attached");
      });
      await m.addFile(fixturePath("attachments", "test.png"));
      expect(m.attachments().length).toEqual(1);
      expect(m.parts.length).toEqual(2);
      expect(m.parts[0].body().decoded()).toEqual("Attached");
      expect(m.parts[1].filename()).toEqual("test.png");
    });

    it("should allow you to add a body as text part if you have added a file", async () => {
      const m = Mail.new(function (this: Message) {
        this.from("mikel@from.lindsaar.net");
        this.subject("Hello there Mikel");
        this.to("mikel@to.lindsaar.net");
      });
      await m.addFile(fixturePath("attachments", "test.png"));
      m.body("Attached");
      expect(m.parts.length).toEqual(2);
      expect((m.parts[0].get("content_type") as unknown as ContentTypeField).contentType()).toEqual(
        "image/png",
      );
      expect(
        (m.parts.at(-1)!.get("content_type") as unknown as ContentTypeField).contentType(),
      ).toEqual("text/plain");
    });

    it("should allow you to add a body as text part if you have added a file and not truncate after newlines - issue 208", async () => {
      const m = Mail.new(function (this: Message) {
        this.from("mikel@from.lindsaar.net");
        this.subject("Hello there Mikel");
        this.to("mikel@to.lindsaar.net");
      });
      await m.addFile(fixturePath("attachments", "test.png"));
      m.body("First Line\n\nSecond Line\n\nThird Line\n\n");
      expect(m.parts.length).toEqual(2);
      expect((m.parts[0].get("content_type") as unknown as ContentTypeField).contentType()).toEqual(
        "image/png",
      );
      expect(
        (m.parts.at(-1)!.get("content_type") as unknown as ContentTypeField).contentType(),
      ).toEqual("text/plain");
      expect(m.parts.at(-1)!.toString()).toMatch(
        /^First Line\r\n\r\nSecond Line\r\n\r\nThird Line/m,
      );
    });

    it("should not raise a warning if there is a charset defined and there are non ascii chars in the body", async () => {
      const body = "This is NOT plain text ASCII　− かきくけこ";
      const mail = Mail.new();
      mail.setBody(body);
      mail.charset = "UTF-8";
      await mail.addFile(fixturePath("attachments", "test.png"));
      await expect(() => mail.toString()).not.toOutput(undefined, "stderr");
    });
  });
});
