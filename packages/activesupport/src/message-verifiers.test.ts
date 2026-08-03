import { beforeEach, describe, expect, it } from "vitest";
import type { MessageVerifier } from "./message-verifier.js";
import { MessageVerifiers } from "./message-verifiers.js";
import type { SecretGenerator } from "./messages/rotation-coordinator.js";

describe("MessageVerifiersTest", () => {
  const makeCoordinator = (): MessageVerifiers => new MessageVerifiers((salt) => salt.repeat(10));

  const roundtrip = (
    message: string,
    signer: MessageVerifier,
    verifier: MessageVerifier = signer,
  ): unknown => verifier.verified(signer.generate(message));

  const kwargSecretGenerator = (): SecretGenerator =>
    Object.assign(
      (_salt: string, { foo, bar }: Record<string, unknown>) => `${foo as string}${bar as string}`,
      { parameters: ["foo", "bar"] as const },
    );

  let coordinator: MessageVerifiers;

  beforeEach(() => {
    coordinator = makeCoordinator().rotateDefaults();
  });

  it("can override secret generator", () => {
    const secretGenerator: SecretGenerator = (salt) => `${salt}!`;
    const other = makeCoordinator().rotate({ secretGenerator });

    expect(roundtrip("message", other.get("salt"))).toEqual("message");
    expect(roundtrip("message", coordinator.get("salt"), other.get("salt"))).toBeNull();
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
