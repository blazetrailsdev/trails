import { describe, it, expect } from "vitest";
import {
  Exception,
  InvalidAuthenticityToken,
  InvalidCrossOriginRequest,
  NullSession,
  ResetSession,
  compareWithGlobalToken,
  compareWithRealToken,
  decodeCsrfToken,
  formAuthenticityParam,
  generateCsrfToken,
  globalCsrfToken,
  isAnyAuthenticityTokenValid,
  isMarkedForSameOriginVerification,
  isNonXhrJavascriptResponse,
  isProtectAgainstForgery,
  isStorageStrategy,
  isValidAuthenticityToken,
  isValidPerFormCsrfToken,
  isValidRequestOrigin,
  isVerifiedRequest,
  markForSameOriginVerificationBang,
  maskToken,
  maskedAuthenticityToken,
  normalizeActionPath,
  normalizeRelativeActionPath,
  perFormCsrfToken,
  protectionMethodClass,
  realCsrfToken,
  requestAuthenticityTokens,
  storageStrategy,
  unmaskToken,
  unverifiedRequestWarningMessage,
  verifySameOriginRequest,
  type CsrfController,
  type CsrfTokenStorage,
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

describe("P20b/P20c smoke", () => {
  function tokenC(overrides: Partial<CsrfController> = {}): CsrfController {
    return {
      request: {
        method: "POST",
        baseUrl: "https://example.com",
        path: "/posts",
        env: { "action_controller.csrf_token": generateCsrfToken() },
      },
      ...overrides,
    };
  }

  it("mask/unmask round-trips and realCsrfToken is stable per request", () => {
    const raw = decodeCsrfToken(generateCsrfToken());
    expect(unmaskToken(decodeCsrfToken(maskToken(raw))).equals(raw)).toBe(true);
    const c = tokenC();
    expect(realCsrfToken(c).equals(realCsrfToken(c))).toBe(true);
  });

  it("encode/decodeCsrfToken use urlsafe base64 without padding; reject garbage", () => {
    const raw = Buffer.from("?".repeat(32));
    const encoded = maskToken(raw);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(unmaskToken(decodeCsrfToken(encoded)).equals(raw)).toBe(true);
    expect(() => decodeCsrfToken("!!! not base64 !!!")).toThrow();
  });

  it("isAnyAuthenticityTokenValid: masked global via param + X-CSRF; rejects empty", () => {
    const c = tokenC();
    const masked = maskToken(globalCsrfToken(c));
    expect(isAnyAuthenticityTokenValid({ ...c, params: { authenticity_token: masked } })).toBe(
      true,
    );
    expect(
      isAnyAuthenticityTokenValid({ ...c, request: { ...c.request, xCsrfToken: masked } }),
    ).toBe(true);
    expect(isAnyAuthenticityTokenValid(c)).toBe(false);
    expect(isValidAuthenticityToken(c, null, "")).toBe(false);
  });

  it("isValidPerFormCsrfToken + compareWith{Global,Real}Token", () => {
    const c = tokenC({
      perFormCsrfTokens: true,
      request: {
        method: "POST",
        baseUrl: "https://example.com",
        path: "/posts/",
        env: { "action_controller.csrf_token": generateCsrfToken() },
      },
    });
    expect(isValidPerFormCsrfToken(c, perFormCsrfToken(c, null, "/posts", "POST"))).toBe(true);
    expect(compareWithGlobalToken(c, globalCsrfToken(c))).toBe(true);
    expect(compareWithRealToken(c, realCsrfToken(c))).toBe(true);
    expect(maskedAuthenticityToken(c, { action: "/posts", method: "POST" })).toBeTruthy();
  });

  it("requestAuthenticityTokens + formAuthenticityParam honor custom token name", () => {
    const c = tokenC({
      params: { my: "p" },
      requestForgeryProtectionToken: "my",
      request: { ...tokenC().request, xCsrfToken: "x" },
    });
    expect(formAuthenticityParam(c)).toBe("p");
    expect(requestAuthenticityTokens(c)).toEqual(["p", "x"]);
  });

  it("protectionMethodClass maps names + passes class through", () => {
    expect(protectionMethodClass("null_session")).toBe(NullSession);
    expect(protectionMethodClass("reset_session")).toBe(ResetSession);
    expect(protectionMethodClass("exception")).toBe(Exception);
    expect(() => protectionMethodClass("nope" as never)).toThrow();
  });

  it("isStorageStrategy + storageStrategy dispatch and reject junk", () => {
    expect(isStorageStrategy({ fetch() {}, store() {}, reset() {} })).toBe(true);
    expect(isStorageStrategy(storageStrategy("session"))).toBe(true);
    expect(isStorageStrategy(storageStrategy("cookie"))).toBe(true);
    const c: CsrfTokenStorage = { fetch: () => null, store() {}, reset() {} };
    expect(storageStrategy(c)).toBe(c);
    expect(() => storageStrategy("bogus" as never)).toThrow();
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
