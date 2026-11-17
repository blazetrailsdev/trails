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

describe("OpenSSL::SSL::SSLSocket", () => {
  function signedDer(cn: string, san: string | null): Uint8Array {
    const key = new OpenSSL.PKey.RSA(2048);
    const cert = new OpenSSL.X509.Certificate();
    cert.version = 2;
    cert.serial = 1;
    cert.subject = cert.issuer = OpenSSL.X509.Name.parse(`/CN=${cn}`);
    cert.publicKey = key.publicKey;
    cert.notBefore = new Date(Date.now() - 3600 * 1000);
    cert.notAfter = new Date(Date.now() + 3600 * 1000);
    if (san !== null) {
      cert.addExtension(new OpenSSL.X509.ExtensionFactory().createExtension("subjectAltName", san));
    }
    cert.sign(key, OpenSSL.Digest.SHA256);
    return cert._der!;
  }

  function fakeIo(der: Uint8Array | null, seen: { session?: Uint8Array | null } = {}) {
    return {
      cipher: ["TLS_AES_128_GCM_SHA256", "TLSv1.3", 128, 128],
      close() {},
      async startSsl(options: import("../lib/http-adapter.js").HttpSslOptions) {
        seen.session = options.session;
        options.sessionNewCb!(Uint8Array.of(1, 2, 3));
        options.peerCertCb!(der);
      },
    } as never;
  }

  function verifyNone() {
    const context = new OpenSSL.SSL.SSLContext();
    context.setParams({ verifyMode: OpenSSL.SSL.VERIFY_NONE });
    return context;
  }

  it("post_connection_check matches a subjectAltName dNSName, wildcard and iPAddress", async () => {
    const der = signedDer("ignored", "DNS:*.example.com,IP:10.0.0.1");
    const ssl = new OpenSSL.SSL.SSLSocket(fakeIo(der), verifyNone());
    await ssl.connect();
    expect(ssl.postConnectionCheck("www.example.com")).toBe(true);
    expect(ssl.postConnectionCheck("10.0.0.1")).toBe(true);
    expect(() => ssl.postConnectionCheck("ignored")).toThrow(
      'hostname "ignored" does not match the server certificate',
    );
    expect(() => ssl.postConnectionCheck("a.b.example.com")).toThrow(OpenSSL.SSL.SSLError);
  });

  it("post_connection_check falls back to the subject CN and raises without a peer cert", async () => {
    const ssl = new OpenSSL.SSL.SSLSocket(fakeIo(signedDer("Host.Example", null)), verifyNone());
    await ssl.connect();
    expect(ssl.postConnectionCheck("host.example")).toBe(true);

    const none = new OpenSSL.SSL.SSLSocket(fakeIo(null), verifyNone());
    await none.connect();
    expect(() => none.postConnectionCheck("host.example")).toThrow(
      "Peer verification enabled, but no certificate received.",
    );
  });

  it("session= resumes the session the context's session_new_cb received", async () => {
    const context = verifyNone();
    let cached: InstanceType<typeof OpenSSL.SSL.Session> | null = null;
    context.sessionNewCb = (_sock, sess) => (cached = sess);
    await new OpenSSL.SSL.SSLSocket(fakeIo(null), context).connect();
    expect(cached!._der).toEqual(Uint8Array.of(1, 2, 3));

    const seen: { session?: Uint8Array | null } = {};
    const ssl = new OpenSSL.SSL.SSLSocket(fakeIo(null, seen), context);
    ssl.session = cached!;
    await ssl.connect();
    expect(seen.session).toEqual(Uint8Array.of(1, 2, 3));
  });

  it("verify_hostname and verify_wildcard follow RFC 6125", () => {
    const { verifyHostname, verifyWildcard } = OpenSSL.SSL;
    expect(verifyHostname("www.example.com", "*.example.com")).toBe(true);
    expect(verifyHostname("example.com", "*.example.com")).toBe(false);
    expect(verifyHostname("foo.example.com", "f*.example.com")).toBe(true);
    expect(verifyHostname("xn--abc.example.com", "x*.example.com")).toBe(false);
    expect(verifyWildcard("foo", "*")).toBe(true);
    expect(verifyWildcard("foo", "f*o*")).toBe(false);
  });
});
