import { describe, it } from "vitest";

describe("MessageEncryptorsTest", () => {
  it.skip("can override secret generator");
  it.skip("supports arbitrary secret generator kwargs");
  it.skip("supports arbitrary secret generator kwargs when using #rotate block");
  it.skip("supports separate secrets for encryption and signing");
});

describe("MessageEncryptorRotatorTest", () => {
  it.skip("rotate cipher");
  it.skip("rotate verifier secret when using non-authenticated encryption");
  it.skip("rotate verifier digest when using non-authenticated encryption");
});
