import { describe, expect, it } from "vitest";

import { MessageVerifier } from "../message-verifier.js";
import { rotationCoordinatorTests } from "./rotation-coordinator-tests.js";
import { RotationCoordinator, type BuildOptions } from "./rotation-coordinator.js";

/**
 * `RotationCoordinator` is abstract and Rails covers it only through
 * `MessageVerifiers` / `MessageEncryptors`. This stands in for them so the
 * base class itself is exercised directly.
 */
class VerifierCoordinator extends RotationCoordinator<MessageVerifier> {
  protected build(salt: string, options: BuildOptions): MessageVerifier {
    const { secretGenerator, secretGeneratorOptions, ...rest } = options;
    return new MessageVerifier(
      secretGenerator(salt, secretGeneratorOptions) as string,
      rest as ConstructorParameters<typeof MessageVerifier>[1],
    );
  }
}

describe("RotationCoordinator", () => {
  rotationCoordinatorTests<MessageVerifier>({
    makeCoordinator: () => new VerifierCoordinator((salt) => `secret for ${salt}`),

    roundtrip(message, codec, otherCodec = codec) {
      return otherCodec.verified(codec.generate(message));
    },
  });

  it("stringifies a symbol salt before building", () => {
    const salts: string[] = [];
    const coordinator = new VerifierCoordinator((salt) => {
      salts.push(salt);
      return `secret for ${salt}`;
    }).rotateDefaults();

    coordinator.get(Symbol.for("salt"));

    expect(salts).toEqual(["salt"]);
  });

  it("requires a secret generator", () => {
    expect(() => new VerifierCoordinator()).toThrow("A secret generator block is required");
  });
});
