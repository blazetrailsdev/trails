import { describe, expect, it } from "vitest";

import { MessageVerifiers } from "./message-verifiers.js";

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
