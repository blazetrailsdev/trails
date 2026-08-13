import { describe, it, expect } from "vitest";
import { Scheme } from "./scheme.js";
import { Encryptor } from "./encryptor.js";
import { Contexts } from "./contexts.js";
import { DerivedSecretKeyProvider } from "./derived-secret-key-provider.js";

describe("ActiveRecord::Encryption::SchemeTest (trails)", () => {
  it("builds no encryptor on the default path", () => {
    expect(new Scheme().toH().encryptor).toBeUndefined();
    expect(new Scheme({ deterministic: true }).toH().encryptor).toBeUndefined();
    expect(new Scheme({ compress: true }).toH().encryptor).toBeUndefined();
  });

  it("builds an encryptor when compress is false or a compressor is given", () => {
    expect(new Scheme({ compress: false }).toH().encryptor).toBeInstanceOf(Encryptor);
    expect(
      new Scheme({
        compressor: { deflate: (d: string) => Buffer.from(d), inflate: () => "" },
      }).toH().encryptor,
    ).toBeInstanceOf(Encryptor);
  });

  it("toH emits key_provider, not key, so merge drops a bare key: as Rails does", () => {
    const scheme = new Scheme({ key: "mykey" });
    expect(scheme.keyProvider).toBeInstanceOf(DerivedSecretKeyProvider);

    // scheme.rb:66 emits `key_provider: @key_provider_param`, which is nil when
    // the scheme was declared with `key:` — the derived provider from
    // `key_provider_from_key` (scheme.rb:57, :90) is never serialized, so a
    // merged scheme falls back to the default key provider in Rails too.
    expect(scheme.toH().key).toBeUndefined();
    expect(scheme.toH().keyProvider).toBeUndefined();
    expect(scheme.merge(new Scheme()).keyProvider).not.toBe(scheme.keyProvider);
  });

  it("leaves the surrounding context's encryptor in place on the default path", () => {
    const outer = new Encryptor();
    Contexts.withEncryptionContext({ encryptor: outer }, () => {
      new Scheme().withContext(() => {
        expect(Contexts.context.encryptor).toBe(outer);
      });
    });
  });
});
