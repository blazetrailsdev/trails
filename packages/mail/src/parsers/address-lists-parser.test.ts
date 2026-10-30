import { describe, expect, it } from "vitest";
import { AddressListsParser } from "./address-lists-parser.js";

describe("AddressListsParser", () => {
  it("should parse an address", () => {
    const text =
      "Mikel Lindsaar <test@lindsaar.net>, Friends: test2@lindsaar.net, Ada <test3@lindsaar.net>;";
    const a = AddressListsParser;
    expect(a.parse(text)).not.toBeNull();
  });

  it("should parse an address list separated by semicolons", () => {
    const text =
      "Mikel Lindsaar <test@lindsaar.net>; Friends: test2@lindsaar.net; Ada <test3@lindsaar.net>;";
    const a = AddressListsParser;
    expect(a.parse(text)).not.toBeNull();
  });

  describe("parsing an address with a space at the end", () => {
    it("only finds a single address", () => {
      const text = "Mikel Lindsaar <test@lindsaar.net> ";
      const a = AddressListsParser;
      expect(a.parse(text).addresses.length).toBe(1);
    });
  });

  describe("parsing an address which begins with a comment", () => {
    it("extracts local string correctly", () => {
      const text = "(xxxx xxxxxx xxxx)ababab@example.com";

      const a = AddressListsParser;
      expect(a.parse(text).addresses.length).toBe(1);
      expect(a.parse(text).addresses[0].local).toBe("ababab");
    });
  });

  describe("RFC6532 UTF-8 headers", () => {
    it("extracts UTF-8 local string", () => {
      const text = '"🌈" (😁) <💌@👉.com>, 🤠:test@example.com;';

      const a = AddressListsParser;
      const result = a.parse(text);
      expect(result.addresses.length).toBe(2);

      let address = result.addresses[0];
      expect(address.displayName).toBe("🌈");
      expect(address.local).toBe("💌");
      expect(address.domain).toBe("👉.com");

      address = result.addresses[1];
      expect(address.group).toBe("🤠");
      expect(address.local).toBe("test");
      expect(address.domain).toBe("example.com");
    });

    it("should parse an address", () => {
      const text = '"💌" <💌@💌.com>, 🤠: test2@lindsaar.net, Ada <test3@lindsaar.net>;';
      const a = AddressListsParser;
      expect(a.parse(text)).not.toBeNull();
    });
  });
});
