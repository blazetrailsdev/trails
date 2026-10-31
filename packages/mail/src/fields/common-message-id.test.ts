import { describe, expect, it } from "vitest";
import { MessageIdField } from "./message-id-field.js";

describe("Mail::CommonMessageIdField", () => {
  describe("encoding and decoding fields", () => {
    it("should allow us to encode a message id field", () => {
      const field = new MessageIdField("<ThisIsANonUniqueMessageId@me.com>");
      expect(field.encoded()).toEqual("Message-ID: <ThisIsANonUniqueMessageId@me.com>\r\n");
    });
    it("should allow us to encode a message id field", () => {
      const field = new MessageIdField("<1234@test.lindsaar.net>");
      expect(field.encoded()).toEqual("Message-ID: <1234@test.lindsaar.net>\r\n");
    });
    it("should allow us to decode a message id field", () => {
      const field = new MessageIdField("<1234@test.lindsaar.net>");
      expect(field.decoded()).toEqual("<1234@test.lindsaar.net>");
    });
  });
});
