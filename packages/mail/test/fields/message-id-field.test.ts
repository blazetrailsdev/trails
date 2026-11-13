import { describe, expect, it } from "vitest";
import type {} from "@blazetrails/vitest-matchers";
import { MessageIdField } from "../../lib/fields/message-id-field.js";
import { Utilities } from "../../lib/utilities.js";

describe("Mail::MessageIdField", () => {
  describe("initialization", () => {
    it("should initialize", () => {
      expect(() => new MessageIdField("<1234@test.lindsaar.net>")).not.toThrow();
    });

    it("should accept a string without the field name", () => {
      const m = new MessageIdField("<1234@test.lindsaar.net>");
      expect(m.name).toEqual("Message-ID");
      expect(m.value).toEqual("<1234@test.lindsaar.net>");
      expect(m.messageId()).toEqual("1234@test.lindsaar.net");
    });

    it("should accept a nil value and generate a message_id", () => {
      const m = new MessageIdField(null);
      expect(m.name).toEqual("Message-ID");
      expect(m.value).not.toBeNull();
    });
  });

  describe("ensuring only one message ID", () => {
    it("should not accept a string with multiple message IDs but only return the first", () => {
      const m = new MessageIdField("<1234@test.lindsaar.net> <4567@test.lindsaar.net>");
      expect(m.name).toEqual("Message-ID");
      expect(m.toString()).toEqual("<1234@test.lindsaar.net>");
      expect(m.messageId()).toEqual("1234@test.lindsaar.net");
      expect(m.messageIds()).toEqual(["1234@test.lindsaar.net"]);
    });

    it("should change the message id if given a new message id", () => {
      const m = new MessageIdField("<1234@test.lindsaar.net>");
      expect(m.toString()).toEqual("<1234@test.lindsaar.net>");
      m.value = "<4567@test.lindsaar.net>";
      expect(m.toString()).toEqual("<4567@test.lindsaar.net>");
    });
  });

  describe("instance methods", () => {
    it("should provide to_s", () => {
      const m = new MessageIdField("<1234@test.lindsaar.net>");
      expect(m.toString()).toEqual("<1234@test.lindsaar.net>");
      expect(String(m.messageId())).toEqual("1234@test.lindsaar.net");
    });

    it("should provide encoded", () => {
      const m = new MessageIdField("<1234@test.lindsaar.net>");
      expect(m.encoded()).toEqual("Message-ID: <1234@test.lindsaar.net>\r\n");
    });

    it("should provide decoded", () => {
      const m = new MessageIdField("<1234@test.lindsaar.net>");
      expect(m.decoded()).toEqual("<1234@test.lindsaar.net>");
    });

    it("should respond to :responsible_for?", () => {
      const m = new MessageIdField("<1234@test.lindsaar.net>");
      expect(m).toRespondTo("isResponsibleFor");
    });
  });

  describe("generating a message id", () => {
    it("should generate a message ID if it has no value", () => {
      const m = new MessageIdField();
      expect(Utilities.isBlank(m.messageId())).not.toBeTruthy();
    });

    it("should generate a random message ID", () => {
      const m = new MessageIdField();
      for (let i = 1; i <= 100; i++) {
        expect(m.messageId()).not.toEqual(new MessageIdField().messageId());
      }
    });
  });

  describe("weird message IDs", () => {
    it("should be able to parse <000701c874a6$3df7eaf0$b9e7c0d0$@geille@fiscon.com>", () => {
      const m = new MessageIdField("<000701c874a6$3df7eaf0$b9e7c0d0$@geille@fiscon.com>");
      expect(m.messageId()).toEqual("000701c874a6$3df7eaf0$b9e7c0d0$@geille@fiscon.com");
    });

    it("should be able to parse <.AAA-default-12226,16.1089643496@us-bdb-1201.vdc.amazon.com>", () => {
      const m = new MessageIdField("<.AAA-default-12226,16.1089643496@us-bdb-1201.vdc.amazon.com>");
      expect(m.messageId()).toEqual(".AAA-default-12226,16.1089643496@us-bdb-1201.vdc.amazon.com");
    });

    it("should be able to parse <091720041340.19561.414AE9430005E91000004C6922007589429B0702040790040A0E08 0C0703@comcast.net>", () => {
      const m = new MessageIdField(
        "<091720041340.19561.414AE9430005E91000004C6922007589429B0702040790040A0E08 0C0703@comcast.net>",
      );
      expect(m.messageId()).toEqual(
        "091720041340.19561.414AE9430005E91000004C6922007589429B0702040790040A0E08 0C0703@comcast.net",
      );
    });

    it("should be able to parse <3851.1096568577MSOSI1188307:1OSIMS@gamefly.com>", () => {
      const m = new MessageIdField("<3851.1096568577MSOSI1188307:1OSIMS@gamefly.com>");
      expect(m.messageId()).toEqual("3851.1096568577MSOSI1188307:1OSIMS@gamefly.com");
    });

    it("should be able to parse <3851.1096568577MSOSI1188307:1OSIMS@gamefly.com >", () => {
      const m = new MessageIdField("<3851.1096568577MSOSI1188307:1OSIMS@gamefly.com >");
      expect(m.messageId()).toEqual("3851.1096568577MSOSI1188307:1OSIMS@gamefly.com ");
    });

    it("should be able to parse <000301caf03a$77d922ae$82dba8c0@.pool.ukrtel.net>", () => {
      const m = new MessageIdField("<000301caf03a$77d922ae$82dba8c0@.pool.ukrtel.net>");
      expect(m.messageId()).toEqual("000301caf03a$77d922ae$82dba8c0@.pool.ukrtel.net");
    });

    it('should be able to parse <"urn:correios:msg:2011071303483114f523ef89e040878bca2e451a999448"@1310528911569.rte-svc-na-5006.iad5.amazon.com>', () => {
      const m = new MessageIdField(
        '<"urn:correios:msg:2011071303483114f523ef89e040878bca2e451a999448"@1310528911569.rte-svc-na-5006.iad5.amazon.com>',
      );
      expect(m.messageId()).toEqual(
        '"urn:correios:msg:2011071303483114f523ef89e040878bca2e451a999448"@1310528911569.rte-svc-na-5006.iad5.amazon.com',
      );
    });

    it("should be able to parse <7467BC5DC7CCEB429E2D3F05E49B3067375E6DC038@EXVMBX020-10.exch020.server...", () => {
      const m = new MessageIdField(
        "<7467BC5DC7CCEB429E2D3F05E49B3067375E6DC038@EXVMBX020-10.exch020.server...",
      );
      expect(m.messageId()).toEqual(
        "<7467BC5DC7CCEB429E2D3F05E49B3067375E6DC038@EXVMBX020-10.exch020.server...",
      );
    });

    it("should be able to parse |2a26f8f146e27159|", () => {
      const m = new MessageIdField("2a26f8f146e27159");
      expect(m.messageId()).toEqual("2a26f8f146e27159");
    });
  });
});
