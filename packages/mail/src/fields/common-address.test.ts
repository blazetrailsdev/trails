import { describe, expect, it } from "vitest";
import { ToField } from "./to-field.js";

const given = "みける <mikel@test.lindsaar.net>";
const group = "test1@lindsaar.net, My Group: test2@lindsaar.net, me@lindsaar.net;";

describe("Mail::CommonAddressField", () => {
  describe("address handling", () => {
    it("should provide a list of addresses that are just in the groups", () => {
      expect(new ToField(group).groupAddresses()).toEqual([
        "test2@lindsaar.net",
        "me@lindsaar.net",
      ]);
    });

    it("should handle multiple addresses", () => {
      const field = new ToField(["test1@lindsaar.net", "Mikel <test2@lindsaar.net>"]);
      expect([...field.addresses()]).toEqual(["test1@lindsaar.net", "test2@lindsaar.net"]);
    });

    describe(".<<", () => {
      describe("a unquoted multi-byte address is given", () => {
        describe("initialized with an us-ascii address", () => {
          it("should allow you to append a quoted, multi-byte address value", () => {
            const field = new ToField("Mikel <test1@example.com>");
            field.append(given);
            expect(field.encoded()).toBe(
              "To: Mikel <test1@example.com>, \r\n =?UTF-8?B?44G/44GR44KL?= <mikel@test.lindsaar.net>\r\n",
            );
          });
        });
      });
    });
  });

  describe("encoding and decoding fields", () => {
    it("should allow us to encode an address field", () => {
      expect(new ToField(group).encoded()).toBe(
        "To: test1@lindsaar.net, \r\n My Group: test2@lindsaar.net, \r\n me@lindsaar.net;\r\n",
      );
    });

    it("should allow us to decode an address field", () => {
      expect(new ToField(group).decoded()).toBe(group);
    });
  });
});
