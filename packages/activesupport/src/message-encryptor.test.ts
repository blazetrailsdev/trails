import { describe, expect, it } from "vitest";

import { getCrypto } from "@blazetrails/ruby-compat";
import { ActiveSupportJSON } from "./json.js";
import { Encoding } from "./json/encoding.js";
import { InvalidMessage, MessageEncryptor, NullSerializer } from "./message-encryptor.js";
import { MessageVerifier } from "./message-verifier.js";
import type { MessageSerializer } from "./messages/codec.js";
import { Temporal } from "@blazetrails/date";

const JSONSerializer: MessageSerializer = {
  dump(value: unknown): string {
    return ActiveSupportJSON.encode(value);
  },

  load(value: string): unknown {
    return ActiveSupportJSON.decode(value);
  },
};

function munge(base64String: string): string {
  const bits = Buffer.from(base64String, "base64");
  return Buffer.from(bits.reverse()).toString("base64");
}

/**
 * Ruby's `Base64.encode64` line-wraps at 60 characters and appends a trailing
 * newline — the non-strict encoding whose extra characters the "message obeys
 * strict encoding" case relies on.
 */
function encode64(value: string): string {
  const encoded = Buffer.from(value).toString("base64");
  return `${(encoded.match(/.{1,60}/g) ?? []).join("\n")}\n`;
}

describe("MessageEncryptorTest", () => {
  const secret = Buffer.from(getCrypto().randomBytes(32));
  const verifier = new MessageVerifier(secret, { serializer: NullSerializer });
  const encryptor = new MessageEncryptor(secret);
  /**
   * Rails' `@data` also carries a `Time.local(2010)` under `"now"`; a temporal
   * value does not survive the `:json` serializer as a temporal (it decodes back
   * as a string), so it is dropped here — the same adaptation
   * `message-verifier.test.ts` and the shared `messages/message-metadata-tests.ts`
   * `DATA` make.
   */
  const data = { some: "data" };

  function assertAeadNotDecrypted(encryptor: MessageEncryptor, value: string): void {
    expect(() => encryptor.decryptAndVerify(value)).toThrow(InvalidMessage);
  }

  function assertNotDecrypted(value: string): void {
    expect(() => encryptor.decryptAndVerify(verifier.generate(value))).toThrow(InvalidMessage);
  }

  function assertNotVerified(value: string): void {
    expect(() => encryptor.decryptAndVerify(value)).toThrow(InvalidMessage);
  }

  it("encrypting twice yields differing cipher text", () => {
    const firstMessage = encryptor.encryptAndSign(data).split("--")[0];
    const secondMessage = encryptor.encryptAndSign(data).split("--")[0];
    expect(firstMessage).not.toEqual(secondMessage);
  });

  it("messing with either encrypted values causes failure", () => {
    const [text, iv] = (verifier.verify(encryptor.encryptAndSign(data)) as string).split("--") as [
      string,
      string,
    ];
    assertNotDecrypted([iv, text].join("--"));
    assertNotDecrypted([text, munge(iv)].join("--"));
    assertNotDecrypted([munge(text), iv].join("--"));
    assertNotDecrypted([munge(text), munge(iv)].join("--"));
  });

  it("messing with verified values causes failures", () => {
    const [text, iv] = encryptor.encryptAndSign(data).split("--") as [string, string];
    assertNotVerified([iv, text].join("--"));
    assertNotVerified([text, munge(iv)].join("--"));
    assertNotVerified([munge(text), iv].join("--"));
    assertNotVerified([munge(text), munge(iv)].join("--"));
  });

  it("signed round tripping", () => {
    const message = encryptor.encryptAndSign(data);
    expect(encryptor.decryptAndVerify(message)).toEqual(data);
  });

  // Its payload is Marshal-serialized, so it fails at "Unsupported
  // serialization format" — story:
  // message-encryptor-marshal-payload-backwards-compatibility.
  it.skip("backwards compat for 64 bytes key", () => {
    // 64 bit key
    const secret = Buffer.from(
      "3942b1bf81e622559ed509e3ff274a780784fe9e75b065866bd270438c74da822219de3156473cc27df1fd590e4baf68c95eeb537b6e4d4c5a10f41635b5597e",
      "hex",
    );
    // Encryptor with 32 bit key, 64 bit secret for verifier
    const encryptor = new MessageEncryptor(secret.subarray(0, 32), secret);
    // Message generated with 64 bit key
    const message =
      "eHdGeExnZEwvMSt3U3dKaFl1WFo0TjVvYzA0eGpjbm5WSkt5MXlsNzhpZ0ZnbWhBWFlQZTRwaXE1bVJCS2oxMDZhYVp2dVN3V0lNZUlWQ3c2eVhQbnhnVjFmeVVubmhRKzF3WnZyWHVNMDg9LS1HSisyakJVSFlPb05ISzRMaXRzcFdBPT0=--831a1d54a3cda8a0658dc668a03dedcbce13b5ca";
    expect((encryptor.decryptAndVerify(message) as { some: string }).some).toEqual("data");
  });

  it("alternative serialization method", () => {
    const prev = Encoding.useStandardJsonTimeFormat;
    Encoding.useStandardJsonTimeFormat = true;
    try {
      const encryptor = new MessageEncryptor(
        Buffer.from(getCrypto().randomBytes(32)),
        Buffer.from(getCrypto().randomBytes(128)),
        { serializer: JSONSerializer },
      );
      const message = encryptor.encryptAndSign({
        foo: 123,
        bar: Temporal.Instant.from("2010-01-01T00:00:00Z"),
      });
      const exp = { foo: 123, bar: "2010-01-01T00:00:00.000Z" };
      expect(encryptor.decryptAndVerify(message)).toEqual(exp);
    } finally {
      Encoding.useStandardJsonTimeFormat = prev;
    }
  });

  it("message obeys strict encoding", () => {
    const badEncodingCharacters = "\n!@#";
    const [message, iv] = encryptor
      .encryptAndSign("This is a very \n\nhumble string" + badEncodingCharacters)
      .split("--") as [string, string];

    assertNotDecrypted(`${encode64(message)}--${encode64(iv)}`);
    assertNotVerified(`${encode64(message)}--${encode64(iv)}`);

    assertNotDecrypted([iv, message].join(badEncodingCharacters));
    assertNotVerified([iv, message].join(badEncodingCharacters));
  });

  it("supports URL-safe encoding when using authenticated encryption", () => {
    const encryptor = new MessageEncryptor(secret, { url_safe: true, cipher: "aes-256-gcm" });

    // Because encrypted data appears random, we cannot control whether it will
    // contain bytes that _would_ be encoded as non-URL-safe characters (i.e. "+"
    // or "/") if `url_safe: true` were broken.  Therefore, to make our test
    // falsifiable, we use a large string so that the encrypted data will almost
    // certainly contain such bytes.
    const data = "x".repeat(10001);
    const message = encryptor.encryptAndSign(data);

    expect(encryptor.decryptAndVerify(message)).toEqual(data);
    expect(encodeURIComponent(message)).toEqual(message);
  });

  it("supports URL-safe encoding when using unauthenticated encryption", () => {
    const encryptor = new MessageEncryptor(secret, { url_safe: true, cipher: "aes-256-cbc" });

    // When using unauthenticated encryption, messages are double encoded: once
    // when encrypting and once again when signing with a MessageVerifier.  The
    // 1st encode eliminates the possibility of a 6-bit aligned occurrence of
    // `0b111110` or `0b111111`, which the 2nd encode _would_ map to a
    // non-URL-safe character (i.e. "+" or "/") if `url_safe: true` were broken.
    // Therefore, to ensure our test is falsifiable, we also assert that the
    // message payload _would_ have padding characters (i.e. "=") if
    // `url_safe: true` were broken.
    const data = 1;
    const message = encryptor.encryptAndSign(data);

    expect(encryptor.decryptAndVerify(message)).toEqual(data);
    expect(encodeURIComponent(message)).toEqual(message);
    expect(message.slice(0, message.lastIndexOf("--")).length % 4).not.toEqual(0);
  });

  it("aead mode encryption", () => {
    const encryptor = new MessageEncryptor(secret, { cipher: "aes-256-gcm" });
    const message = encryptor.encryptAndSign(data);
    expect(encryptor.decryptAndVerify(message)).toEqual(data);
  });

  it("aead mode with hmac cbc cipher text", () => {
    const encryptor = new MessageEncryptor(secret, { cipher: "aes-256-gcm" });

    assertAeadNotDecrypted(
      encryptor,
      "eHdGeExnZEwvMSt3U3dKaFl1WFo0TjVvYzA0eGpjbm5WSkt5MXlsNzhpZ0ZnbWhBWFlQZTRwaXE1bVJCS2oxMDZhYVp2dVN3V0lNZUlWQ3c2eVhQbnhnVjFmeVVubmhRKzF3WnZyWHVNMDg9LS1HSisyakJVSFlPb05ISzRMaXRzcFdBPT0=--831a1d54a3cda8a0658dc668a03dedcbce13b5ca",
    );
  });

  it("messing with aead values causes failures", () => {
    const encryptor = new MessageEncryptor(secret, { cipher: "aes-256-gcm" });
    const [text, iv, authTag] = encryptor.encryptAndSign(data).split("--") as [
      string,
      string,
      string,
    ];
    assertAeadNotDecrypted(encryptor, [iv, text, authTag].join("--"));
    assertAeadNotDecrypted(encryptor, [munge(text), iv, authTag].join("--"));
    assertAeadNotDecrypted(encryptor, [text, munge(iv), authTag].join("--"));
    assertAeadNotDecrypted(encryptor, [text, iv, munge(authTag)].join("--"));
    assertAeadNotDecrypted(encryptor, [munge(text), munge(iv), munge(authTag)].join("--"));
    assertAeadNotDecrypted(encryptor, [text, iv].join("--"));
    assertAeadNotDecrypted(encryptor, [text, iv, authTag.slice(0, -1)].join("--"));
  });

  // The historic ciphertext decrypts to the Ruby Marshal bytes
  // `\x04\x08I"\x12Ruby on Rails\x06:\x06ET` — an ivar-wrapped Ruby String.
  it.skip("backwards compatibility decrypt previously encrypted messages without metadata", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — marshal
  });

  // No Ruby `#inspect` analogue — same open decision as
  // port-activesupport-message-verifier-tests.
  it.skip("inspect does not show secrets");

  it("invalid base64 argument", () => {
    assertNotDecrypted("jrcc<!--esi-->rkls<!--esx-->tyx9");
  });
});
