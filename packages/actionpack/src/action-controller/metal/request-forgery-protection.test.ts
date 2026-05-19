import { describe, it, expect } from "vitest";
import {
  InvalidAuthenticityToken,
  InvalidCrossOriginRequest,
  isProtectAgainstForgery,
  isValidRequestOrigin,
  markForSameOriginVerificationBang,
  isMarkedForSameOriginVerification,
  isNonXhrJavascriptResponse,
  verifySameOriginRequest,
  unverifiedRequestWarningMessage,
  isVerifiedRequest,
  normalizeActionPath,
  normalizeRelativeActionPath,
  type CsrfController,
} from "./request-forgery-protection.js";

function controller(overrides: Partial<CsrfController> = {}): CsrfController {
  return {
    request: { method: "POST", origin: "https://example.com", baseUrl: "https://example.com" },
    ...overrides,
  };
}

describe("isProtectAgainstForgery", () => {
  it("returns true by default", () => {
    expect(isProtectAgainstForgery(controller())).toBe(true);
  });
  it("returns false when allowForgeryProtection is false", () => {
    expect(isProtectAgainstForgery(controller({ allowForgeryProtection: false }))).toBe(false);
  });
  it("delegates to session.enabled()", () => {
    expect(isProtectAgainstForgery(controller({ session: { enabled: () => false } }))).toBe(false);
    expect(isProtectAgainstForgery(controller({ session: { enabled: () => true } }))).toBe(true);
  });
});

describe("isValidRequestOrigin", () => {
  it("is true when origin check is disabled", () => {
    expect(isValidRequestOrigin(controller({ forgeryProtectionOriginCheck: false }))).toBe(true);
  });
  it("is true when origin matches base_url or is missing", () => {
    expect(isValidRequestOrigin(controller())).toBe(true);
    expect(
      isValidRequestOrigin(
        controller({ request: { method: "POST", baseUrl: "https://example.com" } }),
      ),
    ).toBe(true);
  });
  it("is false when origin differs", () => {
    expect(
      isValidRequestOrigin(
        controller({
          request: { method: "POST", origin: "https://evil.com", baseUrl: "https://example.com" },
        }),
      ),
    ).toBe(false);
  });
  it("raises InvalidAuthenticityToken for 'null' origin", () => {
    expect(() =>
      isValidRequestOrigin(
        controller({ request: { method: "POST", origin: "null", baseUrl: "https://example.com" } }),
      ),
    ).toThrow(InvalidAuthenticityToken);
  });
});

describe("markForSameOriginVerificationBang / isMarkedForSameOriginVerification", () => {
  it("sets the flag based on GET", () => {
    const get = controller({ request: { method: "GET", baseUrl: "https://example.com" } });
    markForSameOriginVerificationBang(get);
    expect(isMarkedForSameOriginVerification(get)).toBe(true);

    const post = controller({ request: { method: "POST", baseUrl: "https://example.com" } });
    markForSameOriginVerificationBang(post);
    expect(isMarkedForSameOriginVerification(post)).toBe(false);
  });
  it("defaults to false", () => {
    expect(isMarkedForSameOriginVerification(controller())).toBe(false);
  });
});

describe("isNonXhrJavascriptResponse", () => {
  it("matches text/ and application/javascript when not xhr", () => {
    for (const mediaType of ["text/javascript", "application/javascript"]) {
      expect(
        isNonXhrJavascriptResponse(
          controller({ request: { method: "GET", baseUrl: "https://example.com", mediaType } }),
        ),
      ).toBe(true);
    }
  });
  it("is false when xhr or non-js media type", () => {
    expect(
      isNonXhrJavascriptResponse(
        controller({
          request: {
            method: "GET",
            baseUrl: "https://example.com",
            mediaType: "text/javascript",
            xhr: true,
          },
        }),
      ),
    ).toBe(false);
    expect(
      isNonXhrJavascriptResponse(
        controller({
          request: { method: "GET", baseUrl: "https://example.com", mediaType: "text/html" },
        }),
      ),
    ).toBe(false);
  });
});

describe("verifySameOriginRequest", () => {
  it("raises when marked + non-xhr js response", () => {
    const c = controller({
      _markedForSameOriginVerification: true,
      request: { method: "GET", baseUrl: "https://example.com", mediaType: "text/javascript" },
    });
    expect(() => verifySameOriginRequest(c)).toThrow(InvalidCrossOriginRequest);
  });
  it("no-ops when not marked", () => {
    expect(() =>
      verifySameOriginRequest(
        controller({
          request: {
            method: "GET",
            baseUrl: "https://example.com",
            mediaType: "text/javascript",
          },
        }),
      ),
    ).not.toThrow();
  });

  it("warns via logger when raising", () => {
    const calls: string[] = [];
    const c = controller({
      _markedForSameOriginVerification: true,
      request: { method: "GET", baseUrl: "https://example.com", mediaType: "text/javascript" },
      logger: { warn: (m) => calls.push(m) },
    });
    expect(() => verifySameOriginRequest(c)).toThrow(InvalidCrossOriginRequest);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/Security warning/);
  });

  it("suppresses logger warning when logWarningOnCsrfFailure is false", () => {
    const calls: string[] = [];
    const c = controller({
      _markedForSameOriginVerification: true,
      request: { method: "GET", baseUrl: "https://example.com", mediaType: "text/javascript" },
      logger: { warn: (m) => calls.push(m) },
      logWarningOnCsrfFailure: false,
    });
    expect(() => verifySameOriginRequest(c)).toThrow(InvalidCrossOriginRequest);
    expect(calls).toHaveLength(0);
  });
});

describe("unverifiedRequestWarningMessage", () => {
  it("returns short message when origin is valid", () => {
    expect(unverifiedRequestWarningMessage(controller())).toBe(
      "Can't verify CSRF token authenticity.",
    );
  });
  it("returns detailed message when origin mismatches", () => {
    expect(
      unverifiedRequestWarningMessage(
        controller({
          request: { method: "POST", origin: "https://evil.com", baseUrl: "https://example.com" },
        }),
      ),
    ).toBe(
      "HTTP Origin header (https://evil.com) didn't match request.base_url (https://example.com)",
    );
  });
});

describe("isVerifiedRequest", () => {
  it("returns true when protection is disabled or method is GET/HEAD", () => {
    expect(isVerifiedRequest(controller({ allowForgeryProtection: false }))).toBe(true);
    expect(
      isVerifiedRequest(controller({ request: { method: "GET", baseUrl: "https://example.com" } })),
    ).toBe(true);
    expect(
      isVerifiedRequest(
        controller({ request: { method: "HEAD", baseUrl: "https://example.com" } }),
      ),
    ).toBe(true);
  });
  it("requires valid origin and token for POST", () => {
    expect(isVerifiedRequest(controller({ isAnyAuthenticityTokenValid: () => true }))).toBe(true);
    expect(isVerifiedRequest(controller({ isAnyAuthenticityTokenValid: () => false }))).toBe(false);
    expect(isVerifiedRequest(controller())).toBe(false);
  });
});

describe("normalizeActionPath / normalizeRelativeActionPath", () => {
  it("strips trailing slash from absolute paths", () => {
    expect(normalizeActionPath("/foo/bar/", "/current")).toBe("/foo/bar");
    expect(normalizeActionPath("/foo/bar", "/current")).toBe("/foo/bar");
  });
  it("extracts path from full URL", () => {
    expect(normalizeActionPath("https://example.com/foo/", "/current")).toBe("/foo");
  });
  it("extracts path from protocol-relative URL", () => {
    expect(normalizeActionPath("//example.com/foo/", "/current")).toBe("/foo");
  });
  it("joins relative paths onto request path and collapses /./", () => {
    expect(normalizeActionPath("bar", "/foo")).toBe("/foo/bar");
    expect(normalizeActionPath("./bar", "/foo")).toBe("/foo/bar");
    expect(normalizeRelativeActionPath("bar/", "/foo")).toBe("/foo/bar");
  });
});
