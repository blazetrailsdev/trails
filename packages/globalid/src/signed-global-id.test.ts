import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { SignedGlobalID } from "./signed-global-id.js";
import { setApp, _resetApp } from "./config.js";

function makeVerifier(secret = "test-secret"): MessageVerifier {
  return new MessageVerifier(secret, { digest: "sha256", url_safe: true });
}

const person = (id: unknown = 5) => ({ id, constructor: { name: "Person" } });
const TEST_APP = "bcx";

describe("SignedGlobalIDTest", () => {
  beforeEach(() => setApp(TEST_APP));
  afterEach(() => _resetApp());

  it("as string", () => {
    const verifier = makeVerifier();
    const sgid = SignedGlobalID.create(person(), { verifier });
    const s = sgid.toString();
    expect(typeof s).toBe("string");
    expect(s.length).toBeGreaterThan(0);
    // Round-trip — verify the produced token parses back to the same SGID.
    expect(SignedGlobalID.parse(s, { verifier })!.uri).toBe(sgid.uri);
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

  it("inspect", () => {
    const verifier = makeVerifier();
    const sgid = SignedGlobalID.create(person(5), { verifier });
    expect(sgid.inspect()).toMatch(/^#<SignedGlobalID:0x[0-9a-f]+>$/);
    // Stable per instance — Ruby's object_id doesn't change between calls.
    expect(sgid.inspect()).toBe(sgid.inspect());
    // Distinct instances get distinct ids.
    const other = SignedGlobalID.create(person(5), { verifier });
    expect(sgid.inspect()).not.toBe(other.inspect());
  });
});

describe("SignedGlobalIDPurposeTest", () => {
  beforeEach(() => setApp(TEST_APP));
  afterEach(() => _resetApp());

  it("sign with purpose when :for is provided", () => {
    const verifier = makeVerifier();
    const loginSgid = SignedGlobalID.create(person(5), { verifier, for: "login" });
    const likeSgid = SignedGlobalID.create(person(5), { verifier, for: "like-button" });
    expect(loginSgid.equals(likeSgid)).toBe(false);
  });

  it("sign with default purpose when no :for is provided", () => {
    const verifier = makeVerifier();
    const sgid = SignedGlobalID.create(person(5), { verifier });
    const defaultSgid = SignedGlobalID.create(person(5), { verifier, for: "default" });
    expect(sgid.purpose).toBe("default");
    expect(sgid.equals(defaultSgid)).toBe(true);
  });

  it("create accepts a :for", () => {
    const verifier = makeVerifier();
    const a = SignedGlobalID.create(person(5), { verifier, for: "login" });
    const b = SignedGlobalID.create(person(5), { verifier, for: "login" });
    expect(a.equals(b)).toBe(true);
    expect(a.purpose).toBe("login");
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
    expect(loginSgid.equals(likeSgid)).toBe(false);
    expect(loginSgid.equals(noPurposeSgid)).toBe(false);
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
    const verifier = makeVerifier();
    // Explicitly pass null (not undefined / omitted) to verify Rails parity:
    // `expires_in: nil` means "no expiration", NOT "expire in 0ms".
    const sgid = SignedGlobalID.create(person(5), { verifier, expiresIn: null });
    expect(sgid.expiresAt).toBeUndefined();
    expect(SignedGlobalID.parse(sgid.toString(), { verifier })).not.toBeNull();
  });

  it("passing expires_at sets expiration date", () => {
    const verifier = makeVerifier();
    // Use a millisecond-precision instant so the round-trip is exact
    // (serialization uses smallestUnit: "millisecond" so sub-ms precision
    // is intentionally lost).
    const future = Temporal.Instant.fromEpochMilliseconds(
      Math.floor(Temporal.Now.instant().epochMilliseconds + 3_600_000),
    );
    const sgid = SignedGlobalID.create(person(5), { verifier, expiresAt: future });
    expect(Temporal.Instant.compare(sgid.expiresAt!, future)).toBe(0);
    // Round-trip: the expiresAt survives serialization/parsing.
    const parsed = SignedGlobalID.parse(sgid.toString(), { verifier });
    expect(parsed!.expiresAt).toBeDefined();
    expect(parsed!.expiresAt!.epochMilliseconds).toBe(future.epochMilliseconds);
  });

  it("passing nil expires_at turns off expiration checking", () => {
    const verifier = makeVerifier();
    // Explicitly null (Rails parity, as with expires_in).
    const sgid = SignedGlobalID.create(person(5), { verifier, expiresAt: null });
    expect(sgid.expiresAt).toBeUndefined();
  });

  it("favor expires_at over expires_in", () => {
    const verifier = makeVerifier();
    const future = Temporal.Now.instant().add({ seconds: 3600 });
    // Both supplied — expiresAt wins (Rails parity: pick_expiration prefers
    // expiresAt over expiresIn).
    const sgid = SignedGlobalID.create(person(5), {
      verifier,
      expiresAt: future,
      expiresIn: 1,
    });
    expect(Temporal.Instant.compare(sgid.expiresAt!, future)).toBe(0);
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
});
