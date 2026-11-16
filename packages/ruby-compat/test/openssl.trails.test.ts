import { describe, expect, it } from "vitest";

import { Digest } from "../lib/digest.js";
import { OpenSSL } from "../lib/openssl.js";

describe("OpenSSL::Digest", () => {
  it("seats constants distinct from Digest's, each named by its own path", () => {
    for (const algorithm of ["MD5", "SHA1", "SHA256"] as const) {
      expect(OpenSSL.Digest[algorithm]).not.toBe(Digest[algorithm]);
      expect(OpenSSL.Digest[algorithm].name).toBe(`OpenSSL::Digest::${algorithm}`);
      expect(OpenSSL.Digest[algorithm].hexdigest("abc")).toBe(Digest[algorithm].hexdigest("abc"));
    }
  });

  it("OpenSSL::Random.random_bytes answers that many bytes, different each call", () => {
    const bytes = OpenSSL.Random.randomBytes(16);
    expect(bytes.length).toBe(16);
    expect(OpenSSL.Random.randomBytes(16).toString("hex")).not.toBe(bytes.toString("hex"));
  });
});

describe("OpenSSL::SSL::SSLContext", () => {
  it("set_params options is Ruby's unsigned DEFAULT_PARAMS value", () => {
    const context = new OpenSSL.SSL.SSLContext();
    expect(context.options).toBe(OpenSSL.SSL.OP_ALL);
    context.setParams();
    expect(context.options).toBe(0x80020050);
  });

  it("set_params hands min_version and ssl_version to the handshake as protocol bounds", async () => {
    const context = new OpenSSL.SSL.SSLContext();
    context.setParams({ minVersion: "TLS1_2", verifyMode: OpenSSL.SSL.VERIFY_NONE });
    expect(await context._setup()).toEqual({
      ca: null,
      defaultPaths: false,
      minVersion: "TLSv1.2",
    });

    const pinned = new OpenSSL.SSL.SSLContext();
    pinned.setParams({ sslVersion: "TLSv1_2", verifyMode: OpenSSL.SSL.VERIFY_NONE });
    expect(await pinned._setup()).toEqual({
      ca: null,
      defaultPaths: false,
      minVersion: "TLSv1.2",
      maxVersion: "TLSv1.2",
    });
  });

  it("ssl_version= raises ArgumentError for an unknown method", () => {
    const context = new OpenSSL.SSL.SSLContext();
    expect(() => (context.sslVersion = "TLSv9")).toThrow("unknown SSL method `TLSv9'");
  });
});

describe("OpenSSL::X509::Name", () => {
  it("parse encodes C as a PrintableString and CN as a UTF8String", () => {
    const der = OpenSSL.X509.Name.parse("/C=US/CN=x")._toDer();
    expect([...der.slice(11, 13)]).toEqual([0x13, 2]);
    expect(der.at(-3)).toBe(0x0c);
  });
});
