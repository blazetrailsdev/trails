import { describe, expect, it } from "vitest";
import { ResentMessageIdField } from "./resent-message-id-field.js";

describe("Mail::ResentMessageIdField", () => {
  it("should initialize", () => {
    expect(() => new ResentMessageIdField("<1234@test.lindsaar.net>")).not.toThrow();
  });
  it("should accept a string without the field name", () => {
    const t = new ResentMessageIdField("<1234@test.lindsaar.net>");
    expect(t.name).toEqual("Resent-Message-ID");
    expect(t.value).toEqual("<1234@test.lindsaar.net>");
    expect(t.messageId()).toEqual("1234@test.lindsaar.net");
  });
});
