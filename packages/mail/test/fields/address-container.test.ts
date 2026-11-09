import { describe, expect, it } from "vitest";
import { Mail } from "../../lib/mail.js";
import type { AddressContainer } from "../../lib/fields/common-address-field.js";

describe("AddressContainer", () => {
  it("should allow you to append an address to an address field result", () => {
    const m = Mail.new("To: mikel@test.lindsaar.net");
    expect([...(m.to() as string[])]).toEqual(["mikel@test.lindsaar.net"]);
    (m.to() as AddressContainer).append("bob@test.lindsaar.net");
    expect([...(m.to() as string[])]).toEqual(["mikel@test.lindsaar.net", "bob@test.lindsaar.net"]);
  });

  it("should handle complex addresses correctly", () => {
    const m = Mail.new("From: mikel@test.lindsaar.net");
    expect([...(m.from() as string[])]).toEqual(["mikel@test.lindsaar.net"]);
    (m.from() as AddressContainer).append(
      '"Ada Lindsaar" <ada@test.lindsaar.net>, bob@test.lindsaar.net',
    );
    expect([...(m.from() as string[])]).toEqual([
      "mikel@test.lindsaar.net",
      "ada@test.lindsaar.net",
      "bob@test.lindsaar.net",
    ]);
  });
});
