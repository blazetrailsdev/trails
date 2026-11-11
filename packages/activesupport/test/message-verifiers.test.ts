import { beforeEach, describe, expect, it } from "vitest";
import type { MessageVerifier } from "../lib/message-verifier.js";
import { MessageVerifiers } from "../lib/message-verifiers.js";
import { rotationCoordinatorTests } from "../lib/messages/rotation-coordinator-tests.js";
import type { SecretGenerator } from "../lib/messages/rotation-coordinator.js";
import { assertNil } from "../lib/testing/assertions.js";

describe("MessageVerifiersTest", () => {
  const makeCoordinator = (): MessageVerifiers => new MessageVerifiers((salt) => salt.repeat(10));

  const roundtrip = (
    message: string,
    signer: MessageVerifier,
    verifier: MessageVerifier = signer,
  ): unknown => verifier.verified(signer.generate(message));

  const kwargSecretGenerator =
    (): SecretGenerator =>
    (_salt: string, { foo, bar = null }: Record<string, unknown>) =>
      `${foo as string}${bar as string}`;

  let coordinator: MessageVerifiers;

  beforeEach(() => {
    coordinator = makeCoordinator().rotateDefaults();
  });

  rotationCoordinatorTests<MessageVerifier>({ makeCoordinator, roundtrip });

  it("can override secret generator", () => {
    const secretGenerator: SecretGenerator = (salt) => `${salt}!`;
    const other = makeCoordinator().rotate({ secretGenerator });

    expect(roundtrip("message", other.get("salt"))).toEqual("message");
    assertNil(roundtrip("message", coordinator.get("salt"), other.get("salt")));
  });

  it("supports arbitrary secret generator kwargs", () => {
    const other = new MessageVerifiers(kwargSecretGenerator());
    other.rotate({ foo: "foo", bar: "bar" });

    expect(roundtrip("message", other.get("salt"))).toEqual("message");
  });

  it("supports arbitrary secret generator kwargs when using #rotate block", () => {
    const other = new MessageVerifiers(kwargSecretGenerator());
    other.rotate(() => ({ foo: "foo", bar: "bar" }));

    expect(roundtrip("message", other.get("salt"))).toEqual("message");
  });
});
