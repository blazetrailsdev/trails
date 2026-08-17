import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { Temporal } from "@blazetrails/activesupport/temporal";
import {
  SignedGlobalID,
  ExpiredMessage,
  _resetSignedGlobalIDClassConfig,
} from "./signed-global-id.js";
import { setApp, _resetApp } from "./config.js";
import { registerConstant, _resetConstants } from "@blazetrails/activesupport";

function makeVerifier(secret = "test-secret"): MessageVerifier {
  return new MessageVerifier(secret, { digest: "sha256", url_safe: true });
}

// Synthetic GlobalIDModel — both real instances and these literals satisfy
// GlobalIDModel's `readonly constructor: { readonly name: string }`.
const person = (id: unknown = 5) => ({ id, constructor: { name: "Person" } });
const TEST_APP = "bcx";

// Minimal Person class used by `model class` test below.
class Person {
  static primaryKey = "id";
  constructor(public id: string) {}
  static async find(id: unknown): Promise<Person> {
    return new Person(String(id));
  }
}

describe("SignedGlobalIDTest", () => {
  beforeEach(() => {
    setApp(TEST_APP);
    registerConstant("Person", Person);
  });
  afterEach(() => {
    _resetApp();
    _resetConstants();
  });

  it("as string", () => {
    const verifier = makeVerifier();
    const sgid = SignedGlobalID.create(person(), { verifier });
    // Rails asserts the exact signed token produced by the vendored test
    // verifier secret. Trails builds a verifier per test, so the token bytes
    // differ; assert the round-trip instead.
    expect(SignedGlobalID.parse(sgid.toString(), { verifier })!.uri).toBe(sgid.uri);
  });

  it("model id", () => {
    const verifier = makeVerifier();
    const sgid = SignedGlobalID.create(person(5), { verifier });
    expect(sgid.modelId).toBe("5");
  });

  it("value equality", () => {
    const verifier = makeVerifier();
    const a = SignedGlobalID.create(person(5), { verifier });
    const b = SignedGlobalID.create(person(5), { verifier });
    expect(a.equals(b)).toBe(true);
  });

  it("to param", () => {
    const verifier = makeVerifier();
    const sgid = SignedGlobalID.create(person(5), { verifier });
    expect(sgid.toParam()).toBe(sgid.toString());
  });

  it("model class", () => {
    const verifier = makeVerifier();
    const sgid = SignedGlobalID.create(person(5), { verifier });
    expect(sgid.modelClass).toBe(Person);
  });

  it("inspect", () => {
    const verifier = makeVerifier();
    const sgid = SignedGlobalID.create(person(5), { verifier });
    expect(sgid.inspect()).toMatch(/^#<SignedGlobalID:0x[0-9a-f]+>$/);
  });
});

describe("SignedGlobalIDPurposeTest", () => {
  beforeEach(() => setApp(TEST_APP));
  afterEach(() => _resetApp());

  it("sign with purpose when :for is provided", () => {
    const verifier = makeVerifier();
    const loginSgid = SignedGlobalID.create(person(5), { verifier, for: "login" });
    const likeSgid = SignedGlobalID.create(person(5), { verifier, for: "like-button" });
    // Rails asserts the exact signed token; trails' per-test verifier secret
    // differs, so assert the round-trip URI instead.
    expect(SignedGlobalID.parse(loginSgid.toString(), { verifier, for: "login" })!.uri).toBe(
      loginSgid.uri,
    );
    expect(loginSgid.equals(likeSgid)).not.toBe(true);
  });

  it("sign with default purpose when no :for is provided", () => {
    const verifier = makeVerifier();
    const sgid = SignedGlobalID.create(person(5), { verifier });
    const defaultSgid = SignedGlobalID.create(person(5), { verifier, for: "default" });
    expect(sgid.purpose).toBe("default");
    expect(sgid.equals(defaultSgid)).toBe(true);
  });

  it("new accepts a :for", () => {
    // Rails: SignedGlobalID.new(Person.new(5).to_gid.uri, for: 'login') —
    // the URI-first initializer form.
    const verifier = makeVerifier();
    const loginSgid = SignedGlobalID.create(person(5), { verifier, for: "login" });
    const expected = new SignedGlobalID(`gid://${TEST_APP}/Person/5`, {
      verifier,
      for: "login",
    });
    expect(loginSgid.equals(expected)).toBe(true);
  });

  it("create accepts a :for", () => {
    const verifier = makeVerifier();
    const a = SignedGlobalID.create(person(5), { verifier, for: "login" });
    const b = SignedGlobalID.create(person(5), { verifier, for: "login" });
    expect(a.equals(b)).toBe(true);
  });

  it("parse returns nil when purpose mismatch", () => {
    const verifier = makeVerifier();
    const loginSgid = SignedGlobalID.create(person(5), { verifier, for: "login" });
    // Default `for` defaults to "default" — mismatches "login".
    expect(SignedGlobalID.parse(loginSgid.toString(), { verifier })).toBeNull();
    expect(SignedGlobalID.parse(loginSgid.toString(), { verifier, for: "like_button" })).toBeNull();
  });

  it("equal only with same purpose", () => {
    const verifier = makeVerifier();
    const loginSgid = SignedGlobalID.create(person(5), { verifier, for: "login" });
    const expected = SignedGlobalID.create(person(5), { verifier, for: "login" });
    const likeSgid = SignedGlobalID.create(person(5), { verifier, for: "like_button" });
    const noPurposeSgid = SignedGlobalID.create(person(5), { verifier });
    expect(loginSgid.equals(expected)).toBe(true);
    expect(loginSgid.equals(likeSgid)).not.toBe(true);
    expect(loginSgid.equals(noPurposeSgid)).not.toBe(true);
  });
});

describe("SignedGlobalIDExpirationTest", () => {
  beforeEach(() => setApp(TEST_APP));
  afterEach(() => _resetApp());

  it("passing expires_in less than a second is not expired", () => {
    // Rails parity: with expires_in: 1.second, the token is not expired at
    // 0.5 seconds elapsed but is expired at 2 seconds. Use fake timers so
    // the test is deterministic — Date.now() drives Temporal.Now via the
    // js-temporal polyfill.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
      const verifier = makeVerifier();
      const sgid = SignedGlobalID.create(person(5), { verifier, expiresIn: 1 });
      vi.setSystemTime(new Date("2024-01-01T00:00:00.500Z"));
      expect(SignedGlobalID.parse(sgid.toString(), { verifier })).not.toBeNull();
      vi.setSystemTime(new Date("2024-01-01T00:00:02.000Z"));
      expect(SignedGlobalID.parse(sgid.toString(), { verifier })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("passing expires_in nil turns off expiration checking", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
      const verifier = makeVerifier();
      SignedGlobalID.expiresIn = 3600;
      const sgid = SignedGlobalID.create(person(5), { verifier, expiresIn: null });

      vi.setSystemTime(new Date("2024-01-01T01:00:00.000Z"));
      expect(SignedGlobalID.parse(sgid.toString(), { verifier })).not.toBeNull();

      vi.setSystemTime(new Date("2024-01-01T02:00:00.000Z"));
      expect(SignedGlobalID.parse(sgid.toString(), { verifier })).not.toBeNull();
    } finally {
      vi.useRealTimers();
      _resetSignedGlobalIDClassConfig();
    }
  });

  it("passing expires_at sets expiration date", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
      const verifier = makeVerifier();
      const date = Temporal.Instant.from("2024-01-01T23:59:59.999Z");
      const sgid = SignedGlobalID.create(person(5), { verifier, expiresAt: date });
      expect(sgid.expiresAt!.epochMilliseconds).toBe(date.epochMilliseconds);

      vi.setSystemTime(new Date("2024-01-02T00:00:00.000Z"));
      expect(SignedGlobalID.parse(sgid.toString(), { verifier })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("passing nil expires_at turns off expiration checking", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
      const verifier = makeVerifier();
      SignedGlobalID.expiresIn = 3600;
      const sgid = SignedGlobalID.create(person(5), { verifier, expiresAt: null });

      vi.setSystemTime(new Date("2024-01-01T04:00:00.000Z"));
      expect(SignedGlobalID.parse(sgid.toString(), { verifier })).not.toBeNull();
    } finally {
      vi.useRealTimers();
      _resetSignedGlobalIDClassConfig();
    }
  });

  it("favor expires_at over expires_in", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
      const verifier = makeVerifier();
      const sgid = SignedGlobalID.create(person(5), {
        verifier,
        expiresAt: Temporal.Instant.from("2024-01-02T23:59:59.999Z"),
        expiresIn: 3600,
      });

      vi.setSystemTime(new Date("2024-01-01T01:00:00.000Z"));
      expect(SignedGlobalID.parse(sgid.toString(), { verifier })).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("expires_at: undefined falls through to expires_in (spread-defaults case)", () => {
    // `{ ...defaults, expiresIn: 60 }` where defaults has expiresAt: undefined
    // should still use expiresIn — undefined means 'omitted', not 'disable'.
    const verifier = makeVerifier();
    const sgid = SignedGlobalID.create(person(5), {
      verifier,
      expiresAt: undefined,
      expiresIn: 3600,
    });
    expect(sgid.expiresAt).toBeDefined();
  });

  it("explicit expires_at: null disables expiration even with expires_in present", () => {
    // Rails: pick_expiration uses options.key?(:expires_at), so an explicit
    // expires_at: nil wins over expires_in — even past expires_in values
    // produce a non-expiring SGID.
    const verifier = makeVerifier();
    const sgid = SignedGlobalID.create(person(5), {
      verifier,
      expiresAt: null,
      expiresIn: -1, // would expire instantly if it won precedence
    });
    expect(sgid.expiresAt).toBeUndefined();
    expect(SignedGlobalID.parse(sgid.toString(), { verifier })).not.toBeNull();
  });

  it("returns null for expired token (expiresAt in the past)", () => {
    const verifier = makeVerifier();
    const past = Temporal.Now.instant().add({ milliseconds: -1000 });
    const sgid = SignedGlobalID.create(person(5), { verifier, expiresAt: past });
    expect(SignedGlobalID.parse(sgid.toString(), { verifier })).toBeNull();
  });

  it("returns null for token expired via expires_in (already-elapsed)", () => {
    const verifier = makeVerifier();
    // Negative expiresIn produces an expiresAt in the past — guarantees the
    // expiresIn codepath actually drives expiration enforcement (without this
    // test, every other expires_in test would pass even if expiresIn were
    // silently ignored).
    const sgid = SignedGlobalID.create(person(5), { verifier, expiresIn: -1 });
    expect(SignedGlobalID.parse(sgid.toString(), { verifier })).toBeNull();
  });

  it("expires_in defaults to class level expiration", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
      const verifier = makeVerifier();
      SignedGlobalID.expiresIn = 3600; // 1 hour class-level default
      const sgid = SignedGlobalID.create(person(5), { verifier });
      vi.setSystemTime(new Date("2024-01-01T00:59:00.000Z"));
      expect(SignedGlobalID.parse(sgid.toString(), { verifier })).not.toBeNull();
      vi.setSystemTime(new Date("2024-01-01T01:01:00.000Z"));
      expect(SignedGlobalID.parse(sgid.toString(), { verifier })).toBeNull();
    } finally {
      vi.useRealTimers();
      _resetSignedGlobalIDClassConfig();
    }
  });

  it("passing in expires_in overrides class level expiration", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
      const verifier = makeVerifier();
      SignedGlobalID.expiresIn = 3600;
      // Per-call expiresIn: 2 hours wins over class-level 1 hour
      const sgid = SignedGlobalID.create(person(5), { verifier, expiresIn: 7200 });
      vi.setSystemTime(new Date("2024-01-01T01:00:00.000Z"));
      expect(SignedGlobalID.parse(sgid.toString(), { verifier })).not.toBeNull();
      vi.setSystemTime(new Date("2024-01-01T02:00:03.000Z"));
      expect(SignedGlobalID.parse(sgid.toString(), { verifier })).toBeNull();
    } finally {
      vi.useRealTimers();
      _resetSignedGlobalIDClassConfig();
    }
  });

  it("passing expires_at overrides class level expires_in", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
      const verifier = makeVerifier();
      SignedGlobalID.expiresIn = 3600;
      // Per-call expiresAt: tomorrow wins over class-level 1 hour
      const date = Temporal.Instant.from("2024-01-02T23:59:59.999Z");
      const sgid = SignedGlobalID.create(person(5), { verifier, expiresAt: date });
      expect(sgid.expiresAt!.epochMilliseconds).toBe(date.epochMilliseconds);

      vi.setSystemTime(new Date("2024-01-01T02:00:00.000Z"));
      expect(SignedGlobalID.parse(sgid.toString(), { verifier })).not.toBeNull();
    } finally {
      vi.useRealTimers();
      _resetSignedGlobalIDClassConfig();
    }
  });
});

describe("SignedGlobalIDCustomParamsTest", () => {
  beforeEach(() => setApp(TEST_APP));
  afterEach(() => _resetApp());

  it("create custom params", () => {
    const verifier = makeVerifier();
    const sgid = SignedGlobalID.create(person(5), { verifier, hello: "world" });
    expect(sgid.params["hello"]).toBe("world");
  });

  it("parse custom params", () => {
    const verifier = makeVerifier();
    const sgid = SignedGlobalID.create(person(5), { verifier, hello: "world" });
    const parsed = SignedGlobalID.parse(sgid.toString(), { verifier });
    expect(parsed!.params["hello"]).toBe("world");
  });

  it("purpose key flows through as a URI param (not reserved)", () => {
    // Rails GlobalID.create strips only (:app, :verifier, :for); any other
    // key — including :purpose — flows through to URI params. The internal
    // @purpose attr is set via pick_purpose(:for), not from this URI param.
    const verifier = makeVerifier();
    const sgid = SignedGlobalID.create(person(5), { verifier, purpose: "vip" });
    expect(sgid.params["purpose"]).toBe("vip");
    expect(sgid.purpose).toBe("default");
  });
});

describe("SignedGlobalID (non-Rails coverage)", () => {
  beforeEach(() => setApp(TEST_APP));
  afterEach(() => _resetApp());

  it("modelName getter delegates to parseGid", () => {
    const verifier = makeVerifier();
    expect(SignedGlobalID.create(person(5), { verifier }).modelName).toBe("Person");
    expect(
      SignedGlobalID.create({ id: 1, constructor: { name: "Account" } }, { verifier }).modelName,
    ).toBe("Account");
  });

  it("parse returns null for a signed-but-malformed URI", () => {
    // Hand-craft a payload with a gid:// prefix but no model id. The
    // verifier would happily sign it, but parse() must reject so that
    // modelId / modelName accessors never throw on a returned SGID.
    const verifier = makeVerifier();
    const malformedToken = verifier.generate(
      { gid: "gid://app/Person", purpose: "default", expires_at: null },
      { purpose: "default" },
    );
    expect(SignedGlobalID.parse(malformedToken, { verifier })).toBeNull();
  });

  it("returns null for tampered token", () => {
    const verifier = makeVerifier();
    const sgid = SignedGlobalID.create(person(5), { verifier });
    const tampered = sgid.toString().slice(0, -4) + "xxxx";
    expect(SignedGlobalID.parse(tampered, { verifier })).toBeNull();
  });

  it("returns null for wrong verifier", () => {
    const v1 = makeVerifier("secret-1");
    const v2 = makeVerifier("secret-2");
    const sgid = SignedGlobalID.create(person(5), { verifier: v1 });
    expect(SignedGlobalID.parse(sgid.toString(), { verifier: v2 })).toBeNull();
  });

  it("caches the signed token", () => {
    const verifier = makeVerifier();
    const sgid = SignedGlobalID.create(person(5), { verifier });
    expect(sgid.toString()).toBe(sgid.toString());
  });

  it("includes app in URI when provided", () => {
    const verifier = makeVerifier();
    const sgid = SignedGlobalID.create(person(5), { verifier, app: "MyApp" });
    expect(sgid.uri).toBe("gid://MyApp/Person/5");
  });

  describe("getApp() integration", () => {
    beforeEach(() => _resetApp());
    afterEach(() => _resetApp());

    it("uses getApp() when no app option", () => {
      setApp("ConfiguredApp");
      const verifier = makeVerifier();
      const sgid = SignedGlobalID.create(person(5), { verifier });
      expect(sgid.uri).toBe("gid://ConfiguredApp/Person/5");
    });

    it("throws when no app configured and no app option", () => {
      const verifier = makeVerifier();
      expect(() => SignedGlobalID.create(person(5), { verifier })).toThrow(/app is required/i);
    });
  });

  describe("class-level verifier config (Rails: SignedGlobalID.verifier=)", () => {
    afterEach(() => _resetSignedGlobalIDClassConfig());

    it("create uses class-level verifier when none in options", () => {
      const v = makeVerifier();
      SignedGlobalID.verifier = v;
      const sgid = SignedGlobalID.create(person(5));
      // Token verifies with the class-level verifier (no option needed).
      const parsed = SignedGlobalID.parse(sgid.toString());
      expect(parsed).not.toBeNull();
      expect(parsed!.uri).toBe("gid://bcx/Person/5");
    });

    it("pickVerifier throws when neither option nor class-level is set", () => {
      expect(() => SignedGlobalID.pickVerifier({})).toThrow(
        /Pass a `verifier:` option .* SignedGlobalID\.verifier/,
      );
    });

    it("per-call verifier wins over class-level", () => {
      const classV = makeVerifier("class-secret");
      const callV = makeVerifier("call-secret");
      SignedGlobalID.verifier = classV;
      const sgid = SignedGlobalID.create(person(5), { verifier: callV });
      // Class-level verifier can't verify a token signed with a different one.
      expect(SignedGlobalID.parse(sgid.toString())).toBeNull();
      expect(SignedGlobalID.parse(sgid.toString(), { verifier: callV })).not.toBeNull();
    });
  });

  describe("verify dispatch + raiseIfExpired (Rails private class methods)", () => {
    it("verify dispatches to verifyWithVerifierValidatedMetadata first", () => {
      const verifier = makeVerifier();
      const sgid = SignedGlobalID.create(person(5), { verifier });
      const result = SignedGlobalID.verify(sgid.toString(), { verifier });
      expect(result).not.toBeNull();
      expect(result!.uri).toBe("gid://bcx/Person/5");
    });

    it("verifyWithLegacySelfValidatedMetadata always returns null (Trails has no legacy SGIDs)", () => {
      const verifier = makeVerifier();
      const sgid = SignedGlobalID.create(person(5), { verifier });
      expect(
        SignedGlobalID.verifyWithLegacySelfValidatedMetadata(sgid.toString(), { verifier }),
      ).toBeNull();
    });

    it("raiseIfExpired throws ExpiredMessage for past timestamps", () => {
      expect(() => SignedGlobalID.raiseIfExpired("2020-01-01T00:00:00.000Z")).toThrow(
        ExpiredMessage,
      );
    });

    it("raiseIfExpired is a no-op for future timestamps and null", () => {
      expect(() => SignedGlobalID.raiseIfExpired("2099-01-01T00:00:00.000Z")).not.toThrow();
      expect(() => SignedGlobalID.raiseIfExpired(null)).not.toThrow();
      expect(() => SignedGlobalID.raiseIfExpired(undefined)).not.toThrow();
    });
  });
});
