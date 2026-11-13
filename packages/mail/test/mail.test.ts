import { IO } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import "../lib/index.js";
import { Mail } from "../lib/mail.js";
import { Message } from "../lib/message.js";

const fixturePath = (...path: string[]) =>
  new URL(`./fixtures/${path.join("/")}`, import.meta.url).pathname;
const readRawFixture = async (...path: string[]) =>
  await IO.binreadAsync(decodeURIComponent(fixturePath(...path)));
const readFixture = (...path: string[]) => Mail.read(decodeURIComponent(fixturePath(...path)));

describe("mail", () => {
  it("should be able to be instantiated", () => {
    expect(() => Mail).not.toThrow();
  });

  it("should be able to make a new email", () => {
    expect(Mail.new().constructor).toEqual(Message);
  });

  it("should accept headers and body", () => {
    const message = Mail.new(function (this: Message) {
      this.from("mikel@me.com");
      this.to("mikel@you.com");
      this.subject("Hello there Mikel");
      this.body("This is a body of text");
    });
    expect([...(message.from() as string[])]).toEqual(["mikel@me.com"]);
    expect([...(message.to() as string[])]).toEqual(["mikel@you.com"]);
    expect(message.subject()).toEqual("Hello there Mikel");
    expect(message.body().toString()).toEqual("This is a body of text");
  });

  it("should read a file", async () => {
    const wrapMethod = (await readFixture("emails", "plain_emails", "raw_email.eml")).toString();
    const fileMethod = Mail.new(
      await readRawFixture("emails", "plain_emails", "raw_email.eml"),
    ).toString();
    expect(wrapMethod).toEqual(fileMethod);
  });
});
