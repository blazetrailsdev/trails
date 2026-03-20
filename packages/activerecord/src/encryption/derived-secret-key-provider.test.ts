import { describe, it, expect } from "vitest";
import { DerivedSecretKeyProvider } from "./derived-secret-key-provider.js";
import { Encryptor } from "./encryptor.js";

describe("ActiveRecord::Encryption::DerivedSecretKeyProviderTest", () => {
  it("will derive a key with the right length from the given password", () => {
    const provider = new DerivedSecretKeyProvider("my-password");
    const key = provider.encryptionKey();
    expect(key.secret).toBeTruthy();
    expect(key.secret.length).toBeGreaterThan(0);
  });

  it("work with multiple keys when config.store_key_references is false", () => {
    const provider = new DerivedSecretKeyProvider(["password1", "password2"]);
    const enc = new Encryptor({ compress: false });
    const encrypted = enc.encrypt("hello", { keyProvider: provider });
    const decrypted = enc.decrypt(encrypted, { keyProvider: provider });
    expect(decrypted).toBe("hello");
  });

  it("work with multiple keys when config.store_key_references is true", () => {
    const provider = new DerivedSecretKeyProvider(["password1", "password2"]);
    const enc = new Encryptor({ compress: false });
    const encrypted = enc.encrypt("hello", { keyProvider: provider });
    const decrypted = enc.decrypt(encrypted, { keyProvider: provider });
    expect(decrypted).toBe("hello");
  });
});
