import {
  ArgumentError,
  Base64,
  Marshal,
  OpenSSL,
  SecureRandom,
  TypeError,
  unpack,
} from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";

import { Encryptor } from "./index.js";

const toHash = (value: unknown): unknown =>
  value instanceof Map ? Object.fromEntries(value) : value;

describe("Rack::Session::Encryptor", () => {
  let secret: Uint8Array;

  beforeEach(() => {
    secret = SecureRandom.randomBytes(64);
  });

  it("initialize does not destroy key string", () => {
    new Encryptor(secret);

    expect(secret.length).toBe(64);
  });

  it("initialize raises ArgumentError on invalid key", () => {
    expect(() => new Encryptor(["foo"])).toThrow(ArgumentError);
  });

  it("initialize raises ArgumentError on short key", () => {
    expect(() => new Encryptor("key")).toThrow(ArgumentError);
  });

  it("decrypts an encrypted message", () => {
    const encryptor = new Encryptor(secret);

    const message = encryptor.encrypt({ foo: "bar" });

    expect(toHash(encryptor.decrypt(message))).toEqual({ foo: "bar" });
  });

  it("decrypt raises InvalidSignature for tampered messages", () => {
    const encryptor = new Encryptor(secret);

    const message = encryptor.encrypt({ foo: "bar" });

    const m = Base64.urlsafeDecode64(message);
    const tamperedMessage = Base64.urlsafeEncode64(
      m.slice(0, m.length - 1) + String.fromCharCode(m.charCodeAt(m.length - 1) ^ 1),
    );

    expect(() => encryptor.decrypt(tamperedMessage)).toThrow(Encryptor.InvalidSignature);
  });

  it("decrypts an encrypted message with purpose", () => {
    const encryptor = new Encryptor(secret, { purpose: "testing" });

    const message = encryptor.encrypt({ foo: "bar" });

    expect(toHash(encryptor.decrypt(message))).toEqual({ foo: "bar" });
  });

  it("decrypts raises InvalidSignature without purpose", () => {
    const encryptor = new Encryptor(secret, { purpose: "testing" });
    const otherEncryptor = new Encryptor(secret);

    const message = otherEncryptor.encrypt({ foo: "bar" });

    expect(() => encryptor.decrypt(message)).toThrow(Encryptor.InvalidSignature);
  });

  it("decrypts raises InvalidSignature with different purpose", () => {
    const encryptor = new Encryptor(secret, { purpose: "testing" });
    const otherEncryptor = new Encryptor(secret, { purpose: "other" });

    const message = otherEncryptor.encrypt({ foo: "bar" });

    expect(() => encryptor.decrypt(message)).toThrow(Encryptor.InvalidSignature);
  });

  it("initialize raises ArgumentError on invalid pad_size", () => {
    expect(() => new Encryptor(secret, { padSize: "bar" })).toThrow(ArgumentError);
  });

  it("initialize raises ArgumentError on to short pad_size", () => {
    expect(() => new Encryptor(secret, { padSize: 1 })).toThrow(ArgumentError);
  });

  it("initialize raises ArgumentError on to long pad_size", () => {
    expect(() => new Encryptor(secret, { padSize: 8023 })).toThrow(ArgumentError);
  });

  it("decrypts an encrypted message without pad_size", () => {
    const encryptor = new Encryptor(secret, { purpose: "testing", padSize: null });

    const message = encryptor.encrypt({ foo: "bar" });

    expect(toHash(encryptor.decrypt(message))).toEqual({ foo: "bar" });
  });

  it("encryptor with pad_size increases message size", () => {
    const noPadEncryptor = new Encryptor(secret, { purpose: "testing", padSize: null });
    const padEncryptor = new Encryptor(secret, { purpose: "testing", padSize: 64 });

    const messageWithout = Base64.urlsafeDecode64(noPadEncryptor.encrypt(""));
    const messageWith = Base64.urlsafeDecode64(padEncryptor.encrypt(""));
    const messageSizeDiff = messageWith.length - messageWithout.length;

    expect(messageWith.length).toBeGreaterThan(messageWithout.length);
    expect(messageSizeDiff).toBe(64 - Marshal.dump("").length - 2);
  });

  it("encryptor with pad_size has message payload size to multiple of pad_size", () => {
    const encryptor = new Encryptor(secret, { purpose: "testing", padSize: 24 });
    const message = encryptor.encrypt({ foo: "bar".repeat(4) });

    const decodedMessage = Base64.urlsafeDecode64(message);

    const encryptedPayload = decodedMessage.slice(1 + 32 + 16, -32);

    expect(encryptedPayload.length % 24).toBe(0);
  });

  it("uses a secret cipher key for encryption and decryption", () => {
    const cipher = new OpenSSL.Cipher("aes-256-ctr");
    const encryptor = new Encryptor(secret);

    const message = encryptor.encrypt({ foo: "bar" });
    let rawMessage = Base64.urlsafeDecode64(message);

    rawMessage = rawMessage.slice(1);
    const key = rawMessage.slice(0, 32);
    rawMessage = rawMessage.slice(32);
    const iv = rawMessage.slice(0, 16);
    rawMessage = rawMessage.slice(16);

    cipher.decrypt();
    cipher.key = Buffer.from(key, "latin1");
    cipher.iv = Buffer.from(iv, "latin1");

    const data =
      cipher.update(Buffer.from(rawMessage, "latin1")).toString("latin1") +
      cipher.final().toString("latin1");

    const [paddingBytes] = unpack(data, "v") as number[];
    const start = 2 + paddingBytes;
    const serializedData = start > data.length ? null : data.slice(start);

    expect(() => Marshal.load(serializedData)).toThrow(TypeError);
  });

  it("it calls set_cipher_key with the correct key", () => {
    const encryptor = new Encryptor(secret, { purpose: "testing", padSize: 24 });
    const message = encryptor.encrypt({ foo: "bar" });

    const messageKey = Base64.urlsafeDecode64(message).slice(1, 33);

    const callable = (cipher: InstanceType<typeof OpenSSL.Cipher>, key: string) => {
      expect(key).not.toEqual(Buffer.from(secret).toString("latin1"));
      expect(key).not.toEqual(messageKey);

      cipher.key = Buffer.from(key, "latin1");
    };

    (encryptor as unknown as { setCipherKey: typeof callable }).setCipherKey = callable;
    encryptor.decrypt(message);
  });
});
