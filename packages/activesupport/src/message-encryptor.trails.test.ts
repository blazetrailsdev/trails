import { afterEach, describe, expect, it } from "vitest";
import { InvalidMessage, MessageEncryptor } from "./message-encryptor.js";

// Rails only exercises `default_cipher` /
// `use_authenticated_message_encryption` through
// MessageEncryptorRotatorTest, which needs `rotate` (unported). Cover the
// class attribute directly until those tests land.
describe("MessageEncryptor default cipher", () => {
  const secret = "a".repeat(32);
  const data = { some: "data" };

  afterEach(() => {
    MessageEncryptor.useAuthenticatedMessageEncryption = false;
  });

  it("defaults to aes-256-cbc", () => {
    expect(MessageEncryptor.defaultCipher()).toBe("aes-256-cbc");
  });

  it("defaults to aes-256-gcm when using authenticated message encryption", () => {
    MessageEncryptor.useAuthenticatedMessageEncryption = true;
    expect(MessageEncryptor.defaultCipher()).toBe("aes-256-gcm");
  });

  it("round trips with either default cipher", () => {
    for (const authenticated of [false, true]) {
      MessageEncryptor.useAuthenticatedMessageEncryption = authenticated;
      const encryptor = new MessageEncryptor(secret);
      expect(encryptor.decryptAndVerify(encryptor.encryptAndSign(data))).toEqual(data);
    }
  });

  it("cannot decrypt an authenticated message with the unauthenticated cipher", () => {
    const gcm = new MessageEncryptor(secret, { cipher: "aes-256-gcm" });
    const cbc = new MessageEncryptor(secret, { cipher: "aes-256-cbc" });
    expect(() => cbc.decryptAndVerify(gcm.encryptAndSign(data))).toThrow(InvalidMessage);
  });
});
