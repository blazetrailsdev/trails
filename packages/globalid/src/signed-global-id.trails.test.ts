import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { SignedGlobalID } from "./signed-global-id.js";
import { setApp, _resetApp } from "./config.js";

// Trails-only coverage: Ruby's `options.fetch :for, DEFAULT_PURPOSE`
// (signed_global_id.rb:24-26) is key-present — an explicit `for: nil` yields
// a nil purpose (purpose verification disabled). The upstream suite has no
// test for the explicit-nil arm, and the idiomatic JS `??` port silently
// coerces null back to the default, so we pin the semantics here.
describe("SignedGlobalID pick_purpose explicit-null semantics", () => {
  const verifier = new MessageVerifier("test-secret", { digest: "sha256", url_safe: true });
  const person = (id: unknown = 5) => ({ id, constructor: { name: "Person" } });

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
    const sgid = SignedGlobalID.create(person(5), { verifier, for: null });
    expect(sgid.purpose).toBeNull();
    expect(SignedGlobalID.parse(sgid.toString(), { verifier })).toBeNull();
    expect(SignedGlobalID.parse(sgid.toString(), { verifier, for: null })?.uri).toBe(sgid.uri);
  });
});
