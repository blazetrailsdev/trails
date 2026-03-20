import { describe, it, expect } from "vitest";
import { DeterministicKeyProvider } from "./deterministic-key-provider.js";
import { Key } from "./key.js";
import { ConfigError } from "./errors.js";

describe("ActiveRecord::Encryption::DeterministicKeyProviderTest", () => {
  it("will raise a configuration error when trying to configure multiple keys", () => {
    const k1 = new Key("secret1");
    const k2 = new Key("secret2");
    expect(() => new DeterministicKeyProvider([k1, k2])).toThrow(ConfigError);
  });
});
