import { Encoding, IO, rbObjEncoding, regexpEscape } from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";
import { Encodings } from "./encodings.js";
import { Base64 } from "./encodings/base64.js";
import { ContentIdField } from "./fields/content-id-field.js";
import "./index.js";
import { Mail } from "./mail.js";
import type { Message } from "./message.js";
import { Utilities } from "./utilities.js";

const fixturePath = (...path: string[]) =>
  new URL(`./fixtures/${path.join("/")}`, import.meta.url).pathname;
const readRawFixture = async (...path: string[]) =>
  (await IO.binreadAsync(decodeURIComponent(fixturePath(...path))))!;
const readFixture = (...path: string[]) => Mail.read(decodeURIComponent(fixturePath(...path)));

function encodeBase64(str: unknown) {
  return Base64.encode(str as string);
}

function checkDecoded(actual: unknown, expected: string | Uint8Array) {
  expect(rbObjEncoding(actual as Uint8Array)).toEqual(Encoding.BINARY);
  expect(actual).toEqual(
    typeof expected === "string" ? new TextEncoder().encode(expected) : expected,
  );
}

describe("Attachments", () => {
  let mail: Message;
  let testPng: Uint8Array;

  beforeEach(async () => {
    mail = Mail.new();
    testPng = await readRawFixture("attachments", "test.png");
  });

  describe("from direct content", () => {
    it("should work", async () => {
      await mail.attachments().set("test.png", testPng);
      expect(mail.attachments().get("test.png")!.filename()).toEqual("test.png");
      checkDecoded(mail.attachments().get(0)!.decoded(), testPng);
    });

    it("should work out magically the mime_type", async () => {
      await mail.attachments().set("test.png", testPng);
      expect(mail.attachments().get(0)!.mimeType()).toEqual("image/png");
    });

    it("should assign the filename", async () => {
      await mail.attachments().set("test.png", testPng);
      expect(mail.attachments().get(0)!.filename()).toEqual("test.png");
    });

    it("should assign mime-encoded multibyte filename", async () => {
      await mail.attachments().set("てすと.txt", await readRawFixture("attachments", "tesuto.txt"));
      expect(Utilities.isBlank(mail.attachments())).not.toEqual(true);
      expect(
        Encodings.decodeEncode(mail.attachments().get(0)!.filename() as string, "decode"),
      ).toEqual("てすと.txt");
    });
  });

  describe("from a supplied Hash", () => {
    it("should work", async () => {
      await mail.attachments().set("test.png", { content: testPng });
      expect(mail.attachments().get(0)!.filename()).toEqual("test.png");
      checkDecoded(mail.attachments().get(0)!.decoded(), testPng);
    });

    it("should allow you to override the content_type", async () => {
      await mail
        .attachments()
        .set("test.png", { content: testPng, contentType: "application/x-gzip" });
      expect(mail.attachments().get(0)!.contentType()).toEqual("application/x-gzip");
    });

    it("should allow you to override the mime_type", async () => {
      await mail
        .attachments()
        .set("test.png", { content: testPng, mimeType: "application/x-gzip" });
      expect(mail.attachments().get(0)!.mimeType()).toEqual("application/x-gzip");
    });

    it("should allow you to override the mime_type", async () => {
      await mail.attachments().set("invoice.jpg", {
        data: "you smiling",
        mimeType: "image/x-jpg",
        transferEncoding: "base64",
      });
      expect(mail.attachments().get(0)!.mimeType()).toEqual("image/x-jpg");
    });
  });

  describe("decoding and encoding", () => {
    it("should set its content_transfer_encoding", async () => {
      await mail.attachments().set("test.png", { content: testPng });
      mail.readyToSendBang();
      expect(mail.attachments().get(0)!.contentTransferEncoding()).toEqual("base64");
    });

    it("should encode its body to base64", async () => {
      await mail.attachments().set("test.png", { content: testPng });
      mail.readyToSendBang();
      expect(mail.attachments().get(0)!.encoded()).toContain(encodeBase64(testPng));
    });

    it("should allow you to pass in an encoded attachment with an encoding", async () => {
      const encodedData = encodeBase64(testPng);
      await mail.attachments().set("test.png", { content: encodedData, encoding: "base64" });
      checkDecoded(mail.attachments().get(0)!.decoded(), testPng);
    });

    it("should allow you set a mime type and encoding without overriding the encoding", async () => {
      const encoded = encodeBase64("<foo/>");
      await mail
        .attachments()
        .set("test.png", { mimeType: "text/xml", content: encoded, encoding: "base64" });
      expect(mail.attachments().get(0)!.contentTransferEncoding()).toEqual("base64");
      checkDecoded(mail.attachments().get(0)!.decoded(), "<foo/>");
    });

    it("should not allow you to pass in an encoded attachment with an unknown encoding", async () => {
      const base64EncodedData = encodeBase64(testPng);
      await expect(
        mail
          .attachments()
          .set("test.png", { content: base64EncodedData, encoding: "weird_encoding" }),
      ).rejects.toThrow(/Do not know how to handle Content Transfer Encoding weird_encoding/);
    });

    it("should be able to call read on the attachment to return the decoded data", async () => {
      await mail.attachments().set("test.png", { content: testPng });
      const expected = mail.attachments().get(0)!.read();
      expect(expected).toEqual(testPng);
    });

    it("should only add one newline between attachment body and boundary", async () => {
      const contents = "I have\ntwo lines with trailing newlines\n\n";
      await mail.attachments().set("text.txt", { content: contents });
      const encoded = mail.encoded();
      const regex = new RegExp(
        `\\r\\n${regexpEscape(contents.replaceAll("\n", "\r\n"))}\\r\\n--${regexpEscape(mail.boundary()!)}--\\r\\n$`,
      );
      expect(encoded).toMatch(regex);
    });
  });

  describe("multiple attachments", () => {
    it("should allow you to pass in more than one attachment", async () => {
      const mail = Mail.new();
      await mail.attachments().set("test.pdf", await readRawFixture("attachments", "test.pdf"));
      await mail.attachments().set("test.gif", await readRawFixture("attachments", "test.gif"));
      await mail.attachments().set("test.jpg", await readRawFixture("attachments", "test.jpg"));
      await mail.attachments().set("test.zip", await readRawFixture("attachments", "test.zip"));
      expect(mail.attachments().get(0)!.filename()).toEqual("test.pdf");
      expect(mail.attachments().get(1)!.filename()).toEqual("test.gif");
      expect(mail.attachments().get(2)!.filename()).toEqual("test.jpg");
      expect(mail.attachments().get(3)!.filename()).toEqual("test.zip");
    });
  });

  describe("inline attachments", () => {
    it("should set the content_disposition to inline or attachment as appropriate", async () => {
      const mail = Mail.new();
      await mail.attachments().set("test.pdf", await readRawFixture("attachments", "test.pdf"));
      expect(mail.attachments().get("test.pdf")!.contentDisposition()).toEqual(
        "attachment; filename=test.pdf",
      );
      await mail
        .attachments()
        .inline()
        .set("test.png", await readRawFixture("attachments", "test.png"));
      expect(mail.attachments().inline().get("test.png")!.contentDisposition()).toEqual(
        "inline; filename=test.png",
      );
    });

    it("should return a cid", async () => {
      const mail = Mail.new();
      await mail.attachments().inline().set("test.png", testPng);
      expect(mail.attachments().get("test.png")!.url()).toEqual(
        `cid:${mail.attachments().get("test.png")!.cid()}`,
      );
    });

    it("should respond true to inline?", async () => {
      const mail = Mail.new();
      await mail.attachments().inline().set("test.png", testPng);
      expect(mail.attachments().get("test.png")!.isInline()).toBeTruthy();
    });
  });

  describe("getting the content ID from an attachment", () => {
    let cid: string;
    beforeEach(async () => {
      mail = Mail.new();
      await mail.attachments().set("test.gif", await readRawFixture("attachments", "test.gif"));
      expect(mail.attachments().get("test.gif")!.hasContentId()).toBeFalsy();
      mail.attachments().get("test.gif")!.addContentId();
      cid = mail.attachments().get("test.gif")!.contentId() as string;
      expect(cid).not.toBeNull();
    });

    it("should return a valid content-id on inline attachments", () => {
      const field = new ContentIdField(cid);
      expect(field.errors).toBeEmpty();
    });

    it("should provide a URL escaped content_id (without brackets) for use inside an email", () => {
      const inline = mail.attachments().get("test.gif")!.cid();
      expect(inline).toEqual(Utilities.uriParser().escape(cid.replace(/^</, "").replace(/>$/, "")));
    });
  });

  describe("setting the content type correctly", () => {
    it("should set the content type to multipart/mixed if none given and you add an attachment", async () => {
      const mail = Mail.new();
      await mail.attachments().set("test.pdf", await readRawFixture("attachments", "test.pdf"));
      mail.encoded();
      expect(mail.mimeType()).toEqual("multipart/mixed");
    });

    it("allows you to set the attachment before the content type", async () => {
      const mail = Mail.new();
      await mail.attachments().set("test.png", await readRawFixture("attachments", "test.png"));
      mail.setBody("Lots of HTML");
      mail.setMimeVersion("1.0");
      mail.setContentType("text/html; charset=UTF-8");
    });
  });

  describe("should handle filenames with non-7bit characters correctly", () => {
    it("should not raise an exception with a filename that contains a non-7bit-character", async () => {
      const filename = "f\u00f6\u00f6.b\u00e4r";
      expect(rbObjEncoding(filename)).toEqual(Encoding.UTF_8);
      const mail = Mail.new();
      await expect(
        mail.attachments().set(filename, await readRawFixture("attachments", "test.pdf")),
      ).resolves.not.toThrow();
    });
  });
});

describe("reading emails with attachments", () => {
  describe("test emails", () => {
    it("should find the attachment using content location", async () => {
      const mail = await readFixture("emails/attachment_emails/attachment_content_location.eml");
      expect(mail.attachments().length).toEqual(1);
    });

    it("should find an attachment defined with 'name' and Content-Disposition: attachment", async () => {
      const mail = await readFixture("emails/attachment_emails/attachment_content_disposition.eml");
      expect(mail.attachments().length).toEqual(1);
    });

    it("should use the content-disposition filename over the content-type filename or name", async () => {
      const mail = await readFixture("emails/attachment_emails/attachment_content_disposition.eml");
      expect(mail.attachments().get(0)!.filename()).toEqual("api.rb");
    });

    it("should decode an attachment", async () => {
      const mail = await readFixture("emails/attachment_emails/attachment_pdf.eml");
      expect((mail.attachments().get(0)!.decoded() as Uint8Array).length).toEqual(1026);
    });

    it("should decode an attachment with linefeeds", async () => {
      const mail = await readFixture("emails/attachment_emails/attachment_pdf_lf.eml");
      expect(mail.attachments().length).toEqual(1);
      expect((mail.attachments().get(0)!.decoded() as Uint8Array).length).toEqual(1026);
    });

    it("should find an attachment that has an encoded name value", async () => {
      const mail = await readFixture("emails/attachment_emails/attachment_with_encoded_name.eml");
      expect(mail.attachments().length).toEqual(1);
      const result = mail.attachments().get(0)!.filename();
      const replace = "�";
      const expected = `01 Quien Te Dij${replace}at. Pitbull.mp3`;
      expect(result).toEqual(expected);
    });

    it("should find an attachment that has an base64 encoded name value", async () => {
      const mail = await readFixture(
        "emails/attachment_emails/attachment_with_base64_encoded_name.eml",
      );
      expect(mail.attachments().length).toEqual(1);
      const result = mail.attachments().get(0)!.filename();
      expect(result).toEqual("This is a test.pdf");
    });

    it("should find an attachment that has a name not surrounded by quotes", async () => {
      const mail = await readFixture("emails/attachment_emails/attachment_with_unquoted_name.eml");
      expect(mail.attachments().length).toEqual(1);
      expect(mail.attachments()[0].filename()).toEqual("This is a test.txt");
    });

    it("should decode an attachment without ascii compatible filename", async () => {
      const mail = await readFixture("emails/attachment_emails/attachment_nonascii_filename.eml");
      expect(mail.attachments().length).toEqual(1);
      expect(mail.attachments()[0].filename()).toEqual("ciële.txt");
    });

    it("should find attachments inside parts with content-type message/rfc822", async () => {
      const mail = await readFixture("emails/attachment_emails/attachment_message_rfc822.eml");
      expect(mail.attachments().length).toEqual(1);
      expect((mail.attachments().get(0)!.decoded() as Uint8Array).length).toEqual(1026);
    });

    it("attach filename decoding (issue 83)", () => {
      const mail = Mail.new(
        Utilities.toCrlf(`Subject: aaa
From: aaa@aaa.com
To: bbb@aaa.com
Content-Type: multipart/mixed; boundary=0016e64c0af257c3a7048b69e1ac

--0016e64c0af257c3a7048b69e1ac
Content-Type: multipart/alternative; boundary=0016e64c0af257c3a1048b69e1aa

--0016e64c0af257c3a1048b69e1aa
Content-Type: text/plain; charset=ISO-8859-1

aaa

--0016e64c0af257c3a1048b69e1aa
Content-Type: text/html; charset=ISO-8859-1

aaa<br>

--0016e64c0af257c3a1048b69e1aa--
--0016e64c0af257c3a7048b69e1ac
Content-Type: text/plain; charset=US-ASCII; name="=?utf-8?b?Rm90bzAwMDkuanBn?="
Content-Disposition: attachment; filename="=?utf-8?b?Rm90bzAwMDkuanBn?="
Content-Transfer-Encoding: base64
X-Attachment-Id: f_gbneqxxy0

YWFhCg==
--0016e64c0af257c3a7048b69e1ac--
`),
      );
      expect(mail.attachments().get(0)!.filename()).toEqual("Foto0009.jpg");
    });
  });
});

describe("attachment order", () => {
  it("should be preserved instead  when content type exists", async () => {
    const mail = Mail.new(function (this: Message) {
      this.to("aaaa@aaaa.aaa");
      this.from("aaaa2@aaaa.aaa");
      this.subject("a subject");
      this.date(new Date());
      this.textPart(function (this: Message) {
        this.contentType("text/plain; charset=UTF-8");
        this.body("a \nsimplebody\n");
      });
    });

    await mail.attachments().set("test.zip", await readRawFixture("attachments", "test.zip"));
    await mail.attachments().set("test.pdf", await readRawFixture("attachments", "test.pdf"));
    await mail.attachments().set("test.gif", await readRawFixture("attachments", "test.gif"));
    await mail.attachments().set("test.jpg", await readRawFixture("attachments", "test.jpg"));
    expect(mail.attachments().get(0)!.filename()).toEqual("test.zip");
    expect(mail.attachments().get(1)!.filename()).toEqual("test.pdf");
    expect(mail.attachments().get(2)!.filename()).toEqual("test.gif");
    expect(mail.attachments().get(3)!.filename()).toEqual("test.jpg");

    const mail2 = Mail.new(mail.encoded());
    expect(mail2.attachments().get(0)!.filename()).toEqual("test.zip");
    expect(mail2.attachments().get(1)!.filename()).toEqual("test.pdf");
    expect(mail2.attachments().get(2)!.filename()).toEqual("test.gif");
    expect(mail2.attachments().get(3)!.filename()).toEqual("test.jpg");
  });
});
