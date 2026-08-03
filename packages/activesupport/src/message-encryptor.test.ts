import { describe, expect, it } from "vitest";
import { InvalidMessage, MessageEncryptor } from "./message-encryptor.js";

function munge(base64String: string): string {
  const bits = Buffer.from(base64String, "base64");
  return Buffer.from(bits.reverse()).toString("base64");
}

describe("MessageEncryptorTest", () => {
  const secret = "a".repeat(32);
  const data = { some: "data" };

  function assertAeadNotDecrypted(encryptor: MessageEncryptor, value: string): void {
    expect(() => encryptor.decryptAndVerify(value)).toThrow(InvalidMessage);
  }

  it.skip("inspect does not show secrets");

  it("aead mode encryption", () => {
    const encryptor = new MessageEncryptor(secret, { cipher: "aes-256-gcm" });
    const message = encryptor.encryptAndSign(data);
    expect(encryptor.decryptAndVerify(message)).toEqual(data);
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
});
