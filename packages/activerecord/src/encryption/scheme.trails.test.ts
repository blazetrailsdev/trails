import { describe, it, expect } from "vitest";
import { Scheme } from "./scheme.js";
import { Encryptor } from "./encryptor.js";
import { Contexts } from "./contexts.js";

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

  it("leaves the surrounding context's encryptor in place on the default path", () => {
    const outer = new Encryptor();
    Contexts.withEncryptionContext({ encryptor: outer }, () => {
      new Scheme().withContext(() => {
        expect(Contexts.context.encryptor).toBe(outer);
      });
    });
  });
});
