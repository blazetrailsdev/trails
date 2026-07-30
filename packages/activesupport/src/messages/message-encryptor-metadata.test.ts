import { describe, expect, it } from "vitest";

import { getCrypto } from "../crypto-adapter.js";
import { MessageEncryptor } from "../message-encryptor.js";
import { eachScenario as eachSerializerScenario, freezeTime } from "./message-metadata-tests.js";

describe("MessageEncryptorMetadataTest", () => {
  const secret = getCrypto().randomBytes(32);
  const data = { a_number: 123, an_object: { key: "value" } };

  const eachScenario = (block: (encryptor: MessageEncryptor) => void): void =>
    eachSerializerScenario((serializer) => new MessageEncryptor(secret, { serializer }), block);

  it("message :purpose must match specified :purpose", () => {
    eachScenario((encryptor) => {
      expect(
        encryptor.decryptAndVerify(encryptor.encryptAndSign(data, { purpose: "x" }), {
          purpose: "x",
        }),
      ).toEqual(data);

      expect(
        encryptor.decryptAndVerify(encryptor.encryptAndSign(data, { purpose: "x" }), {
          purpose: "y",
        }),
      ).toBeNull();
      expect(
        encryptor.decryptAndVerify(encryptor.encryptAndSign(data, { purpose: "x" })),
      ).toBeNull();
      expect(
        encryptor.decryptAndVerify(encryptor.encryptAndSign(data), { purpose: "x" }),
      ).toBeNull();
    });
  });

  it("message expires with :expires_in", () => {
    freezeTime((travel) => {
      eachScenario((encryptor) => {
        const message = encryptor.encryptAndSign(data, { expiresIn: 1 });

        travel({ milliseconds: 500 });
        expect(encryptor.decryptAndVerify(message)).toEqual(data);

        travel({ milliseconds: 500 });
        expect(encryptor.decryptAndVerify(message)).toBeNull();
      });
    });
  });
});
