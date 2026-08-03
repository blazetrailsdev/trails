import { describe, it } from "vitest";

import { getCrypto } from "../crypto-adapter.js";
import { InvalidMessage, MessageEncryptor } from "../message-encryptor.js";
import { extractOptions } from "../hash-utils.js";
import {
  assertRotate,
  messageRotatorTests,
  type RotatorCodecHooks,
} from "./message-rotator-tests.js";

describe("MessageEncryptorRotatorTest", () => {
  const secrets = new Map<string, Buffer>();

  const secret = (key: string): Buffer => {
    let value = secrets.get(key);
    if (!value) {
      value = getCrypto().randomBytes(32);
      secrets.set(key, value);
    }
    return value;
  };

  const hooks: RotatorCodecHooks<MessageEncryptor> = {
    secret,

    makeCodec(...args: unknown[]): MessageEncryptor {
      const [positional, options] = extractOptions(args);
      return new MessageEncryptor(
        (positional[0] as Buffer) ?? secret("secret"),
        positional[1] as Buffer | undefined,
        options,
      );
    },

    encode(data: unknown, encryptor: MessageEncryptor, options = {}): string {
      return encryptor.encryptAndSign(data, options);
    },

    decode(message: string, encryptor: MessageEncryptor, options = {}): unknown {
      try {
        return encryptor.decryptAndVerify(message, options);
      } catch (error) {
        if (error instanceof InvalidMessage) return null;
        throw error;
      }
    },
  };

  messageRotatorTests(hooks);

  it("rotate cipher", () => {
    assertRotate(hooks, [{ cipher: "aes-256-gcm" }], [[{ cipher: "aes-256-cbc" }]]);
  });

  it("rotate verifier secret when using non-authenticated encryption", () => {
    assertRotate(
      hooks,
      [secret("encryption"), secret("new verifier")],
      [
        [secret("encryption"), secret("old verifier")],
        [secret("encryption"), secret("older verifier")],
      ],
    );
  });

  it("rotate verifier digest when using non-authenticated encryption", () => {
    assertRotate(hooks, [{ digest: "SHA256" }], [[{ digest: "SHA1" }], [{ digest: "MD5" }]]);
  });
});
