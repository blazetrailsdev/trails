import { describe, it, expect } from "vitest";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { SignedGlobalID } from "./signed-global-id.js";

function makeVerifier(secret = "test-secret"): MessageVerifier {
  return new MessageVerifier(secret, { digest: "sha256", url_safe: true });
}

const fakeModel = { id: 42, constructor: { name: "User" } };

describe("SignedGlobalID", () => {
  it("round-trips create → parse", () => {
    const verifier = makeVerifier();
    const sgid = SignedGlobalID.create(fakeModel, { verifier });
    const token = sgid.toString();
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);

    const parsed = SignedGlobalID.parse(token, { verifier });
    expect(parsed).not.toBeNull();
    expect(parsed!.uri).toContain("User/42");
    expect(parsed!.purpose).toBe("default");
  });

  it("toParam equals toString", () => {
    const verifier = makeVerifier();
    const sgid = SignedGlobalID.create(fakeModel, { verifier });
    expect(sgid.toParam()).toBe(sgid.toString());
  });

  it("caches the signed token", () => {
    const verifier = makeVerifier();
    const sgid = SignedGlobalID.create(fakeModel, { verifier });
    expect(sgid.toString()).toBe(sgid.toString());
  });

  it("returns null for tampered token", () => {
    const verifier = makeVerifier();
    const sgid = SignedGlobalID.create(fakeModel, { verifier });
    const token = sgid.toString();
    const tampered = token.slice(0, -4) + "xxxx";
    expect(SignedGlobalID.parse(tampered, { verifier })).toBeNull();
  });

  it("returns null for wrong verifier", () => {
    const v1 = makeVerifier("secret-1");
    const v2 = makeVerifier("secret-2");
    const sgid = SignedGlobalID.create(fakeModel, { verifier: v1 });
    const token = sgid.toString();
    expect(SignedGlobalID.parse(token, { verifier: v2 })).toBeNull();
  });

  it("returns null for purpose mismatch", () => {
    const verifier = makeVerifier();
    const sgid = SignedGlobalID.create(fakeModel, { verifier, purpose: "login" });
    const token = sgid.toString();
    expect(SignedGlobalID.parse(token, { verifier, purpose: "default" })).toBeNull();
    expect(SignedGlobalID.parse(token, { verifier, purpose: "login" })).not.toBeNull();
  });

  it("returns null for expired token (expiresIn)", () => {
    const verifier = makeVerifier();
    const past = Temporal.Now.instant().add({ milliseconds: -1000 });
    const sgid = SignedGlobalID.create(fakeModel, { verifier, expiresAt: past });
    const token = sgid.toString();
    expect(SignedGlobalID.parse(token, { verifier })).toBeNull();
  });

  it("encodes expiresAt in the token", () => {
    const verifier = makeVerifier();
    const future = Temporal.Now.instant().add({ seconds: 3600 });
    const sgid = SignedGlobalID.create(fakeModel, { verifier, expiresAt: future });
    expect(sgid.expiresAt).toBeDefined();
    const token = sgid.toString();
    const parsed = SignedGlobalID.parse(token, { verifier });
    expect(parsed).not.toBeNull();
  });

  it("respects expiresIn (seconds)", () => {
    const verifier = makeVerifier();
    const sgid = SignedGlobalID.create(fakeModel, { verifier, expiresIn: 3600 });
    expect(sgid.expiresAt).toBeDefined();
    const token = sgid.toString();
    expect(SignedGlobalID.parse(token, { verifier })).not.toBeNull();
  });

  it("includes app in URI when provided", () => {
    const verifier = makeVerifier();
    const sgid = SignedGlobalID.create(fakeModel, { verifier, app: "MyApp" });
    expect(sgid.uri).toBe("gid://MyApp/User/42");
  });

  it("uses getApp() when no app option", () => {
    const verifier = makeVerifier();
    const sgid = SignedGlobalID.create(fakeModel, { verifier });
    // no app configured — fallback URI
    expect(sgid.uri).toContain("User/42");
  });
});
