import { describe, expect, it } from "vitest";
import { constGet } from "@blazetrails/ruby-compat";
import { Mail } from "../lib/mail.js";
import "../lib/index.js";
import type { Message } from "../lib/message.js";

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

describe("Mail seat", () => {
  it("walks Mail::Message from the top level", () => {
    expect(constGet(Object, "Mail")).toBe(Mail);
    expect(constGet(Object, "Mail::Message")).toBe(Mail.Message);
  });
});

describe("Mail::Message#identify_and_set_transfer_encoding", () => {
  it("writes the negotiated encoding's NAME into the header", () => {
    expect(Mail.new("x").encoded()).toContain("Content-Transfer-Encoding: 7bit\r\n");
  });
});
