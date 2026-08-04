import { describe } from "vitest";

import { InvalidMessage, MessageEncryptor } from "./message-encryptor.js";
import { MessageEncryptors } from "./message-encryptors.js";
import { rotationCoordinatorTests } from "./messages/rotation-coordinator-tests.js";

/**
 * Rails' `MessageEncryptorsTest` does `include RotationCoordinatorTests`; the
 * shared module's tests are not part of `message_encryptors_test.rb` itself, so
 * they run from here rather than from `message-encryptors.test.ts`.
 */
describe("MessageEncryptorsTest", () => {
  rotationCoordinatorTests<MessageEncryptor>({
    makeCoordinator: () =>
      new MessageEncryptors((salt, { secretLength }) =>
        salt.repeat(secretLength as number).slice(0, secretLength as number),
      ),

    roundtrip(message, encryptor, decryptor = encryptor) {
      try {
        return decryptor.decryptAndVerify(encryptor.encryptAndSign(message));
      } catch (error) {
        if (error instanceof InvalidMessage) return null;
        throw error;
      }
    },
  });
});
