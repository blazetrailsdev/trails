import { describe, expect, it } from "vitest";
import { Field } from "../field.js";
import { MessageIdsElement } from "./message-ids-element.js";

describe("Mail::MessageIdsElement", () => {
  it("should parse a message_id", () => {
    const msgIdText = "<1234@test.lindsaar.net>";
    expect(() => new MessageIdsElement(msgIdText)).not.toThrow();
  });

  it("should parse multiple message_ids", () => {
    const msgIdText = "<1234@test.lindsaar.net> <1234@test.lindsaar.net>";
    expect(() => new MessageIdsElement(msgIdText)).not.toThrow();
  });

  it("treats nil as an empty list", () => {
    const element = new MessageIdsElement(null);
    expect(element.messageIds).toEqual([]);
    expect(element.messageId).toBeNull();
  });

  it("should raise an error if the input is useless", () => {
    const msgIdText = '""""""""""""""""';
    expect(() => new MessageIdsElement(msgIdText)).toThrow(Field.ParseError);
  });

  it("should respond to message_ids", () => {
    const msgIdText = "<1234@test.lindsaar.net> <1234@test.lindsaar.net>";
    const msgIds = new MessageIdsElement(msgIdText);
    expect(msgIds.messageIds).toEqual(["1234@test.lindsaar.net", "1234@test.lindsaar.net"]);
  });

  it("should respond to message_id", () => {
    const msgIdText = "<1234@test.lindsaar.net>";
    const msgIds = new MessageIdsElement(msgIdText);
    expect(msgIds.messageId).toEqual("1234@test.lindsaar.net");
  });

  it("should not fail to parse a message id with dots in it", () => {
    const text = "<4afb664ca3078_48dc..fdbe32b865532b@ax-desktop.mail>";
    const m = new MessageIdsElement(text);
    expect(m.messageId).toEqual("4afb664ca3078_48dc..fdbe32b865532b@ax-desktop.mail");
  });
});
