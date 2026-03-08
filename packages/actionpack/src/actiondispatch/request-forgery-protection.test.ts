import { describe, it, expect } from "vitest";
import { RequestForgeryProtection, InvalidAuthenticityToken } from "./request-forgery-protection.js";

// ==========================================================================
// controller/request_forgery_protection_test.rb
// ==========================================================================
describe("ActionController::RequestForgeryProtection", () => {
  // --- Token generation and masking ---

  it("should generate a base64 token", () => {
    const token = RequestForgeryProtection.generateToken();
    expect(token).toBeTruthy();
    expect(Buffer.from(token, "base64").length).toBe(32);
  });

  it("should generate unique tokens", () => {
    const t1 = RequestForgeryProtection.generateToken();
    const t2 = RequestForgeryProtection.generateToken();
    expect(t1).not.toBe(t2);
  });

  it("should mask and unmask token roundtrip", () => {
    const csrf = new RequestForgeryProtection();
    const raw = RequestForgeryProtection.generateToken();
    const masked = csrf.maskToken(raw);
    expect(masked).not.toBe(raw);
    const unmasked = csrf.unmaskToken(masked);
    expect(unmasked).toBe(raw);
  });

  it("should produce different masked tokens each time", () => {
    const csrf = new RequestForgeryProtection();
    const raw = RequestForgeryProtection.generateToken();
    const m1 = csrf.maskToken(raw);
    const m2 = csrf.maskToken(raw);
    expect(m1).not.toBe(m2); // Different OTPs
    // But both unmask to the same value
    expect(csrf.unmaskToken(m1)).toBe(raw);
    expect(csrf.unmaskToken(m2)).toBe(raw);
  });

  // --- Safe methods ---

  it("should allow get", () => {
    const csrf = new RequestForgeryProtection();
    expect(csrf.requiresVerification("GET")).toBe(false);
  });

  it("should allow head", () => {
    const csrf = new RequestForgeryProtection();
    expect(csrf.requiresVerification("HEAD")).toBe(false);
  });

  it("should not allow post without token", () => {
    const csrf = new RequestForgeryProtection();
    const session: Record<string, unknown> = {};
    csrf.getRealToken(session); // Initialize token
    const result = csrf.verifyRequest({
      method: "POST",
      session,
      token: null,
      host: "example.com",
    });
    expect(result.verified).toBe(false);
  });

  it("should not allow post without token irrespective of format", () => {
    const csrf = new RequestForgeryProtection();
    const session: Record<string, unknown> = {};
    csrf.getRealToken(session);
    const result = csrf.verifyRequest({
      method: "POST",
      session,
      token: undefined,
      host: "example.com",
    });
    expect(result.verified).toBe(false);
  });

  it("should not allow patch without token", () => {
    const csrf = new RequestForgeryProtection();
    expect(csrf.requiresVerification("PATCH")).toBe(true);
  });

  it("should not allow put without token", () => {
    const csrf = new RequestForgeryProtection();
    expect(csrf.requiresVerification("PUT")).toBe(true);
  });

  it("should not allow delete without token", () => {
    const csrf = new RequestForgeryProtection();
    expect(csrf.requiresVerification("DELETE")).toBe(true);
  });

  it("should not allow xhr post without token", () => {
    const csrf = new RequestForgeryProtection();
    const session: Record<string, unknown> = {};
    csrf.getRealToken(session);
    const result = csrf.verifyRequest({
      method: "POST",
      session,
      token: null,
      host: "example.com",
    });
    expect(result.verified).toBe(false);
  });

  // --- Valid token ---

  it("should allow post with token", () => {
    const csrf = new RequestForgeryProtection();
    const session: Record<string, unknown> = {};
    const realToken = csrf.getRealToken(session);
    const masked = csrf.maskToken(realToken);
    const result = csrf.verifyRequest({
      method: "POST",
      session,
      token: masked,
      host: "example.com",
    });
    expect(result.verified).toBe(true);
  });

  it("should allow patch with token", () => {
    const csrf = new RequestForgeryProtection();
    const session: Record<string, unknown> = {};
    const realToken = csrf.getRealToken(session);
    const masked = csrf.maskToken(realToken);
    expect(csrf.verifyToken(session, masked)).toBe(true);
  });

  it("should allow put with token", () => {
    const csrf = new RequestForgeryProtection();
    const session: Record<string, unknown> = {};
    const realToken = csrf.getRealToken(session);
    const masked = csrf.maskToken(realToken);
    expect(csrf.verifyToken(session, masked)).toBe(true);
  });

  it("should allow delete with token", () => {
    const csrf = new RequestForgeryProtection();
    const session: Record<string, unknown> = {};
    const realToken = csrf.getRealToken(session);
    const masked = csrf.maskToken(realToken);
    expect(csrf.verifyToken(session, masked)).toBe(true);
  });

  it("should allow post with token in header", () => {
    const csrf = new RequestForgeryProtection();
    const session: Record<string, unknown> = {};
    const realToken = csrf.getRealToken(session);
    const headerToken = csrf.maskToken(realToken);
    const result = csrf.verifyRequest({
      method: "POST",
      session,
      token: headerToken,
      host: "example.com",
    });
    expect(result.verified).toBe(true);
  });

  // --- Origin checking ---

  it("should allow post with origin checking and correct origin", () => {
    const csrf = new RequestForgeryProtection({ originCheck: true });
    const session: Record<string, unknown> = {};
    const realToken = csrf.getRealToken(session);
    const masked = csrf.maskToken(realToken);
    const result = csrf.verifyRequest({
      method: "POST",
      session,
      token: masked,
      origin: "https://example.com",
      host: "example.com",
    });
    expect(result.verified).toBe(true);
  });

  it("should allow post with origin checking and no origin", () => {
    const csrf = new RequestForgeryProtection({ originCheck: true });
    const session: Record<string, unknown> = {};
    const realToken = csrf.getRealToken(session);
    const masked = csrf.maskToken(realToken);
    const result = csrf.verifyRequest({
      method: "POST",
      session,
      token: masked,
      origin: null,
      host: "example.com",
    });
    expect(result.verified).toBe(true);
  });

  it("should raise for post with null origin", () => {
    const csrf = new RequestForgeryProtection({ originCheck: true });
    const session: Record<string, unknown> = {};
    csrf.getRealToken(session);
    const result = csrf.verifyRequest({
      method: "POST",
      session,
      token: "anything",
      origin: "null",
      host: "example.com",
    });
    expect(result.verified).toBe(false);
  });

  it("should block post with origin checking and wrong origin", () => {
    const csrf = new RequestForgeryProtection({ originCheck: true });
    const session: Record<string, unknown> = {};
    csrf.getRealToken(session);
    const result = csrf.verifyRequest({
      method: "POST",
      session,
      token: "anything",
      origin: "https://evil.com",
      host: "example.com",
    });
    expect(result.verified).toBe(false);
  });

  it("should warn on missing csrf token", () => {
    const csrf = new RequestForgeryProtection({ logging: true });
    const session: Record<string, unknown> = {};
    csrf.getRealToken(session);
    const result = csrf.verifyRequest({
      method: "POST",
      session,
      token: null,
      host: "example.com",
    });
    expect(result.warning).toBe("Can't verify CSRF token authenticity.");
  });

  it("should not warn if csrf logging disabled", () => {
    const csrf = new RequestForgeryProtection({ logging: false });
    const session: Record<string, unknown> = {};
    csrf.getRealToken(session);
    const result = csrf.verifyRequest({
      method: "POST",
      session,
      token: null,
      host: "example.com",
    });
    expect(result.warning).toBeUndefined();
  });

  it("csrf token is not saved if it is nil", () => {
    const csrf = new RequestForgeryProtection();
    const session: Record<string, unknown> = {};
    expect(csrf.verifyToken(session, null)).toBe(false);
    // Token should not have been created
    expect(session["_csrf_token"]).toBeUndefined();
  });

  it("should not raise error if token is not a string", () => {
    const csrf = new RequestForgeryProtection();
    const session: Record<string, unknown> = {};
    csrf.getRealToken(session);
    // Should not throw
    expect(csrf.verifyToken(session, "")).toBe(false);
    expect(csrf.verifyToken(session, undefined)).toBe(false);
  });

  // --- Strategy: exception ---

  it("raised exception message explains why it occurred", () => {
    const csrf = new RequestForgeryProtection({ strategy: "exception" });
    const session: Record<string, unknown> = {};
    expect(() => csrf.handleUnverified(session)).toThrow(InvalidAuthenticityToken);
    expect(() => csrf.handleUnverified(session)).toThrow("Can't verify CSRF token authenticity.");
  });

  // --- Strategy: reset_session ---

  it("should emit a csrf-param meta tag and a csrf-token meta tag", () => {
    const csrf = new RequestForgeryProtection();
    const session: Record<string, unknown> = {};
    const meta = csrf.csrfMetaTag(session);
    expect(meta.param).toBe("authenticity_token");
    expect(meta.token).toBeTruthy();
    expect(meta.token.length).toBeGreaterThan(0);
  });

  // --- Strategy: null_session ---

  it("should allow reset_session", () => {
    const csrf = new RequestForgeryProtection({ strategy: "reset_session" });
    const session: Record<string, unknown> = { user_id: 1, _csrf_token: "abc" };
    csrf.handleUnverified(session);
    expect(Object.keys(session).length).toBe(0);
  });

  // --- Custom authenticity param ---

  it("should not warn if form authenticity param matches form authenticity token", () => {
    const csrf = new RequestForgeryProtection({ paramName: "custom_token" });
    expect(csrf.formParamName).toBe("custom_token");
    const session: Record<string, unknown> = {};
    const real = csrf.getRealToken(session);
    const masked = csrf.maskToken(real);
    expect(csrf.verifyToken(session, masked)).toBe(true);
  });

  it("should warn if form authenticity param does not match form authenticity token", () => {
    const csrf = new RequestForgeryProtection({ paramName: "custom_token" });
    const session: Record<string, unknown> = {};
    csrf.getRealToken(session);
    expect(csrf.verifyToken(session, "wrong")).toBe(false);
  });

  // --- Per-form tokens ---

  it("per form token is same size as global token", () => {
    const csrf = new RequestForgeryProtection({ perFormTokens: true });
    const session: Record<string, unknown> = {};
    const realToken = csrf.getRealToken(session);
    const globalMasked = csrf.maskToken(realToken);
    const perFormMasked = csrf.generatePerFormToken(session, "/posts", "POST");
    // Both should be masked (64 bytes base64)
    expect(Buffer.from(perFormMasked, "base64").length).toBe(
      Buffer.from(globalMasked, "base64").length
    );
  });

  it("accepts token for correct path and method", () => {
    const csrf = new RequestForgeryProtection({ perFormTokens: true });
    const session: Record<string, unknown> = {};
    const perFormToken = csrf.generatePerFormToken(session, "/posts", "POST");
    expect(
      csrf.verifyToken(session, perFormToken, { actionPath: "/posts", method: "POST" })
    ).toBe(true);
  });

  it("accepts token with path with query params", () => {
    const csrf = new RequestForgeryProtection({ perFormTokens: true });
    const session: Record<string, unknown> = {};
    const perFormToken = csrf.generatePerFormToken(session, "/posts?page=1", "POST");
    expect(
      csrf.verifyToken(session, perFormToken, { actionPath: "/posts", method: "POST" })
    ).toBe(true);
  });

  it("rejects token for incorrect path", () => {
    const csrf = new RequestForgeryProtection({ perFormTokens: true });
    const session: Record<string, unknown> = {};
    const perFormToken = csrf.generatePerFormToken(session, "/posts", "POST");
    expect(
      csrf.verifyToken(session, perFormToken, { actionPath: "/comments", method: "POST" })
    ).toBe(false);
  });

  it("rejects token for incorrect method", () => {
    const csrf = new RequestForgeryProtection({ perFormTokens: true });
    const session: Record<string, unknown> = {};
    const perFormToken = csrf.generatePerFormToken(session, "/posts", "POST");
    expect(
      csrf.verifyToken(session, perFormToken, { actionPath: "/posts", method: "DELETE" })
    ).toBe(false);
  });

  it("accepts global csrf token", () => {
    const csrf = new RequestForgeryProtection({ perFormTokens: true });
    const session: Record<string, unknown> = {};
    const realToken = csrf.getRealToken(session);
    const masked = csrf.maskToken(realToken);
    // Global token should always be accepted even with per-form enabled
    expect(csrf.verifyToken(session, masked)).toBe(true);
  });

  it("returns hmacd token", () => {
    const csrf = new RequestForgeryProtection({ perFormTokens: true });
    const session: Record<string, unknown> = {};
    const perFormToken = csrf.generatePerFormToken(session, "/posts", "POST");
    // Per-form token should be different from global token
    const realToken = csrf.getRealToken(session);
    const unmasked = csrf.unmaskToken(perFormToken);
    expect(unmasked).not.toBe(realToken);
  });

  it("chomps slashes", () => {
    const csrf = new RequestForgeryProtection({ perFormTokens: true });
    const session: Record<string, unknown> = {};
    const t1 = csrf.generatePerFormToken(session, "/posts/", "POST");
    expect(
      csrf.verifyToken(session, t1, { actionPath: "/posts", method: "POST" })
    ).toBe(true);
  });

  it("ignores trailing slash during generation", () => {
    const csrf = new RequestForgeryProtection({ perFormTokens: true });
    const session: Record<string, unknown> = {};
    const t1 = csrf.generatePerFormToken(session, "/posts/", "POST");
    const t2 = csrf.generatePerFormToken(session, "/posts", "POST");
    expect(csrf.unmaskToken(t1)).toBe(csrf.unmaskToken(t2));
  });

  it("handles empty path as request path", () => {
    const csrf = new RequestForgeryProtection({ perFormTokens: true });
    const session: Record<string, unknown> = {};
    const token = csrf.generatePerFormToken(session, "", "POST");
    expect(
      csrf.verifyToken(session, token, { actionPath: "/", method: "POST" })
    ).toBe(true);
  });

  it("handles query string", () => {
    const csrf = new RequestForgeryProtection({ perFormTokens: true });
    const session: Record<string, unknown> = {};
    const token = csrf.generatePerFormToken(session, "/posts?sort=name", "POST");
    expect(
      csrf.verifyToken(session, token, { actionPath: "/posts?sort=date", method: "POST" })
    ).toBe(true);
  });

  it("handles fragment", () => {
    const csrf = new RequestForgeryProtection({ perFormTokens: true });
    const session: Record<string, unknown> = {};
    const token = csrf.generatePerFormToken(session, "/posts#top", "POST");
    expect(
      csrf.verifyToken(session, token, { actionPath: "/posts", method: "POST" })
    ).toBe(true);
  });

  it("ignores trailing slash during validation", () => {
    const csrf = new RequestForgeryProtection({ perFormTokens: true });
    const session: Record<string, unknown> = {};
    const token = csrf.generatePerFormToken(session, "/posts", "POST");
    expect(
      csrf.verifyToken(session, token, { actionPath: "/posts/", method: "POST" })
    ).toBe(true);
  });

  it("method is case insensitive", () => {
    const csrf = new RequestForgeryProtection({ perFormTokens: true });
    const session: Record<string, unknown> = {};
    const token = csrf.generatePerFormToken(session, "/posts", "post");
    expect(
      csrf.verifyToken(session, token, { actionPath: "/posts", method: "POST" })
    ).toBe(true);
  });

  // --- Reset token ---

  it("reset csrf token generates new token", () => {
    const csrf = new RequestForgeryProtection();
    const session: Record<string, unknown> = {};
    const t1 = csrf.getRealToken(session);
    const t2 = csrf.resetToken(session);
    expect(t2).not.toBe(t1);
  });

  // --- Header name ---

  it("csrf header name", () => {
    const csrf = new RequestForgeryProtection();
    expect(csrf.headerName).toBe("X-CSRF-Token");
  });

  // --- Session key ---

  it("csrf session key", () => {
    const csrf = new RequestForgeryProtection();
    expect(csrf.tokenSessionKey).toBe("_csrf_token");
  });

  it("custom csrf session key", () => {
    const csrf = new RequestForgeryProtection({ sessionKey: "my_token" });
    expect(csrf.tokenSessionKey).toBe("my_token");
    const session: Record<string, unknown> = {};
    csrf.getRealToken(session);
    expect(session["my_token"]).toBeTruthy();
  });

  // --- Allowed origins ---

  it("should allow configured allowed origins", () => {
    const csrf = new RequestForgeryProtection({
      originCheck: true,
      allowedOrigins: ["trusted.com"],
    });
    expect(csrf.verifyOrigin("https://trusted.com", "example.com")).toBe(true);
  });

  it("should reject unconfigured origins", () => {
    const csrf = new RequestForgeryProtection({
      originCheck: true,
      allowedOrigins: ["trusted.com"],
    });
    expect(csrf.verifyOrigin("https://evil.com", "example.com")).toBe(false);
  });

  // --- FreeCookieController equivalent (no protection) ---

  it("should allow all methods without token when not protected", () => {
    const csrf = new RequestForgeryProtection({ protectedMethods: new Set() });
    expect(csrf.requiresVerification("POST")).toBe(false);
    expect(csrf.requiresVerification("DELETE")).toBe(false);
  });

  // --- Verify request full flow ---

  it("full verification flow with valid token", () => {
    const csrf = new RequestForgeryProtection();
    const session: Record<string, unknown> = {};
    const real = csrf.getRealToken(session);
    const masked = csrf.maskToken(real);
    const result = csrf.verifyRequest({
      method: "POST",
      session,
      token: masked,
      host: "example.com",
    });
    expect(result.verified).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it("full verification flow with invalid token", () => {
    const csrf = new RequestForgeryProtection();
    const session: Record<string, unknown> = {};
    csrf.getRealToken(session);
    const result = csrf.verifyRequest({
      method: "POST",
      session,
      token: "invalid-token",
      host: "example.com",
    });
    expect(result.verified).toBe(false);
  });

  it("GET requests always pass verification", () => {
    const csrf = new RequestForgeryProtection();
    const session: Record<string, unknown> = {};
    const result = csrf.verifyRequest({
      method: "GET",
      session,
      host: "example.com",
    });
    expect(result.verified).toBe(true);
  });

  // --- Post with strict encoded token ---

  it("should allow post with strict encoded token", () => {
    const csrf = new RequestForgeryProtection();
    const session: Record<string, unknown> = {};
    const realToken = csrf.getRealToken(session);
    // URL-encode the masked token (as browser might do)
    const masked = csrf.maskToken(realToken);
    const decoded = decodeURIComponent(encodeURIComponent(masked));
    expect(csrf.verifyToken(session, decoded)).toBe(true);
  });

  it("should allow post without token on unsafe action when not required", () => {
    const csrf = new RequestForgeryProtection({ protectedMethods: new Set(["PATCH", "PUT", "DELETE"]) });
    const result = csrf.verifyRequest({
      method: "POST",
      session: {},
      host: "example.com",
    });
    expect(result.verified).toBe(true);
  });
});
