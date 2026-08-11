import { describe, it, expect } from "vitest";
import { Scheme } from "./scheme.js";
import { Encryptor } from "./encryptor.js";

describe("ActiveRecord::Encryption::SchemeTest", () => {
  // scheme.rb:32-33 builds an Encryptor only on `unless @compress` / `if compressor`.
  // With the defaults nothing is installed into @context_properties, so the
  // surrounding context's own encryptor is the one that runs.
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
});
