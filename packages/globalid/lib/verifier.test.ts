import { describe, it, expect } from "vitest";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { Verifier } from "./verifier.js";

const SECRET = "muchSECRETsoHIDDEN";

describe("VerifierTest", () => {
  it("generates URL-safe messages", () => {
    const verifier = new Verifier(SECRET);
    const token = verifier.generate({ gid: "gid://bcx/Person/115186", expires_at: null });
    expect(token).not.toMatch(/[+/]/);
  });

  it("verifies URL-safe messages", () => {
    const verifier = new Verifier(SECRET);
    const payload = { gid: "gid://bcx/Person/115186", expires_at: null };
    const token = verifier.generate(payload);
    expect(verifier.verified(token)).toEqual(payload);
  });

  it("verifies non-URL-safe messages", () => {
    const verifier = new Verifier(SECRET);
    const nonUrlSafe = new MessageVerifier(SECRET, { url_safe: false });
    const payload = { gid: "gid://bcx/Person/115186?expires_in", expires_at: null };
    const stdToken = nonUrlSafe.generate(payload);
    expect(verifier.verified(stdToken)).toEqual(payload);
  });
});
