import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";
import { FatalWarning, Lint, MockRequest, RACK_ERRORS, Response, Utils } from "@blazetrails/rack";
import {
  ArgumentError,
  Base64,
  JSON,
  Marshal,
  OpenSSL,
  SecureRandom,
  Zlib,
  pack,
  rbFArray,
  rbInspect,
  rbObjAsString,
  rbObjDup,
  stderr,
  type StringIO,
} from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionHash } from "./index.js";
import { Cookie } from "./index.js";
import { mustBe, wontBe } from "./test-helpers/assertions.js";

describe("Rack::Session::Cookie", () => {
  const incrementor = async (env: RackEnv): Promise<RackResponse> => {
    const session = env["rack.session"] as SessionHash;
    if (session.get("counter") == null) session.set("counter", 0);
    session.set("counter", (session.get("counter") as number) + 1);
    const hash = rbObjDup(session);
    hash.delete("session_id");
    return new Response(hash.inspect()).toArray();
  };

  const sessionId = async (env: RackEnv): Promise<RackResponse> =>
    new Response(rbInspect((env["rack.session"] as SessionHash).toHash())).toArray();

  const sessionOption =
    (opt: string) =>
    async (env: RackEnv): Promise<RackResponse> =>
      new Response(
        rbInspect((env["rack.session.options"] as Record<string, unknown>)[opt]),
      ).toArray();

  const nothing = async (_env: RackEnv): Promise<RackResponse> => new Response("Nothing").toArray();

  const renewer = async (env: RackEnv): Promise<RackResponse> => {
    (env["rack.session.options"] as Record<string, unknown>)["renew"] = true;
    return new Response("Nothing").toArray();
  };

  const onlySessionId = async (env: RackEnv): Promise<RackResponse> =>
    new Response(rbObjAsString((env["rack.session"] as SessionHash).get("session_id"))).toArray();

  const bigcookie = async (env: RackEnv): Promise<RackResponse> => {
    (env["rack.session"] as SessionHash).set("cookie", "big".repeat(3000));
    return new Response((env["rack.session"] as SessionHash).inspect()).toArray();
  };

  const destroySession = async (env: RackEnv): Promise<RackResponse> => {
    await (env["rack.session"] as SessionHash).destroy();
    return new Response("Nothing").toArray();
  };

  const responseFor = (options: Record<string, unknown> = {}) => {
    const requestOptions = (options["request"] ?? {}) as Record<string, unknown>;
    const cookie =
      options["cookie"] instanceof Response
        ? options["cookie"].getHeader("Set-Cookie")
        : options["cookie"];
    requestOptions["HTTP_COOKIE"] = cookie || "";

    const cookieApp = new Cookie(
      ...(rbFArray(options["app"]) as [RackApp, Record<string, unknown>?]),
    );
    const appWithCookie = new Lint((env: RackEnv) => cookieApp.call(env));
    return new MockRequest((env) => appWithCookie.call(env) as Promise<RackResponse>).get(
      "/",
      requestOptions,
    );
  };

  const randomEncryptorSecret = () => SecureRandom.randomBytes(64);

  let secret: Uint8Array;
  let warnings: string[];

  beforeEach(() => {
    secret = randomEncryptorSecret();

    warnings = [];
    vi.spyOn(stderr, "write").mockImplementation((m: string) => {
      warnings.push(m);
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Base64", () => {
    it("uses base64 to encode", () => {
      const coder = new Cookie.Base64();
      const str = "fuuuuu";
      expect(coder.encode(str)).toEqual(pack([str], "m0"));
    });

    it("uses base64 to decode", () => {
      const coder = new Cookie.Base64();
      const str = pack(["fuuuuu"], "m0");
      expect(coder.decode(str)).toEqual(Base64.strictDecode64(str));
    });

    it("handles non-strict base64 encoding", () => {
      const coder = new Cookie.Base64();
      const str = pack(["A".repeat(256)], "m");
      expect(coder.decode(str)).toEqual("A".repeat(256));
    });

    describe("Marshal", () => {
      it("marshals and base64 encodes", () => {
        const coder = new Cookie.Base64.Marshal();
        const str = "fuuuuu";
        expect(coder.encode(str)).toEqual(pack([Marshal.dump(str)], "m0"));
      });

      it("marshals and base64 decodes", () => {
        const coder = new Cookie.Base64.Marshal();
        const str = pack([Marshal.dump("fuuuuu")], "m0");
        expect(coder.decode(str)).toEqual(Marshal.load(Base64.strictDecode64(str)));
      });

      it("rescues failures on decode", () => {
        const coder = new Cookie.Base64.Marshal();
        expect(coder.decode("lulz")).toBeNull();
      });
    });

    describe("JSON", () => {
      it("JSON and base64 encodes", () => {
        const coder = new Cookie.Base64.JSON();
        const obj = ["fuuuuu"];
        expect(coder.encode(obj)).toEqual(pack([JSON.dump(obj)], "m0"));
      });

      it("JSON and base64 decodes", () => {
        const coder = new Cookie.Base64.JSON();
        const str = pack([JSON.dump(["fuuuuu"])], "m0");
        expect(coder.decode(str)).toEqual(JSON.parse(Base64.strictDecode64(str)));
      });

      it("rescues failures on decode", () => {
        const coder = new Cookie.Base64.JSON();
        expect(coder.decode("lulz")).toBeNull();
      });
    });

    describe("ZipJSON", () => {
      it("jsons, deflates, and base64 encodes", () => {
        const coder = new Cookie.Base64.ZipJSON();
        const obj = ["fuuuuu"];
        const json = JSON.dump(obj);
        expect(coder.encode(obj)).toEqual(pack([Zlib.Deflate.deflate(json)], "m0"));
      });

      it("base64 decodes, inflates, and decodes json", () => {
        const coder = new Cookie.Base64.ZipJSON();
        const obj = ["fuuuuu"];
        const json = JSON.dump(obj);
        const b64 = pack([Zlib.Deflate.deflate(json)], "m0");
        expect(coder.decode(b64)).toEqual(obj);
      });

      it("rescues failures on decode", () => {
        const coder = new Cookie.Base64.ZipJSON();
        expect(coder.decode("lulz")).toBeNull();
      });
    });
  });

  it("warns if no secret is given", () => {
    new Cookie(incrementor);
    expect(warnings[0]).toMatch(/no secret/i);
    warnings.length = 0;
    new Cookie(incrementor, { secrets: secret });
    mustBe(warnings, "isEmpty");
  });

  it("abort if secret is too short", () => {
    expect(() => new Cookie(incrementor, { secrets: secret.subarray(0, 16) })).toThrow(
      ArgumentError,
    );
  });

  it("doesn't warn if coder is configured to handle encoding", () => {
    new Cookie(incrementor, { coder: {}, letCoderHandleSecureEncoding: true });
    mustBe(warnings, "isEmpty");
  });

  it("still warns if coder is not set", () => {
    new Cookie(incrementor, { letCoderHandleSecureEncoding: true });
    expect(warnings[0]).toMatch(/no secret/i);
  });

  it("uses a coder", async () => {
    const identity = new (class {
      calls: string[] = [];

      encode(hash: unknown) {
        this.calls.push("encode");
        return JSON.dump(hash);
      }
      decode(str: string) {
        this.calls.push("decode");
        return JSON.parse(str);
      }
    })();
    const response = await responseFor({ app: [incrementor, { coder: identity }] });

    expect(response.getHeader("Set-Cookie")).toContain("rack.session=");
    expect(response.body).toEqual(rbInspect({ counter: 1 }));
    expect(identity.calls).toEqual(["encode"]);

    await responseFor({
      app: [incrementor, { coder: identity }],
      cookie: (response.getHeader("Set-Cookie") as string).split(";", 2)[0],
    });
    expect(identity.calls).toEqual(["encode", "decode", "encode"]);
  });

  it("creates a new cookie", async () => {
    const response = await responseFor({ app: incrementor });
    expect(response.getHeader("Set-Cookie")).toContain("rack.session=");
    expect(response.body).toEqual(rbInspect({ counter: 1 }));
  });

  it("passes through same_site option to session cookie", async () => {
    const response = await responseFor({ app: [incrementor, { sameSite: ":none" }] });
    expect(response.getHeader("Set-Cookie")).toMatch(/SameSite=None/i);
  });

  it("allows using a lambda to specify same_site option, because some browsers require different settings", async () => {
    let response = await responseFor({ app: [incrementor, { sameSite: () => ":none" }] });
    expect(response.getHeader("Set-Cookie")).toMatch(/SameSite=None/i);

    response = await responseFor({ app: [incrementor, { sameSite: () => ":lax" }] });
    expect(response.getHeader("Set-Cookie")).toMatch(/SameSite=Lax/i);
  });

  it("loads from a cookie", async () => {
    let response = await responseFor({ app: incrementor });

    response = await responseFor({ app: incrementor, cookie: response });
    expect(response.body).toEqual(rbInspect({ counter: 2 }));

    response = await responseFor({ app: incrementor, cookie: response });
    expect(response.body).toEqual(rbInspect({ counter: 3 }));
  });

  it("renew session id", async () => {
    let response = await responseFor({ app: incrementor });
    let cookie = response.getHeader("Set-Cookie");
    response = await responseFor({ app: onlySessionId, cookie });
    cookie = response.getHeader("Set-Cookie") || cookie;

    expect(response.body).not.toEqual("");
    const oldSessionId = response.body;

    response = await responseFor({ app: renewer, cookie });
    cookie = response.getHeader("Set-Cookie") || cookie;
    response = await responseFor({ app: onlySessionId, cookie });

    expect(response.body).not.toEqual("");
    expect(response.body).not.toEqual(oldSessionId);
  });

  it("destroys session", async () => {
    let response = await responseFor({ app: incrementor });
    response = await responseFor({ app: onlySessionId, cookie: response });

    expect(response.body).not.toEqual("");
    const oldSessionId = response.body;

    response = await responseFor({ app: destroySession, cookie: response });
    response = await responseFor({ app: onlySessionId, cookie: response });

    expect(response.body).not.toEqual("");
    expect(response.body).not.toEqual(oldSessionId);
  });

  it("survives broken cookies", async () => {
    let response = await responseFor({ app: incrementor, cookie: "rack.session=blarghfasel" });
    expect(response.body).toEqual(rbInspect({ counter: 1 }));

    response = await responseFor({
      app: [incrementor, { secrets: secret }],
      cookie: "rack.session=",
    });
    expect(response.body).toEqual(rbInspect({ counter: 1 }));
  });

  it("barks on too big cookies", async () => {
    await expect(responseFor({ app: bigcookie, request: { ":fatal": true } })).rejects.toThrow(
      FatalWarning,
    );
  });

  it("loads from a cookie with encryption", async () => {
    let app: unknown = [incrementor, { secrets: secret }];

    let response = await responseFor({ app });
    response = await responseFor({ app, cookie: response });
    expect(response.body).toEqual(rbInspect({ counter: 2 }));

    response = await responseFor({ app, cookie: response });
    expect(response.body).toEqual(rbInspect({ counter: 3 }));

    app = [incrementor, { secrets: randomEncryptorSecret() }];

    response = await responseFor({ app, cookie: response });
    expect(response.body).toEqual(rbInspect({ counter: 1 }));
  });

  it("loads from a cookie with accept-only integrity hash for graceful key rotation", async () => {
    let response = await responseFor({ app: [incrementor, { secrets: secret }] });

    const newSecret = randomEncryptorSecret();

    let app: unknown = [incrementor, { secrets: [newSecret, secret] }];
    response = await responseFor({ app, cookie: response });
    expect(response.body).toEqual(rbInspect({ counter: 2 }));

    const newerSecret = randomEncryptorSecret();

    app = [incrementor, { secrets: [newerSecret, newSecret] }];
    response = await responseFor({ app, cookie: response });

    expect(response.body).toEqual(rbInspect({ counter: 3 }));
  });

  it("loads from a legacy hmac cookie", async () => {
    const legacySession = new Cookie.Base64.Marshal().encode({
      counter: 1,
      session_id: "abcdef",
    });
    const legacySecret = "test legacy secret";
    const legacyDigest = OpenSSL.HMAC.hexdigest(
      OpenSSL.Digest.SHA1.new(),
      legacySecret,
      legacySession,
    );

    const legacyCookie = `rack.session=${legacySession}--${legacyDigest}; path=/; HttpOnly`;

    const app = [incrementor, { secrets: secret, legacyHmacSecret: legacySecret }];
    const response = await responseFor({ app, cookie: legacyCookie });
    expect(response.body).toEqual(rbInspect({ counter: 2 }));
  });

  it("ignores tampered session cookies", async () => {
    const app = [incrementor, { secrets: secret }];

    let response = await responseFor({ app });
    expect(response.body).toEqual(rbInspect({ counter: 1 }));

    response = await responseFor({ app, cookie: response });
    expect(response.body).toEqual(rbInspect({ counter: 2 }));

    const encodedCookie = (response.getHeader("Set-Cookie") as string)
      .split(/=(.*)/s)[1]
      .split(";")[0];
    const decodedCookie = Base64.urlsafeDecode64(Utils.unescape(encodedCookie));

    const m = decodedCookie;
    const tamperedCookie = `rack.session=${Base64.urlsafeEncode64(
      m.slice(0, m.length - 1) + String.fromCharCode(m.charCodeAt(m.length - 1) ^ 1),
    )}`;

    response = await responseFor({ app, cookie: tamperedCookie });
    expect(response.body).toEqual(rbInspect({ counter: 1 }));
  });

  it("rejects session cookie with different purpose", async () => {
    const secrets = null;
    const app = [incrementor, { secrets }];
    const otherApp = [incrementor, { secrets, key: "other" }];

    let response = await responseFor({ app });
    expect(response.body).toEqual(rbInspect({ counter: 1 }));

    response = await responseFor({ app, cookie: response });
    expect(response.body).toEqual(rbInspect({ counter: 2 }));

    response = await responseFor({ app: otherApp, cookie: response });
    expect(response.body).toEqual(rbInspect({ counter: 1 }));
  });

  it("adds to RACK_ERRORS on encryptor errors", async () => {
    const echoRackErrors = async (env: RackEnv): Promise<RackResponse> => {
      const session = env["rack.session"] as SessionHash;
      if (session.get("counter") == null) session.set("counter", 0);
      session.set("counter", (session.get("counter") as number) + 1);
      const errors = env[RACK_ERRORS] as StringIO;
      errors.flush();
      errors.rewind();
      return new Response(errors.read()).toArray();
    };

    const app = [incrementor, { secrets: secret }];
    const errApp = [echoRackErrors, { secrets: secret }];

    let response = await responseFor({ app });
    expect(response.body).toEqual(rbInspect({ counter: 1 }));

    const encodedCookie = (response.getHeader("Set-Cookie") as string)
      .split(/=(.*)/s)[1]
      .split(";")[0];
    const decodedCookie = Base64.urlsafeDecode64(Utils.unescape(encodedCookie));

    const m = decodedCookie;
    const tamperedCookie = `rack.session=${Base64.urlsafeEncode64(m.slice(0, m.length - 1) + "\0")}`;

    response = await responseFor({ app: errApp, cookie: tamperedCookie });
    expect(response.body).toEqual("Session cookie encryptor error: HMAC is invalid\n");
  });

  it("ignores tampered with legacy hmac cookie", async () => {
    const legacySession = new Cookie.Base64.Marshal().encode({
      counter: 1,
      session_id: "abcdef",
    });
    const legacySecret = "test legacy secret";
    const legacyDigest = [
      ...OpenSSL.HMAC.hexdigest(OpenSSL.Digest.SHA1.new(), legacySecret, legacySession),
    ]
      .reverse()
      .join("");

    const legacyCookie = `rack.session=${legacySession}--${legacyDigest}; path=/; HttpOnly`;

    const app = [incrementor, { secret, legacyHmacSecret: legacySecret }];
    const response = await responseFor({ app, cookie: legacyCookie });
    expect(response.body).toEqual(rbInspect({ counter: 1 }));
  });

  it("supports custom digest instance for legacy hmac cookie", async () => {
    const legacyHmac = "SHA256";
    const legacySession = new Cookie.Base64.Marshal().encode({
      counter: 1,
      session_id: "abcdef",
    });
    const legacySecret = "test legacy secret";
    const legacyDigest = OpenSSL.HMAC.hexdigest(legacyHmac, legacySecret, legacySession);
    const legacyCookie = `rack.session=${legacySession}--${legacyDigest}; path=/; HttpOnly`;

    const app = [
      incrementor,
      { secrets: secret, legacyHmacSecret: legacySecret, legacyHmac: legacyHmac },
    ];

    let response = await responseFor({ app, cookie: legacyCookie });
    expect(response.body).toEqual(rbInspect({ counter: 2 }));

    response = await responseFor({ app, cookie: response });
    expect(response.body).toEqual(rbInspect({ counter: 3 }));
  });

  it("can handle Rack::Lint middleware", async () => {
    let response = await responseFor({ app: incrementor });

    const lint = new Lint(sessionId);
    response = await responseFor({ app: (env: RackEnv) => lint.call(env), cookie: response });
    wontBe(response.body, "isNil");
  });

  it("can handle middleware that inspects the env", async () => {
    class TestEnvInspector {
      constructor(private app: RackApp) {}
      call(env: RackEnv) {
        rbInspect(env);
        return this.app(env);
      }
    }

    let response = await responseFor({ app: incrementor });

    const inspector = new TestEnvInspector(sessionId);
    response = await responseFor({
      app: (env: RackEnv) => inspector.call(env),
      cookie: response,
    });
    wontBe(response.body, "isNil");
  });

  it("returns the session id in the session hash", async () => {
    let response = await responseFor({ app: incrementor });
    expect(response.body).toEqual(rbInspect({ counter: 1 }));

    response = await responseFor({ app: sessionId, cookie: response });
    expect(response.body).toMatch(/"session_id"\s*=>/);
    expect(response.body).toMatch(/"counter"\s*=>\s*1/);
  });

  it("does not return a cookie if set to secure but not using ssl", async () => {
    const app = [incrementor, { secure: true }];

    let response = await responseFor({ app });
    expect(response.getHeader("Set-Cookie")).toBeUndefined();

    response = await responseFor({ app, request: { HTTPS: "on" } });
    wontBe(response.getHeader("Set-Cookie"), "isNil");
    expect(response.getHeader("Set-Cookie")).toMatch(/secure/);
  });

  it("does not return a cookie if cookie was not read/written", async () => {
    const response = await responseFor({ app: nothing });
    expect(response.getHeader("Set-Cookie")).toBeUndefined();
  });

  it("does not return a cookie if cookie was not written (only read)", async () => {
    const response = await responseFor({ app: sessionId });
    expect(response.getHeader("Set-Cookie")).toBeUndefined();
  });

  it("returns even if not read/written if :expire_after is set", async () => {
    const app = [nothing, { expireAfter: 3600 }];
    const request = { "rack.session": { not: "empty" } };
    const response = await responseFor({ app, request });
    wontBe(response.getHeader("Set-Cookie"), "isNil");
  });

  it("returns no cookie if no data was written and no session was created previously, even if :expire_after is set", async () => {
    const app = [nothing, { expireAfter: 3600 }];
    const response = await responseFor({ app });
    expect(response.getHeader("Set-Cookie")).toBeUndefined();
  });

  it("exposes :secrets in env['rack.session.option']", async () => {
    const response = await responseFor({ app: [sessionOption("secrets"), { secrets: secret }] });
    expect(response.body).toEqual(rbInspect(secret));
  });

  it("exposes :coder in env['rack.session.option']", async () => {
    const response = await responseFor({ app: sessionOption("coder") });
    expect(response.body).toMatch(/Base64::Marshal/);
  });

  it("exposes correct :coder when a secrets is used", async () => {
    const response = await responseFor({ app: sessionOption("coder"), secrets: secret });
    expect(response.body).toMatch(/Marshal/);
  });

  it("allows passing in a hash with session data from middleware in front", async () => {
    const request = { "rack.session": { foo: "bar" } };
    const response = await responseFor({ app: sessionId, request });
    expect(response.body).toMatch(/foo/);
  });

  it("allows modifying session data with session data from middleware in front", async () => {
    const request = { "rack.session": { foo: "bar" } };
    const response = await responseFor({ app: incrementor, request });
    expect(response.body).toMatch(/counter/);
    expect(response.body).toMatch(/foo/);
  });

  it("allows more than one '--' in the cookie when calculating legacy digests", async () => {
    let counter = 0;
    const app = async (env: RackEnv): Promise<RackResponse> => {
      const session = env["rack.session"] as SessionHash;
      if (session.get("message") == null) session.set("message", "");
      session.set("message", `${session.get("message")}${String((counter += 1))}--`);
      const hash = rbObjDup(session);
      hash.delete("session_id");
      return new Response(hash.get("message") as string).toArray();
    };

    const unsafeCoder = new (class {
      encode(hash: unknown) {
        return JSON.dump(hash);
      }
      decode(str: string | null) {
        if (str) return JSON.parse(str);
      }
    })();

    const legacySession = unsafeCoder.encode({
      message: `${(counter += 1)}--${(counter += 1)}--`,
      session_id: "abcdef",
    });
    const legacySecret = "test legacy secret";
    const legacyDigest = OpenSSL.HMAC.hexdigest(
      OpenSSL.Digest.SHA1.new(),
      legacySecret,
      legacySession,
    );
    const legacyCookie = `rack.session=${Utils.escape(legacySession)}--${legacyDigest}; path=/; HttpOnly`;

    const _app = [
      app,
      { secrets: secret, legacyHmacSecret: legacySecret, legacyHmacCoder: unsafeCoder },
    ];

    const response = await responseFor({ app: _app, cookie: legacyCookie });
    expect(response.body).toEqual("1--2--3--");
  });

  it("allows for non-strict encoded cookie", async () => {
    const longSessionApp = async (env: RackEnv): Promise<RackResponse> => {
      const session = env["rack.session"] as SessionHash;
      session.set("value", "A".repeat(256));
      session.set("counter", 1);
      const hash = rbObjDup(session);
      hash.delete("session_id");
      return new Response(hash.inspect()).toArray();
    };

    const nonStrictCoder = new (class {
      encode(str: unknown) {
        return pack([Marshal.dump(str)], "m");
      }

      decode(str: string | null) {
        if (!str) return;

        return Marshal.load(Base64.decode64(str));
      }
    })();

    const nonStrictResponse = await responseFor({
      app: [longSessionApp, { coder: nonStrictCoder }],
    });

    const response = await responseFor({ app: [incrementor], cookie: nonStrictResponse });

    expect(response.body).toMatch(new RegExp(`"value"\\s*=>\\s*"${"A".repeat(256)}"`));
    expect(response.body).toMatch(/"counter"\s*=>\s*2/);
    expect(response.body).toMatch(/^{[^}]+}$/);
  });
});
