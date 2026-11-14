import { beforeEach, describe, expect, it } from "vitest";
import { Mail, type Message } from "@blazetrails/mail";
import "../../../lib/mail-ext.js";

describe("AddressesTest", () => {
  let mail: Message;

  beforeEach(() => {
    mail = Mail.new({
      from: "sally@example.com",
      to: "david@basecamp.com",
      cc: "jason@basecamp.com",
      bcc: "andrea@basecamp.com",
      x_original_to: "ryan@basecamp.com",
      x_forwarded_to: "jane@example.com",
    });
  });

  it("from address uses address object", () => {
    expect(mail.fromAddress()!.domain()).toBe("example.com");
  });

  it("recipients include everyone from to, cc, bcc, x-original-to, and x-forwarded-to", () => {
    expect(mail.recipients()).toEqual([
      "david@basecamp.com",
      "jason@basecamp.com",
      "andrea@basecamp.com",
      "ryan@basecamp.com",
      "jane@example.com",
    ]);
  });

  it("recipients addresses use address objects", () => {
    expect(mail.recipientsAddresses()[0].domain()).toBe("basecamp.com");
  });

  it("to addresses use address objects", () => {
    expect(mail.toAddresses()[0].domain()).toBe("basecamp.com");
  });

  it("cc addresses use address objects", () => {
    expect(mail.ccAddresses()[0].domain()).toBe("basecamp.com");
  });

  it("bcc addresses use address objects", () => {
    expect(mail.bccAddresses()[0].domain()).toBe("basecamp.com");
  });

  it("x_original_to addresses use address objects", () => {
    expect(mail.xOriginalToAddresses()[0].domain()).toBe("basecamp.com");
  });

  it("x_forwarded_to addresses use address objects", () => {
    expect(mail.xForwardedToAddresses()[0].domain()).toBe("example.com");
  });
});
