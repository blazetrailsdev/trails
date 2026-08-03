import { beforeEach, describe, expect, it } from "vitest";
import { RotationConfiguration } from "./rotation-configuration.js";

describe("MessagesRotationConfiguration", () => {
  let config: RotationConfiguration;

  beforeEach(() => {
    config = new RotationConfiguration();
  });

  it("signed configurations", () => {
    config.rotate("signed", "older secret", { salt: "salt", digest: "SHA1" });
    config.rotate("signed", "old secret", { salt: "salt", digest: "SHA256" });

    expect(config.signed).toEqual([
      ["older secret", { salt: "salt", digest: "SHA1" }],
      ["old secret", { salt: "salt", digest: "SHA256" }],
    ]);
  });

  it("encrypted configurations", () => {
    config.rotate("encrypted", "old raw key", { cipher: "aes-256-gcm" });

    expect(config.encrypted).toEqual([["old raw key", { cipher: "aes-256-gcm" }]]);
  });
});
