import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { SignedGlobalID } from "./signed-global-id.js";
import { setApp, _resetApp } from "./config.js";

describe("SignedGlobalID pick_purpose explicit-null semantics", () => {
  const verifier = new MessageVerifier("test-secret", { digest: "sha256", url_safe: true });
  const person = { id: 5, constructor: { name: "Person" } };

  beforeEach(() => setApp("bcx"));
  afterEach(() => _resetApp());

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
    expect(SignedGlobalID.parse(sgid.toString(), { verifier, for: null })?.uri).toBe(sgid.uri);
  });
});

describe("SignedGlobalID.parse verifier resolution", () => {
  const verifier = new MessageVerifier("test-secret", { digest: "sha256", url_safe: true });
  const person = { id: 5, constructor: { name: "Person" } };

  beforeEach(() => setApp("bcx"));
  afterEach(() => _resetApp());

  it("parse raises when no verifier is configured", () => {
    // The verify helpers swallow every error to return null, so without an
    // explicit check `parse` would report a missing verifier as an invalid
    // token. Rails raises — pick_verifier's ArgumentError is not rescued.
    const sgid = SignedGlobalID.create(person, { verifier });
    expect(() => SignedGlobalID.parse(sgid.toString())).toThrow(
      /Pass a `verifier:` option .* SignedGlobalID\.verifier/,
    );
  });
});

describe("SignedGlobalID implicit string coercion", () => {
  const verifier = new MessageVerifier("test-secret", { digest: "sha256", url_safe: true });
  const person = { id: 5, constructor: { name: "Person" } };

  beforeEach(() => setApp("bcx"));
  afterEach(() => _resetApp());

  // Ruby reaches `to_s` whenever an SGID is interpolated. JS already routes
  // string coercion to `toString()` for a plain class, so no explicit
  // `Symbol.toPrimitive` hook is needed to match — this pins that.
  it("interpolation and String() reach toString without a toPrimitive hook", () => {
    const sgid = SignedGlobalID.create(person, { verifier });
    expect(`${sgid}`).toBe(sgid.toString());
    expect(String(sgid)).toBe(sgid.toString());
    expect(sgid + "").toBe(sgid.toString());
  });
});
