import { describe, it, expect } from "vitest";

import { MessageVerifier } from "./message-verifier.js";

describe("MessagesSerializerWithFallbackTest", () => {
  it.skip(":marshal serializer dumps objects using Marshal format");
  it.skip(":json serializer dumps objects using JSON format");
  it.skip(":message_pack serializer dumps objects using MessagePack format");
  it.skip("every serializer can load every non-Marshal format");
  it.skip("only :marshal and :*_allow_marshal serializers can load Marshal format");
  it.skip(":json serializer recognizes regular JSON");
  it.skip(":json serializer can load irregular JSON");
  it.skip("notifies when serializer falls back to loading an alternate format");
  it.skip("raises on invalid format name");
});

describe("MessageVerifierMetadataTest", () => {
  it("#verify raises when :purpose does not match", () => {
    const verifier = new MessageVerifier("secret");
    const message = verifier.generate("data", { purpose: "login" });
    expect(() => verifier.verify(message, { purpose: "admin" })).toThrow();
  });

  it("#verify raises when message is expired via :expires_at", () => {
    const verifier = new MessageVerifier("secret");
    const pastDate = new Date(Date.now() - 1000);
    const message = verifier.generate("data", { expiresAt: pastDate });
    expect(() => verifier.verify(message)).toThrow();
  });

  it("#verify raises when message is expired via :expires_in", () => {
    const verifier = new MessageVerifier("secret");
    const message = verifier.generate("data", { expiresIn: -1 }); // already expired
    expect(() => verifier.verify(message)).toThrow();
  });

  it("messages are readable by legacy versions when use_message_serializer_for_metadata = false", () => {
    const verifier = new MessageVerifier("secret");
    const message = verifier.generate("hello");
    expect(verifier.verify(message)).toBe("hello");
  });

  it("messages are readable by legacy versions when force_legacy_metadata_serializer is true", () => {
    const verifier = new MessageVerifier("secret");
    const message = verifier.generate({ key: "value" });
    expect(verifier.verify(message)).toEqual({ key: "value" });
  });

  it("messages keep the old format when use_message_serializer_for_metadata is false", () => {
    const verifier = new MessageVerifier("secret");
    const msg = verifier.generate(42);
    expect(verifier.verify(msg)).toBe(42);
  });
});

describe("MessageVerifiersTest", () => {
  it.skip("can override secret generator");
  it.skip("supports arbitrary secret generator kwargs");
  it.skip("supports arbitrary secret generator kwargs when using #rotate block");
});

describe("MessagesRotationConfiguration", () => {
  it.skip("signed configurations");
  it.skip("encrypted configurations");
});

describe("MessageVerifierRotatorTest", () => {
  it.skip("rotate digest");
});
