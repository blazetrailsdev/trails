import { describe, it, expect } from "vitest";
import "./index.js";
import { fixtures } from "../test-helpers/use-fixtures.js";
import { Book } from "../test-helpers/models/book.js";
import { Scheme } from "./scheme.js";
import { Encryptor } from "./encryptor.js";
import { Configuration } from "./errors.js";
import { DerivedSecretKeyProvider } from "./derived-secret-key-provider.js";

function declareEncryptsWith(options: Record<string, unknown>): unknown {
  class Sub extends Book {}
  Sub.encrypts("name", options);
  return Sub.typeForAttribute("name");
}

function assertInvalidDeclaration(options: Record<string, unknown>): void {
  expect(() => declareEncryptsWith(options)).toThrow(Configuration);
}

function assertValidDeclaration(options: Record<string, unknown>): void {
  expect(() => declareEncryptsWith(options)).not.toThrow();
}

describe("ActiveRecord::Encryption::SchemeTest", () => {
  fixtures({});

  it("validates config options when using encrypted attributes", () => {
    const zlib = { deflate: () => Buffer.alloc(0), inflate: () => Buffer.alloc(0) };
    assertInvalidDeclaration({ deterministic: false, ignoreCase: true });
    assertInvalidDeclaration({
      key: "1234",
      keyProvider: new DerivedSecretKeyProvider("my secret"),
    });
    assertInvalidDeclaration({ compress: false, compressor: zlib });
    assertInvalidDeclaration({ compressor: zlib, encryptor: new Encryptor() });

    assertValidDeclaration({ deterministic: true });
    assertValidDeclaration({ key: "1234" });
    assertValidDeclaration({ keyProvider: new DerivedSecretKeyProvider("my secret") });
  });

  it("should create a encryptor well when compressor is given", () => {
    const customCompressor = {
      deflate: (data: string) => Buffer.from(data),
      inflate: (data: Buffer | Uint8Array) => Buffer.from(data),
    };
    const scheme = new Scheme({ compressor: customCompressor });
    expect((scheme.toH().encryptor as Encryptor).compressor).toBe(customCompressor);
  });

  it("should create a encryptor well when compress is false", () => {
    const scheme = new Scheme({ compress: false });
    expect((scheme.toH().encryptor as Encryptor).isCompress()).toBeFalsy();
  });
});
