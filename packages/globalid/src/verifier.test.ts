import { describe, it, expect } from "vitest";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { Verifier } from "./verifier.js";

const SECRET = "muchSECRETsoHIDDEN";

describe("VerifierTest", () => {
  it("generates URL-safe messages", () => {
    const verifier = new Verifier(SECRET);
    const token = verifier.generate({ gid: "gid://bcx/Person/115186", expires_at: null });
    // URL-safe = no `+`, `/`, or `=` padding chars. Token shape is
    // `<encoded>--<signature>`; signature is hex so never contains those.
    expect(token).not.toMatch(/[+/=]/);
  });

  it("verifies URL-safe messages", () => {
    const verifier = new Verifier(SECRET);
    const payload = { gid: "gid://bcx/Person/115186", expires_at: null };
    const token = verifier.generate(payload);
    expect(verifier.verified(token)).toEqual(payload);
  });

  it("verifies non-URL-safe messages", () => {
    // Older callers may have issued tokens with standard base64 encoding
    // (containing +, /, = chars). Build one via a non-urlsafe
    // MessageVerifier with the same secret, then verify it via our
    // URL-safe Verifier — the shared decode path normalizes both forms
    // before validating the signature.
    const verifier = new Verifier(SECRET);
    const nonUrlSafe = new MessageVerifier(SECRET, { digest: "sha256", url_safe: false });
    const payload = { gid: "gid://bcx/Person/115186?expires_in", expires_at: null };
    const stdToken = nonUrlSafe.generate(payload);
    expect(verifier.verified(stdToken)).toEqual(payload);
  });
});
