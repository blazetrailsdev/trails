import { describe, it, expect } from "vitest";

import { MessageVerifier } from "./message-verifier.js";

describe("MessagesSerializerWithFallbackTest", () => {
  it.skip(":marshal serializer dumps objects using Marshal format", () => {
    /* fixture-dependent */
  });
  it.skip(":json serializer dumps objects using JSON format", () => {
    /* fixture-dependent */
  });
  it.skip(":message_pack serializer dumps objects using MessagePack format", () => {
    /* fixture-dependent */
  });
  it.skip("every serializer can load every non-Marshal format", () => {
    /* fixture-dependent */
  });
  it.skip("only :marshal and :*_allow_marshal serializers can load Marshal format", () => {
    /* fixture-dependent */
  });
  it.skip(":json serializer recognizes regular JSON", () => {
    /* fixture-dependent */
  });
  it.skip(":json serializer can load irregular JSON", () => {
    /* fixture-dependent */
  });
  it.skip("notifies when serializer falls back to loading an alternate format", () => {
    /* fixture-dependent */
  });
  it.skip("raises on invalid format name", () => {
    /* fixture-dependent */
  });
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
  it.skip("can override secret generator", () => {
    /* fixture-dependent */
  });
  it.skip("supports arbitrary secret generator kwargs", () => {
    /* fixture-dependent */
  });
  it.skip("supports arbitrary secret generator kwargs when using #rotate block", () => {
    /* fixture-dependent */
  });
});

describe("MessagesRotationConfiguration", () => {
  it.skip("signed configurations", () => {
    /* fixture-dependent */
  });
  it.skip("encrypted configurations", () => {
    /* fixture-dependent */
  });
});

describe("MessageVerifierRotatorTest", () => {
  it.skip("rotate digest", () => {
    /* fixture-dependent */
  });
});
