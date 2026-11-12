import { describe, expect, it } from "vitest";
import "../lib/index.js";
import { Mail } from "../lib/mail.js";
import type { Message } from "../lib/message.js";
import { Part } from "../lib/part.js";
import { Utilities } from "../lib/utilities.js";

describe("Round Tripping", () => {
  it("should round trip a basic email", () => {
    const mail = Mail.new("Subject: FooBar");
    mail.body("This is Text");
    const parsedMail = Mail.new(mail.toString());
    expect(String(parsedMail.subject())).toEqual("FooBar");
    expect(parsedMail.body().toString()).toEqual("This is Text");
  });

  it("should round trip a html multipart email", () => {
    const mail = Mail.new("Subject: FooBar");
    mail.setTextPart(
      new Part(function (this: Part) {
        this.body("This is Text");
      }),
    );
    mail.setHtmlPart(
      new Part(function (this: Part) {
        this.contentType("text/html; charset=US-ASCII");
        this.body("<b>This is HTML</b>");
      }),
    );
    const parsedMail = Mail.new(mail.toString());
    expect(parsedMail.mimeType()).toEqual("multipart/alternative");
    expect(parsedMail.boundary()).toEqual(mail.boundary());
    expect(parsedMail.parts.length).toEqual(2);
    expect(parsedMail.parts[0].body().toString()).toEqual("This is Text");
    expect(parsedMail.parts[1].body().toString()).toEqual("<b>This is HTML</b>");
  });

  it("should round trip an email", async () => {
    const initial = Mail.new(function (this: Message) {
      this.to("mikel@test.lindsaar.net");
      this.subject("testing round tripping");
      this.body("Really testing round tripping.");
      this.from("system@test.lindsaar.net");
      this.cc("nobody@test.lindsaar.net");
      this.bcc("bob@test.lindsaar.net");
      this.date(new Date(2009, 10, 6));
    });
    await initial.addFile({ filename: "foo.txt", content: "I have \ntwo lines\n\n" });
    expect(Mail.new(initial.encoded()).encoded()).toEqual(initial.encoded());
  });

  it("preserves text attachment newlines", async () => {
    const body = "I have \r\ntwo lines\n\r";
    const initial = Mail.new();
    await initial.addFile({ filename: "foo.txt", content: body });
    expect(Mail.new(initial.encoded()).attachments()[0].decoded()).toEqual(
      Utilities.binaryUnsafeToLf(body),
    );
  });
});
