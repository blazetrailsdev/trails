import { describe, expect, it } from "vitest";
import { MessageVerifier } from "../lib/message-verifier.js";

const Latin1Serializer = {
  dump: (value: unknown) => Buffer.from(value as string, "latin1"),
  load: (value: unknown) => Buffer.from(value as Uint8Array).toString("latin1"),
};

describe("MessageVerifier separator index", () => {
  it("verifies a message whose encoded body contains the separator", () => {
    const verifier = new MessageVerifier("Hey, I'm a secret!", {
      url_safe: true,
      serializer: Latin1Serializer,
    });
    const data = "ûï¾ûï¾";
    const message = verifier.generate(data);
    expect(message.slice(0, message.lastIndexOf("--"))).toContain("--");
    expect(verifier.verify(message)).toBe(data);
  });

  it("rejects a message with no digest", () => {
    const verifier = new MessageVerifier("Hey, I'm a secret!");
    expect(verifier.validMessage("abc--")).toBe(false);
  });
});
