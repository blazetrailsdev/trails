import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { travelBack, travelTo } from "@blazetrails/activesupport";
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

const person = (id: unknown = 5) => ({ id, constructor: { name: "Person" } });
const TEST_APP = "bcx";

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
    expect(SignedGlobalID.parse(sgid.toString(), { verifier })!.uri).toEqual(sgid.uri);
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
    expect(SignedGlobalID.parse(loginSgid.toString(), { verifier, for: "login" })!.uri).toEqual(
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
    try {
      travelTo("2024-01-01T00:00:00.000Z", { withUsec: true });
      const verifier = makeVerifier();
      const sgid = SignedGlobalID.create(person(5), { verifier, expiresIn: 1 });
      travelTo("2024-01-01T00:00:00.500Z", { withUsec: true });
      expect(SignedGlobalID.parse(sgid.toString(), { verifier })).not.toBeNull();
      travelTo("2024-01-01T00:00:02.000Z", { withUsec: true });
      expect(SignedGlobalID.parse(sgid.toString(), { verifier })).toBeNull();
    } finally {
      travelBack();
    }
  });

  it("passing expires_in nil turns off expiration checking", () => {
    try {
      travelTo("2024-01-01T00:00:00.000Z", { withUsec: true });
      const verifier = makeVerifier();
      SignedGlobalID.expiresIn = 3600;
      const sgid = SignedGlobalID.create(person(5), { verifier, expiresIn: null });

      travelTo("2024-01-01T01:00:00.000Z", { withUsec: true });
      expect(SignedGlobalID.parse(sgid.toString(), { verifier })).not.toBeNull();

      travelTo("2024-01-01T02:00:00.000Z", { withUsec: true });
      expect(SignedGlobalID.parse(sgid.toString(), { verifier })).not.toBeNull();
    } finally {
      travelBack();
      _resetSignedGlobalIDClassConfig();
    }
  });

  it("passing expires_at sets expiration date", () => {
    try {
      travelTo("2024-01-01T00:00:00.000Z", { withUsec: true });
      const verifier = makeVerifier();
      const date = Temporal.Instant.from("2024-01-01T23:59:59.999Z");
      const sgid = SignedGlobalID.create(person(5), { verifier, expiresAt: date });
      expect(sgid.expiresAt!.epochMilliseconds).toBe(date.epochMilliseconds);

      travelTo("2024-01-02T00:00:00.000Z", { withUsec: true });
      expect(SignedGlobalID.parse(sgid.toString(), { verifier })).toBeNull();
    } finally {
      travelBack();
    }
  });

  it("passing nil expires_at turns off expiration checking", () => {
    try {
      travelTo("2024-01-01T00:00:00.000Z", { withUsec: true });
      const verifier = makeVerifier();
      SignedGlobalID.expiresIn = 3600;
      const sgid = SignedGlobalID.create(person(5), { verifier, expiresAt: null });

      travelTo("2024-01-01T04:00:00.000Z", { withUsec: true });
      expect(SignedGlobalID.parse(sgid.toString(), { verifier })).not.toBeNull();
    } finally {
      travelBack();
      _resetSignedGlobalIDClassConfig();
    }
  });

  it("favor expires_at over expires_in", () => {
    try {
      travelTo("2024-01-01T00:00:00.000Z", { withUsec: true });
      const verifier = makeVerifier();
      const sgid = SignedGlobalID.create(person(5), {
        verifier,
        expiresAt: Temporal.Instant.from("2024-01-02T23:59:59.999Z"),
        expiresIn: 3600,
      });

      travelTo("2024-01-01T01:00:00.000Z", { withUsec: true });
      expect(SignedGlobalID.parse(sgid.toString(), { verifier })).not.toBeNull();
    } finally {
      travelBack();
    }
  });

  it("expires_at: undefined falls through to expires_in (spread-defaults case)", () => {
    const verifier = makeVerifier();
    const sgid = SignedGlobalID.create(person(5), {
      verifier,
      expiresAt: undefined,
      expiresIn: 3600,
    });
    expect(sgid.expiresAt).toBeDefined();
  });

  it("explicit expires_at: null disables expiration even with expires_in present", () => {
    const verifier = makeVerifier();
    const sgid = SignedGlobalID.create(person(5), {
      verifier,
      expiresAt: null,
      expiresIn: -1,
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
    const sgid = SignedGlobalID.create(person(5), { verifier, expiresIn: -1 });
    expect(SignedGlobalID.parse(sgid.toString(), { verifier })).toBeNull();
  });

  it("expires_in defaults to class level expiration", () => {
    try {
      travelTo("2024-01-01T00:00:00.000Z", { withUsec: true });
      const verifier = makeVerifier();
      SignedGlobalID.expiresIn = 3600;
      const sgid = SignedGlobalID.create(person(5), { verifier });
      travelTo("2024-01-01T00:59:00.000Z", { withUsec: true });
      expect(SignedGlobalID.parse(sgid.toString(), { verifier })).not.toBeNull();
      travelTo("2024-01-01T01:01:00.000Z", { withUsec: true });
      expect(SignedGlobalID.parse(sgid.toString(), { verifier })).toBeNull();
    } finally {
      travelBack();
      _resetSignedGlobalIDClassConfig();
    }
  });

  it("passing in expires_in overrides class level expiration", () => {
    try {
      travelTo("2024-01-01T00:00:00.000Z", { withUsec: true });
      const verifier = makeVerifier();
      SignedGlobalID.expiresIn = 3600;
      const sgid = SignedGlobalID.create(person(5), { verifier, expiresIn: 7200 });
      travelTo("2024-01-01T01:00:00.000Z", { withUsec: true });
      expect(SignedGlobalID.parse(sgid.toString(), { verifier })).not.toBeNull();
      travelTo("2024-01-01T02:00:03.000Z", { withUsec: true });
      expect(SignedGlobalID.parse(sgid.toString(), { verifier })).toBeNull();
    } finally {
      travelBack();
      _resetSignedGlobalIDClassConfig();
    }
  });

  it("passing expires_at overrides class level expires_in", () => {
    try {
      travelTo("2024-01-01T00:00:00.000Z", { withUsec: true });
      const verifier = makeVerifier();
      SignedGlobalID.expiresIn = 3600;
      const date = Temporal.Instant.from("2024-01-02T23:59:59.999Z");
      const sgid = SignedGlobalID.create(person(5), { verifier, expiresAt: date });
      expect(sgid.expiresAt!.epochMilliseconds).toBe(date.epochMilliseconds);

      travelTo("2024-01-01T02:00:00.000Z", { withUsec: true });
      expect(SignedGlobalID.parse(sgid.toString(), { verifier })).not.toBeNull();
    } finally {
      travelBack();
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
    expect(sgid.uri.toString()).toBe("gid://MyApp/Person/5");
  });

  describe("getApp() integration", () => {
    beforeEach(() => _resetApp());
    afterEach(() => _resetApp());

    it("uses getApp() when no app option", () => {
      setApp("ConfiguredApp");
      const verifier = makeVerifier();
      const sgid = SignedGlobalID.create(person(5), { verifier });
      expect(sgid.uri.toString()).toBe("gid://ConfiguredApp/Person/5");
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
      const parsed = SignedGlobalID.parse(sgid.toString());
      expect(parsed).not.toBeNull();
      expect(parsed!.uri.toString()).toBe("gid://bcx/Person/5");
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
