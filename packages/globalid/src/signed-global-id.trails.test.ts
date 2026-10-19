import { GlobalID } from "./global-id.js";
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { assertEqual } from "@blazetrails/activesupport";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { Temporal } from "@blazetrails/activesupport/temporal";
import {
  SignedGlobalID,
  ExpiredMessage,
  _resetSignedGlobalIDClassConfig,
} from "./signed-global-id.js";

function makeVerifier(secret = "test-secret"): MessageVerifier {
  return new MessageVerifier(secret, { digest: "sha256", url_safe: true });
}

const person = (id: unknown = 5) => ({ id, constructor: { name: "Person" } });
const TEST_APP = "bcx";

describe("SignedGlobalIDExpirationTest", () => {
  beforeEach(() => GlobalID.setApp(TEST_APP));
  afterEach(() => (GlobalID["_app"] = undefined));

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
});

describe("SignedGlobalIDCustomParamsTest", () => {
  beforeEach(() => GlobalID.setApp(TEST_APP));
  afterEach(() => (GlobalID["_app"] = undefined));

  it("purpose key flows through as a URI param (not reserved)", () => {
    const verifier = makeVerifier();
    const sgid = SignedGlobalID.create(person(5), { verifier, purpose: "vip" });
    expect(sgid.params!.get("purpose")).toBe("vip");
    expect(sgid.purpose).toBe("default");
  });
});

describe("SignedGlobalID (non-Rails coverage)", () => {
  beforeEach(() => GlobalID.setApp(TEST_APP));
  afterEach(() => (GlobalID["_app"] = undefined));

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

  describe("GlobalID.app integration", () => {
    beforeEach(() => (GlobalID["_app"] = undefined));
    afterEach(() => (GlobalID["_app"] = undefined));

    it("uses GlobalID.app when no app option", () => {
      GlobalID.setApp("ConfiguredApp");
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

describe("SignedGlobalID pick_purpose explicit-null semantics", () => {
  const verifier = new MessageVerifier("test-secret", { digest: "sha256", url_safe: true });
  const person = { id: 5, constructor: { name: "Person" } };

  beforeEach(() => GlobalID.setApp("bcx"));
  afterEach(() => (GlobalID["_app"] = undefined));

  it("pickPurpose returns null for an explicit for: null", () => {
    expect(SignedGlobalID.pickPurpose({ for: null })).toBeNull();
  });

  it("pickPurpose applies the default only when the key is absent", () => {
    expect(SignedGlobalID.pickPurpose({})).toBe("default");
    expect(SignedGlobalID.pickPurpose({ for: undefined })).toBe("default");
    expect(SignedGlobalID.pickPurpose({ for: "login" })).toBe("login");
  });

  it("an SGID signed with for: null does not verify against the default purpose", () => {
    const sgid = SignedGlobalID.create(person, { verifier, for: null });
    expect(sgid.purpose).toBeNull();
    expect(SignedGlobalID.parse(sgid.toString(), { verifier })).toBeNull();
    assertEqual(sgid.uri, SignedGlobalID.parse(sgid.toString(), { verifier, for: null })?.uri);
  });
});

describe("SignedGlobalID.parse verifier resolution", () => {
  const verifier = new MessageVerifier("test-secret", { digest: "sha256", url_safe: true });
  const person = { id: 5, constructor: { name: "Person" } };

  beforeEach(() => GlobalID.setApp("bcx"));
  afterEach(() => (GlobalID["_app"] = undefined));

  it("parse raises when no verifier is configured", () => {
    const sgid = SignedGlobalID.create(person, { verifier });
    expect(() => SignedGlobalID.parse(sgid.toString())).toThrow(
      /Pass a `verifier:` option .* SignedGlobalID\.verifier/,
    );
  });

  it("parse raises when a signed payload carries an unparseable expires_at", () => {
    const sgid = verifier.generate(
      { gid: "gid://bcx/Person/5", purpose: "default", expires_at: "not-a-time" },
      { purpose: "default" },
    );
    expect(() => SignedGlobalID.parse(sgid, { verifier })).toThrow();
  });
});

describe("SignedGlobalID implicit string coercion", () => {
  const verifier = new MessageVerifier("test-secret", { digest: "sha256", url_safe: true });
  const person = { id: 5, constructor: { name: "Person" } };

  beforeEach(() => GlobalID.setApp("bcx"));
  afterEach(() => (GlobalID["_app"] = undefined));

  it("interpolation and String() reach toString without a toPrimitive hook", () => {
    const sgid = SignedGlobalID.create(person, { verifier });
    expect(`${sgid}`).toBe(sgid.toString());
    expect(String(sgid)).toBe(sgid.toString());
    expect(sgid + "").toBe(sgid.toString());
  });
});
