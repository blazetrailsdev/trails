import { describe, expect, it } from "vitest";
import { CcField } from "./cc-field.js";
import { ToField } from "./to-field.js";

describe("Mail::CommonAddressField", () => {
  describe("address handling", () => {
    it("should give the addresses it is going to", () => {
      const field = new ToField("test1@lindsaar.net");
      expect(field.addresses()[0]).toEqual("test1@lindsaar.net");
    });
    it("should split up the address list into individual addresses", () => {
      const field = new ToField("test1@lindsaar.net, test2@lindsaar.net");
      expect([...field.addresses()]).toEqual(["test1@lindsaar.net", "test2@lindsaar.net"]);
    });
    it("should give the formatted addresses", () => {
      const field = new ToField("Mikel <test1@lindsaar.net>, Bob <test2@lindsaar.net>");
      expect([...field.formatted()]).toEqual([
        "Mikel <test1@lindsaar.net>",
        "Bob <test2@lindsaar.net>",
      ]);
    });
    it("should give the display names", () => {
      const field = new ToField("Mikel <test1@lindsaar.net>, Bob <test2@lindsaar.net>");
      expect([...field.displayNames()]).toEqual(["Mikel", "Bob"]);
    });
    it("should handle groups as well", () => {
      const field = new ToField("test1@lindsaar.net, group: test2@lindsaar.net, me@lindsaar.net;");
      expect([...field.addresses()]).toEqual([
        "test1@lindsaar.net",
        "test2@lindsaar.net",
        "me@lindsaar.net",
      ]);
    });
    it("should provide a list of groups", () => {
      const field = new ToField(
        "test1@lindsaar.net, My Group: test2@lindsaar.net, me@lindsaar.net;",
      );
      expect([...field.groupNames()]).toEqual(["My Group"]);
    });
    it("should provide a list of addresses per group", () => {
      const field = new ToField(
        "test1@lindsaar.net, My Group: test2@lindsaar.net, me@lindsaar.net;",
      );
      expect(field.groups().get("My Group")!.length).toEqual(2);
      expect(field.groups().get("My Group")![0].toString()).toEqual("test2@lindsaar.net");
      expect(field.groups().get("My Group")!.at(-1)!.toString()).toEqual("me@lindsaar.net");
    });
    it("should provide a list of addresses that are just in the groups", () => {
      const field = new ToField(
        "test1@lindsaar.net, My Group: test2@lindsaar.net, me@lindsaar.net;",
      );
      expect(field.groupAddresses()).toEqual(["test2@lindsaar.net", "me@lindsaar.net"]);
    });
    describe(".value=", () => {
      it("should handle initializing as an empty string", () => {
        const field = new ToField("");
        expect([...field.addresses()]).toEqual([]);
        field.value = "mikel@test.lindsaar.net";
        expect([...field.addresses()]).toEqual(["mikel@test.lindsaar.net"]);
      });
      it("should encode to an empty string if it has no addresses or groups", () => {
        const field = new ToField("");
        expect(field.encoded()).toEqual("");
        field.value = "mikel@test.lindsaar.net";
        expect(field.encoded()).toEqual("To: mikel@test.lindsaar.net\r\n");
      });
      describe("a unquoted multi-byte address is given", () => {
        it("should allow you to set an unquoted, multi-byte address value after initialization", () => {
          const givenValue = "みける <mikel@test.lindsaar.net>";
          const expectedResult = "To: =?UTF-8?B?44G/44GR44KL?= <mikel@test.lindsaar.net>\r\n";
          const field = new ToField("");
          field.value = givenValue;
          expect(field.encoded()).toEqual(expectedResult);
        });
        it("should keep the given value", () => {
          const givenValue = "みける <mikel@test.lindsaar.net>";
          const field = new ToField("");
          field.value = givenValue;
          expect(field.value).toEqual(givenValue);
        });
      });
      describe("a quoted multi-byte address is given", () => {
        it("should allow you to set an quoted, multi-byte address value after initialization", () => {
          const givenValue = '"みける" <mikel@test.lindsaar.net>';
          const expectedResult = "To: =?UTF-8?B?44G/44GR44KL?= <mikel@test.lindsaar.net>\r\n";
          const field = new ToField("");
          field.value = givenValue;
          expect(field.encoded()).toEqual(expectedResult);
        });
        it("should keep the given value", () => {
          const givenValue = '"みける" <mikel@test.lindsaar.net>';
          const field = new ToField("");
          field.value = givenValue;
          expect(field.value).toEqual(givenValue);
        });
      });
    });
    describe(".<<", () => {
      it("should allow you to append an address", () => {
        const field = new ToField("");
        field.append("mikel@test.lindsaar.net");
        expect([...field.addresses()]).toEqual(["mikel@test.lindsaar.net"]);
      });
      describe("a unquoted multi-byte address is given", () => {
        describe("initialized with an empty string", () => {
          it("should allow you to append an unquoted, multi-byte address value", () => {
            const givenValue = "みける <mikel@test.lindsaar.net>";
            const expectedResult = "To: =?UTF-8?B?44G/44GR44KL?= <mikel@test.lindsaar.net>\r\n";
            const field = new ToField("");
            field.append(givenValue);
            expect(field.encoded()).toEqual(expectedResult);
          });
          it("should keep the given value", () => {
            const givenValue = "みける <mikel@test.lindsaar.net>";
            const field = new ToField("");
            field.append(givenValue);
            expect(field.value).toEqual(givenValue);
          });
        });
        describe("initialized with an us-ascii address", () => {
          it("should allow you to append a quoted, multi-byte address value", () => {
            const givenValue = "みける <mikel@test.lindsaar.net>";
            const expectedResult =
              "To: Mikel <test1@example.com>, \r\n =?UTF-8?B?44G/44GR44KL?= <mikel@test.lindsaar.net>\r\n";
            const field = new ToField("Mikel <test1@example.com>");
            field.append(givenValue);
            expect(field.encoded()).toEqual(expectedResult);
          });
        });
        describe("initialized with an multi-byte address", () => {
          it("should allow you to append a quoted, multi-byte address value", () => {
            const givenValue = "みける <mikel@test.lindsaar.net>";
            const expectedResult =
              "To: =?UTF-8?B?44Of44Kx44Or?= <test2@example.com>, \r\n =?UTF-8?B?44G/44GR44KL?= <mikel@test.lindsaar.net>\r\n";
            const field = new ToField("ミケル <test2@example.com>");
            field.append(givenValue);
            expect(field.encoded()).toEqual(expectedResult);
          });
          it("should keep the given value", () => {
            const givenValue = "みける <mikel@test.lindsaar.net>";
            const field = new ToField("ミケル <test2@example.com>");
            field.append(givenValue);
            expect(field.value).toEqual(["ミケル <test2@example.com>", givenValue].join(", "));
          });
        });
      });
      describe("a quoted multi-byte address is given", () => {
        describe("initialized with an empty string", () => {
          it("should allow you to append a quoted, multi-byte address value", () => {
            const givenValue = '"みける" <mikel@test.lindsaar.net>';
            const expectedResult = "To: =?UTF-8?B?44G/44GR44KL?= <mikel@test.lindsaar.net>\r\n";
            const field = new ToField("");
            field.append(givenValue);
            expect(field.encoded()).toEqual(expectedResult);
          });
          it("should keep the given value", () => {
            const givenValue = '"みける" <mikel@test.lindsaar.net>';
            const field = new ToField("");
            field.append(givenValue);
            expect(field.value).toEqual(givenValue);
          });
        });
        describe("initialized with an us-ascii address", () => {
          it("should allow you to append a quoted, multi-byte address value", () => {
            const givenValue = '"みける" <mikel@test.lindsaar.net>';
            const expectedResult =
              "To: Mikel <test1@example.com>, \r\n =?UTF-8?B?44G/44GR44KL?= <mikel@test.lindsaar.net>\r\n";
            const field = new ToField("Mikel <test1@example.com>");
            field.append(givenValue);
            expect(field.encoded()).toEqual(expectedResult);
          });
        });
        describe("initialized with an multi-byte address", () => {
          it("should allow you to append a quoted, multi-byte address value", () => {
            const givenValue = '"みける" <mikel@test.lindsaar.net>';
            const expectedResult =
              "To: =?UTF-8?B?44Of44Kx44Or?= <test2@example.com>, \r\n =?UTF-8?B?44G/44GR44KL?= <mikel@test.lindsaar.net>\r\n";
            const field = new ToField("ミケル <test2@example.com>");
            field.append(givenValue);
            expect(field.encoded()).toEqual(expectedResult);
          });
          it("should keep the given value", () => {
            const givenValue = '"みける" <mikel@test.lindsaar.net>';
            const field = new ToField("ミケル <test2@example.com>");
            field.append(givenValue);
            expect(field.value).toEqual(["ミケル <test2@example.com>", givenValue].join(", "));
          });
        });
      });
    });
    it("should preserve the display name", () => {
      const field = new ToField('"Mikel Lindsaar" <mikel@test.lindsaar.net>');
      expect([...field.displayNames()]).toEqual(["Mikel Lindsaar"]);
    });
    it("should handle multiple addresses", () => {
      const field = new ToField(["test1@lindsaar.net", "Mikel <test2@lindsaar.net>"]);
      expect([...field.addresses()]).toEqual(["test1@lindsaar.net", "test2@lindsaar.net"]);
    });
    it("should handle missing display names with an angle address", () => {
      const field = new ToField("<mikel@test.lindsaar.net>");
      expect(field.encoded()).toEqual("To: mikel@test.lindsaar.net\r\n");
    });
    it("should handle empty display names with an angle address", () => {
      const field = new ToField('"" <mikel@test.lindsaar.net>');
      expect(field.encoded()).toEqual("To: mikel@test.lindsaar.net\r\n");
    });
  });
  describe("encoding and decoding fields", () => {
    it("should allow us to encode an address field", () => {
      const field = new ToField(
        "test1@lindsaar.net, My Group: test2@lindsaar.net, me@lindsaar.net;",
      );
      expect(field.encoded()).toEqual(
        "To: test1@lindsaar.net, \r\n My Group: test2@lindsaar.net, \r\n me@lindsaar.net;\r\n",
      );
    });
    it("should allow us to encode a simple address field", () => {
      const field = new ToField("test1@lindsaar.net");
      expect(field.encoded()).toEqual("To: test1@lindsaar.net\r\n");
    });
    it("should allow us to encode an address field", () => {
      const field = new CcField(
        "test1@lindsaar.net, My Group: test2@lindsaar.net, me@lindsaar.net;",
      );
      expect(field.encoded()).toEqual(
        "Cc: test1@lindsaar.net, \r\n My Group: test2@lindsaar.net, \r\n me@lindsaar.net;\r\n",
      );
    });
    it("should allow us to decode an address field", () => {
      const field = new ToField(
        "test1@lindsaar.net, My Group: test2@lindsaar.net, me@lindsaar.net;",
      );
      expect(field.decoded()).toEqual(
        "test1@lindsaar.net, My Group: test2@lindsaar.net, me@lindsaar.net;",
      );
    });
    it("should allow us to decode a non ascii address field", () => {
      const field = new ToField("=?UTF-8?B?44G/44GR44KL?= <raasdnil@text.lindsaar.net>");
      expect(field.decoded()).toEqual('"みける" <raasdnil@text.lindsaar.net>');
    });
    it("should allow us to decode a non ascii address field", () => {
      const field = new ToField(
        "=?UTF-8?B?44G/44GR44KL?= <raasdnil@text.lindsaar.net>, =?UTF-8?B?44G/44GR44KL?= <mikel@text.lindsaar.net>",
      );
      expect(field.decoded()).toEqual(
        '"みける" <raasdnil@text.lindsaar.net>, "みける" <mikel@text.lindsaar.net>',
      );
    });
  });
});
