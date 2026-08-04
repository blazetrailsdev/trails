import { describe, expect, it } from "vitest";

import { MessageVerifiers } from "./message-verifiers.js";

/**
 * `RotationCoordinator` behaviour Rails covers implicitly through Ruby
 * semantics, so `rotation_coordinator_tests.rb` never asserts it: `salt.to_s`
 * (rotation_coordinator.rb:82,84) and the missing-block `ArgumentError`
 * (rotation_coordinator.rb:11). `MessageVerifiers` is the simplest concrete
 * subclass to exercise them through.
 */
describe("MessageVerifiersTest", () => {
  it("stringifies a symbol salt before building", () => {
    const salts: string[] = [];
    const coordinator = new MessageVerifiers((salt) => {
      salts.push(salt);
      return salt.repeat(10);
    }).rotateDefaults();

    coordinator.get(Symbol.for("salt"));

    expect(salts).toEqual(["salt"]);
  });

  it("requires a secret generator", () => {
    expect(() => new MessageVerifiers()).toThrow("A secret generator block is required");
  });
});
