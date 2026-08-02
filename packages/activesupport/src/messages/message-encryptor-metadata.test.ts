import { describe } from "vitest";

import { getCrypto } from "../crypto-adapter.js";
import { MessageEncryptor } from "../message-encryptor.js";
import { InvalidSignature } from "../message-verifier.js";
import { messageMetadataTests } from "./message-metadata-tests.js";

describe("MessageEncryptorMetadataTest", () => {
  const secret = getCrypto().randomBytes(32);

  messageMetadataTests<MessageEncryptor>({
    makeCodec: (serializer) => new MessageEncryptor(secret, { serializer }),
    encode: (data, encryptor, options) => encryptor.encryptAndSign(data, options),
    decode: (message, encryptor, options) => {
      try {
        return encryptor.decryptAndVerify(message, options);
      } catch (error) {
        if (error instanceof InvalidSignature) return null;
        throw error;
      }
    },
  });
});
