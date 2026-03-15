import { describe, it, expect } from "vitest";
import { MessageEncryptor, InvalidMessage } from "./message-encryptor.js";
import { MessageVerifier, InvalidSignature } from "./message-verifier.js";

describe("MessageEncryptorTest", () => {
  const secret = "a".repeat(32);

  it("round-trips a string", () => {
    const enc = new MessageEncryptor(secret);
    const message = enc.encryptAndSign("hello world");
    expect(enc.decryptAndVerify(message)).toBe("hello world");
  });

  it("round-trips null", () => {
    const enc = new MessageEncryptor(secret);
    const message = enc.encryptAndSign(null);
    expect(enc.decryptAndVerify(message)).toBeNull();
  });

  it("round-trips arrays", () => {
    const enc = new MessageEncryptor(secret);
    const data = [1, "two", { three: 3 }];
    const message = enc.encryptAndSign(data);
    expect(enc.decryptAndVerify(message)).toEqual(data);
  });

  it("raises on tampered data", () => {
    const enc = new MessageEncryptor(secret);
    expect(() => enc.decryptAndVerify("tampered")).toThrow();
  });

  it("raises on tampered encrypted value", () => {
    const enc = new MessageEncryptor(secret);
    const message = enc.encryptAndSign({ some: "data" });
    const parts = message.split("--");
    const tampered = `${parts[0].split("").reverse().join("")}--${parts[1]}`;
    expect(() => enc.decryptAndVerify(tampered)).toThrow();
  });

  it("raises InvalidMessage on empty string", () => {
    const enc = new MessageEncryptor(secret);
    expect(() => enc.decryptAndVerify("")).toThrow(InvalidMessage);
  });

  it("different secrets cannot decrypt each other", () => {
    const enc1 = new MessageEncryptor("a".repeat(32));
    const enc2 = new MessageEncryptor("b".repeat(32));
    const message = enc1.encryptAndSign({ data: "test" });
    expect(() => enc2.decryptAndVerify(message)).toThrow();
  });

  it("uses aes-256-cbc by default", () => {
    // Just verify it produces output (no error thrown)
    const enc = new MessageEncryptor(secret);
    const message = enc.encryptAndSign("test");
    expect(typeof message).toBe("string");
    expect(message).toContain("--");
  });

  it("alternative serializer", () => {
    const customSerializer = {
      dump: (v: unknown) => JSON.stringify(v),
      load: (s: string) => JSON.parse(s),
    };
    const enc = new MessageEncryptor(secret, { serializer: customSerializer });
    const data = { foo: 123 };
    const message = enc.encryptAndSign(data);
    expect(enc.decryptAndVerify(message)).toEqual(data);
  });
});

describe("MessageVerifierTest", () => {
  it("simple round-trip", () => {
    const v = new MessageVerifier("Hey, I'm a secret!");
    const message = v.generate("hello");
    expect(v.verify(message)).toBe("hello");
    expect(v.verified(message)).toBe("hello");
  });

  it("round-tripping nil", () => {
    const v = new MessageVerifier("Hey, I'm a secret!");
    const message = v.generate(null);
    expect(v.verify(message)).toBeNull();
    expect(v.verified(message)).toBeNull();
  });

  it("valid_message returns false on invalid", () => {
    const v = new MessageVerifier("Hey, I'm a secret!");
    expect(v.validMessage("purejunk")).toBe(false);
    expect(v.validMessage("")).toBe(false);
  });

  it("valid_message returns false on tampered data", () => {
    const v = new MessageVerifier("Hey, I'm a secret!");
    const [data, hash] = v.generate({ some: "data" }).split("--");
    expect(v.validMessage(`${data!.split("").reverse().join("")}--${hash}`)).toBe(false);
    expect(v.validMessage(`${data}--${hash!.split("").reverse().join("")}`)).toBe(false);
    expect(v.validMessage("purejunk")).toBe(false);
  });

  it("verified returns null for invalid message", () => {
    const v = new MessageVerifier("Hey, I'm a secret!");
    expect(v.verified("purejunk")).toBeNull();
  });

  it("verify raises InvalidSignature on invalid message", () => {
    const v = new MessageVerifier("Hey, I'm a secret!");
    expect(() => v.verify("purejunk")).toThrow(InvalidSignature);
  });

  it("round-trips objects", () => {
    const v = new MessageVerifier("secret");
    const data = { some: "data", num: 42 };
    const message = v.generate(data);
    expect(v.verify(message)).toEqual(data);
  });

  it("round-trips arrays", () => {
    const v = new MessageVerifier("secret");
    const data = [1, "two", true];
    const message = v.generate(data);
    expect(v.verify(message)).toEqual(data);
  });

  it("message with purpose verified with same purpose", () => {
    const v = new MessageVerifier("secret");
    const message = v.generate("data", { purpose: "login" });
    expect(v.verify(message, { purpose: "login" })).toBe("data");
  });

  it("message with purpose rejected with different purpose", () => {
    const v = new MessageVerifier("secret");
    const message = v.generate("data", { purpose: "login" });
    expect(v.verified(message, { purpose: "signup" })).toBeNull();
    expect(() => v.verify(message, { purpose: "signup" })).toThrow(InvalidSignature);
  });

  it("expired message returns null from verified", () => {
    const v = new MessageVerifier("secret");
    const message = v.generate("data", { expiresIn: -1 }); // expired 1s ago
    expect(v.verified(message)).toBeNull();
  });

  it("expired message throws from verify", () => {
    const v = new MessageVerifier("secret");
    const message = v.generate("data", { expiresIn: -1 });
    expect(() => v.verify(message)).toThrow(InvalidSignature);
  });

  it("url_safe encoding produces URL-safe tokens", () => {
    const v = new MessageVerifier("secret", { url_safe: true });
    const message = v.generate("??");
    expect(message).not.toContain("+");
    expect(message).not.toContain("/");
    expect(v.verified(message)).toBe("??");
  });

  it("URL-safe and URL-unsafe can decode each other", () => {
    const secret = "shared-secret";
    const safe = new MessageVerifier(secret, { url_safe: true });
    const unsafe = new MessageVerifier(secret, { url_safe: false });

    const data = "hello world";
    expect(unsafe.verify(safe.generate(data))).toBe(data);
    expect(safe.verify(unsafe.generate(data))).toBe(data);
  });

  it("different secrets cannot verify each other", () => {
    const v1 = new MessageVerifier("secret1");
    const v2 = new MessageVerifier("secret2");
    const message = v1.generate("hello");
    expect(v2.verified(message)).toBeNull();
  });
});
