import { beforeEach, describe, expect, it } from "vitest";
import { InvalidMessage, MessageEncryptor } from "./message-encryptor.js";
import { MessageEncryptors } from "./message-encryptors.js";
import { rotationCoordinatorTests } from "./messages/rotation-coordinator-tests.js";
import type { SecretGenerator } from "./messages/rotation-coordinator.js";

/** Rails' `"".ljust(secret_length, salt)`. */
const SECRET_GENERATOR: SecretGenerator = (salt, { secretLength }) =>
  salt.repeat(secretLength as number).slice(0, secretLength as number);

describe("MessageEncryptorsTest", () => {
  const makeCoordinator = (): MessageEncryptors => new MessageEncryptors(SECRET_GENERATOR);

  const roundtrip = (
    message: string,
    encryptor: MessageEncryptor,
    decryptor: MessageEncryptor = encryptor,
  ): unknown => {
    try {
      return decryptor.decryptAndVerify(encryptor.encryptAndSign(message));
    } catch (error) {
      if (error instanceof InvalidMessage) return null;
      throw error;
    }
  };

  const kwargSecretGenerator = (): SecretGenerator =>
    Object.assign(
      (_salt: string, { secretLength, foo, bar }: Record<string, unknown>) =>
        (foo as string)[bar as number].repeat(secretLength as number),
      { parameters: ["foo", "bar"] as const },
    );

  let coordinator: MessageEncryptors;

  beforeEach(() => {
    coordinator = makeCoordinator().rotateDefaults();
  });

  rotationCoordinatorTests<MessageEncryptor>({ makeCoordinator, roundtrip });

  it("can override secret generator", () => {
    const secretGenerator: SecretGenerator = (salt, { secretLength }) =>
      salt[0].repeat(secretLength as number);
    const other = makeCoordinator().rotate({ secretGenerator });

    expect(roundtrip("message", other.get("salt"))).toEqual("message");
    expect(roundtrip("message", coordinator.get("salt"), other.get("salt"))).toBeNull();
  });

  it("supports arbitrary secret generator kwargs", () => {
    const other = new MessageEncryptors(kwargSecretGenerator());
    other.rotate({ foo: "foo", bar: 0 });

    expect(roundtrip("message", other.get("salt"))).toEqual("message");
  });

  it("supports arbitrary secret generator kwargs when using #rotate block", () => {
    const other = new MessageEncryptors(kwargSecretGenerator());
    other.rotate(() => ({ foo: "foo", bar: 0 }));

    expect(roundtrip("message", other.get("salt"))).toEqual("message");
  });

  it("supports separate secrets for encryption and signing", () => {
    const secretGenerator: SecretGenerator = (salt, options) => [
      SECRET_GENERATOR(salt, options),
      "signing secret",
    ];
    const other = new MessageEncryptors(secretGenerator);
    other.rotateDefaults();

    expect(roundtrip("message", other.get("salt"))).toEqual("message");
    expect(roundtrip("message", coordinator.get("salt"), other.get("salt"))).toBeNull();
  });
});
