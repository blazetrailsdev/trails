import { describe, expect, it } from "vitest";
import { Mail } from "./mail.js";
import type { Message } from "./message.js";

describe("Mail.new", () => {
  it("runs a trailing block against the new message", () => {
    const mail = Mail.new(function (this: Message) {
      this.subject("from the block");
    });
    expect(mail.subject()).toEqual("from the block");
  });

  it("takes a source and a block together", () => {
    const mail = Mail.new("Subject: source", function (this: Message) {
      this.to("to@someemail.com");
    });
    expect(mail.subject()).toEqual("source");
    expect([...(mail.to() as string[])]).toEqual(["to@someemail.com"]);
  });
});
