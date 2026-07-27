import { describe, expect, it } from "vitest";

import { InvalidMessage, MessageEncryptor } from "../message-encryptor.js";
import { InvalidSignature, MessageVerifier } from "../message-verifier.js";
import { Codec, type CodecOptions } from "./codec.js";
import type { Format } from "./serializer-with-fallback.js";

class ExposedCodec extends Codec {
  constructor(options: CodecOptions = {}) {
    super(options);
  }

  exposedDecode(encoded: string): Buffer {
    return this.decode(encoded);
  }
}

const SECRET = "x".repeat(32);
const FORMATS: Format[] = [
  "marshal",
  "json",
  "json_allow_marshal",
  "message_pack",
  "message_pack_allow_marshal",
];

function munge(base64String: string): string {
  return Buffer.from(Buffer.from(base64String, "base64").reverse()).toString("base64");
}

describe("Messages::Codec (trails)", () => {
  it("subclasses default to the json serializer", () => {
    expect(MessageEncryptor.defaultSerializer).toBe("json");
    expect(MessageVerifier.defaultSerializer).toBe("json");
  });

  it.each(FORMATS)("MessageVerifier round-trips a %s payload", (serializer) => {
    const verifier = new MessageVerifier(SECRET, { serializer });
    const value = { greeting: "héllo→😀", n: 42, list: [1, 2, 3] };
    expect(verifier.verify(verifier.generate(value))).toEqual(value);
  });

  it.each(FORMATS)("MessageEncryptor round-trips a %s payload", (serializer) => {
    const encryptor = new MessageEncryptor(SECRET, { serializer });
    const value = { greeting: "héllo→😀", n: 42, list: [1, 2, 3] };
    expect(encryptor.decryptAndVerify(encryptor.encryptAndSign(value))).toEqual(value);
  });

  it.each([
    [false, "abc"],
    [false, "ab=c"],
    [false, "a"],
    [true, "a"],
    [true, "ab*cd"],
  ])("decode rejects a malformed base64 segment (urlSafe: %s)", (urlSafe, encoded) => {
    const codec = new ExposedCodec({ urlSafe });
    expect(() => codec.exposedDecode(encoded)).toThrow(
      expect.objectContaining({ tag: "invalid_message_format" }),
    );
  });

  it("decode accepts both padded and unpadded url-safe segments", () => {
    const codec = new ExposedCodec({ urlSafe: true });
    expect(codec.exposedDecode("aGVsbG8h").toString("latin1")).toBe("hello!");
    expect(codec.exposedDecode("aGVsbG8").toString("latin1")).toBe("hello");
    expect(codec.exposedDecode("aGVsbG8=").toString("latin1")).toBe("hello");
  });

  it("decode retries with the opposite url-safe direction", () => {
    const urlSafe = new MessageVerifier(SECRET, { url_safe: true });
    const value = { a: "?".repeat(40) };
    const message = urlSafe.generate(value);

    expect(new MessageVerifier(SECRET).verify(message)).toEqual(value);
    expect(new MessageVerifier(SECRET).verified(message)).toEqual(value);
  });

  it("verify raises InvalidSignature on a tampered message", () => {
    const verifier = new MessageVerifier(SECRET);
    const message = verifier.generate("hello");
    const [data, hash] = message.split("--");

    expect(() => verifier.verify(`${munge(data)}--${hash}`)).toThrow(InvalidSignature);
    expect(verifier.verified(`${munge(data)}--${hash}`)).toBeNull();
    expect(verifier.validMessage(`${munge(data)}--${hash}`)).toBe(false);
    expect(verifier.validMessage(message)).toBe(true);
  });

  it("decryptAndVerify raises InvalidMessage on a tampered message", () => {
    const encryptor = new MessageEncryptor(SECRET);
    const message = encryptor.encryptAndSign("hello");
    const [text, hash] = message.split("--");

    expect(() => encryptor.decryptAndVerify(`${munge(text)}--${hash}`)).toThrow(InvalidMessage);
    expect(() => encryptor.decryptAndVerify("not-a-message")).toThrow(InvalidMessage);
  });
});
