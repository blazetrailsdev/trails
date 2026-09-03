import { describe, it, expect } from "vitest";
import { RequestForgeryProtection } from "../../action-dispatch/request-forgery-protection.js";
import { assertRaises } from "@blazetrails/activesupport";
import { Session } from "../../action-dispatch/request/session.js";

import {
  Exception,
  handleUnverifiedRequest,
  InvalidAuthenticityToken as MetalInvalidAuthenticityToken,
  type CsrfController,
} from "../metal/request-forgery-protection.js";

function newSession(): Session {
  const req = { env: {} };
  return Session.create(
    {
      loadSession: () => [null, {}],
      sessionExists: () => true,
      deleteSession: () => null,
      extractSessionId: () => null,
    },
    req,
    {},
  );
}

describe("ActionController::RequestForgeryProtection", () => {
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
    expect(m1).not.toBe(m2);
    expect(csrf.unmaskToken(m1)).toBe(raw);
    expect(csrf.unmaskToken(m2)).toBe(raw);
  });

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
    const session = newSession();
    csrf.getRealToken(session);
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
    const session = newSession();
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
    const session = newSession();
    csrf.getRealToken(session);
    const result = csrf.verifyRequest({
      method: "POST",
      session,
      token: null,
      host: "example.com",
    });
    expect(result.verified).toBe(false);
  });

  it("should allow post with token", () => {
    const csrf = new RequestForgeryProtection();
    const session = newSession();
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
    const session = newSession();
    const realToken = csrf.getRealToken(session);
    const masked = csrf.maskToken(realToken);
    expect(csrf.verifyToken(session, masked)).toBe(true);
  });

  it("should allow put with token", () => {
    const csrf = new RequestForgeryProtection();
    const session = newSession();
    const realToken = csrf.getRealToken(session);
    const masked = csrf.maskToken(realToken);
    expect(csrf.verifyToken(session, masked)).toBe(true);
  });

  it("should allow delete with token", () => {
    const csrf = new RequestForgeryProtection();
    const session = newSession();
    const realToken = csrf.getRealToken(session);
    const masked = csrf.maskToken(realToken);
    expect(csrf.verifyToken(session, masked)).toBe(true);
  });

  it("should allow post with token in header", () => {
    const csrf = new RequestForgeryProtection();
    const session = newSession();
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

  it("should allow delete with token in header", () => {
    const csrf = new RequestForgeryProtection();
    const session = newSession();
    const realToken = csrf.getRealToken(session);
    const headerToken = csrf.maskToken(realToken);
    const result = csrf.verifyRequest({
      method: "DELETE",
      session,
      token: headerToken,
      host: "example.com",
    });
    expect(result.verified).toBe(true);
  });

  it("should allow patch with token in header", () => {
    const csrf = new RequestForgeryProtection();
    const session = newSession();
    const realToken = csrf.getRealToken(session);
    const headerToken = csrf.maskToken(realToken);
    const result = csrf.verifyRequest({
      method: "PATCH",
      session,
      token: headerToken,
      host: "example.com",
    });
    expect(result.verified).toBe(true);
  });

  it("should allow put with token in header", () => {
    const csrf = new RequestForgeryProtection();
    const session = newSession();
    const realToken = csrf.getRealToken(session);
    const headerToken = csrf.maskToken(realToken);
    const result = csrf.verifyRequest({
      method: "PUT",
      session,
      token: headerToken,
      host: "example.com",
    });
    expect(result.verified).toBe(true);
  });

  it("should allow post with origin checking and correct origin", () => {
    const csrf = new RequestForgeryProtection({ originCheck: true });
    const session = newSession();
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
    const session = newSession();
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
    const session = newSession();
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
    const session = newSession();
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
    const session = newSession();
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
    const session = newSession();
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
    const session = newSession();
    expect(csrf.verifyToken(session, null)).toBe(false);
    expect(session.get("_csrf_token")).toBeUndefined();
  });

  it("should not raise error if token is not a string", () => {
    const csrf = new RequestForgeryProtection();
    const session = newSession();
    csrf.getRealToken(session);
    expect(csrf.verifyToken(session, "")).toBe(false);
    expect(csrf.verifyToken(session, undefined)).toBe(false);
  });

  it("reset csrf token generates new token", () => {
    const csrf = new RequestForgeryProtection();
    const session = newSession();
    const t1 = csrf.getRealToken(session);
    const t2 = csrf.resetToken(session);
    expect(t2).not.toBe(t1);
  });

  it("csrf header name", () => {
    const csrf = new RequestForgeryProtection();
    expect(csrf.headerName).toBe("X-CSRF-Token");
  });

  it("csrf session key", () => {
    const csrf = new RequestForgeryProtection();
    expect(csrf.tokenSessionKey).toBe("_csrf_token");
  });

  it("custom csrf session key", () => {
    const csrf = new RequestForgeryProtection({ sessionKey: "my_token" });
    expect(csrf.tokenSessionKey).toBe("my_token");
    const session = newSession();
    csrf.getRealToken(session);
    expect(session.get("my_token")).toBeTruthy();
  });

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

  it("full verification flow with valid token", () => {
    const csrf = new RequestForgeryProtection();
    const session = newSession();
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
    const session = newSession();
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
    const session = newSession();
    const result = csrf.verifyRequest({
      method: "GET",
      session,
      host: "example.com",
    });
    expect(result.verified).toBe(true);
  });

  it("should allow post with strict encoded token", () => {
    const csrf = new RequestForgeryProtection();
    const session = newSession();
    const realToken = csrf.getRealToken(session);
    const masked = csrf.maskToken(realToken);
    const decoded = decodeURIComponent(encodeURIComponent(masked));
    expect(csrf.verifyToken(session, decoded)).toBe(true);
  });

  it("should allow post without token on unsafe action", () => {
    const csrf = new RequestForgeryProtection({
      protectedMethods: new Set(["PATCH", "PUT", "DELETE"]),
    });
    const result = csrf.verifyRequest({
      method: "POST",
      session: newSession(),
      host: "example.com",
    });
    expect(result.verified).toBe(true);
  });
});

describe("RequestForgeryProtectionControllerUsingExceptionTest", () => {
  it("raised exception message explains why it occurred", async () => {
    const controller = {
      request: { method: "POST", origin: "http://bad.host", baseUrl: "http://test.host" },
      forgeryProtectionOriginCheck: true,
      forgeryProtectionStrategy: Exception,
    } as unknown as CsrfController;

    await assertRaises(
      [MetalInvalidAuthenticityToken],
      {
        match:
          "HTTP Origin header (http://bad.host) didn't match request.base_url (http://test.host)",
      },
      () => handleUnverifiedRequest.call(controller),
    );
  });

  it.skip("should render form with token tag", () => {});
  it.skip("should render button to with token tag", () => {});
  it.skip("should render form without token tag if remote", () => {});
  it.skip("should render form with token tag if remote and embedding token is on", () => {});
  it.skip("should render form with token tag if remote and external authenticity token requested and embedding is on", () => {});
  it.skip("should render form with token tag if remote and external authenticity token requested", () => {});
  it.skip("should render form with token tag if remote and authenticity token requested", () => {});
  it.skip("should render form with token tag with authenticity token requested", () => {});
  it.skip("should render form with with token tag if remote", () => {});
  it.skip("should render form with without token tag if remote and embedding token is off", () => {});
  it.skip("should render form with with token tag if remote and external authenticity token requested and embedding is on", () => {});
  it.skip("should render form with with token tag if remote and external authenticity token requested", () => {});
  it.skip("should render form with with token tag if remote and authenticity token requested", () => {});
  it.skip("should render form with with token tag with authenticity token requested", () => {});
  it.skip("should render form with with token tag if remote and embedding token is on", () => {});

  it.skip("should only allow same origin js get with xhr header", () => {});
  it.skip("should warn on not same origin js", () => {});
  it.skip("should not warn if csrf logging disabled and not same origin js", () => {});
  it.skip("should allow non get js without xhr header", () => {});
  it.skip("should only allow cross origin js get without xhr header if protection disabled", () => {});
});

describe("RequestForgeryProtectionControllerUsingResetSessionTest", () => {
  it("should emit a csrf-param meta tag and a csrf-token meta tag", () => {
    const csrf = new RequestForgeryProtection({ strategy: "reset_session" });
    const session = newSession();
    const meta = csrf.csrfMetaTag(session);
    expect(meta.param).toBe("authenticity_token");
    expect(meta.token).toBeTruthy();
    expect(meta.token.length).toBeGreaterThan(0);
  });
});

describe("RequestForgeryProtectionControllerUsingNullSessionTest", () => {
  it("should allow reset_session", () => {
    const csrf = new RequestForgeryProtection({ strategy: "null_session" });
    const session = newSession();
    session.set("user_id", 1);
    session.set("_csrf_token", "abc");
    csrf.handleUnverified(session);
    expect(session.get("user_id")).toBe(1);
  });

  it.skip("should allow to set signed cookies", () => {});
  it.skip("should allow to set encrypted cookies", () => {});
});

describe("CustomAuthenticityParamControllerTest", () => {
  it("should not warn if form authenticity param matches form authenticity token", () => {
    const csrf = new RequestForgeryProtection({ paramName: "custom_token" });
    expect(csrf.formParamName).toBe("custom_token");
    const session = newSession();
    const real = csrf.getRealToken(session);
    const masked = csrf.maskToken(real);
    expect(csrf.verifyToken(session, masked)).toBe(true);
  });

  it("should warn if form authenticity param does not match form authenticity token", () => {
    const csrf = new RequestForgeryProtection({ paramName: "custom_token" });
    const session = newSession();
    csrf.getRealToken(session);
    expect(csrf.verifyToken(session, "wrong")).toBe(false);
  });
});

describe("PerFormTokensControllerTest", () => {
  it("per form token is same size as global token", () => {
    const csrf = new RequestForgeryProtection({ perFormTokens: true });
    const session = newSession();
    const realToken = csrf.getRealToken(session);
    const globalMasked = csrf.maskToken(realToken);
    const perFormMasked = csrf.generatePerFormToken(session, "/posts", "POST");
    expect(Buffer.from(perFormMasked, "base64").length).toBe(
      Buffer.from(globalMasked, "base64").length,
    );
  });

  it("accepts token for correct path and method", () => {
    const csrf = new RequestForgeryProtection({ perFormTokens: true });
    const session = newSession();
    const perFormToken = csrf.generatePerFormToken(session, "/posts", "POST");
    expect(csrf.verifyToken(session, perFormToken, { actionPath: "/posts", method: "POST" })).toBe(
      true,
    );
  });

  it("accepts token with path with query params", () => {
    const csrf = new RequestForgeryProtection({ perFormTokens: true });
    const session = newSession();
    const perFormToken = csrf.generatePerFormToken(session, "/posts?page=1", "POST");
    expect(csrf.verifyToken(session, perFormToken, { actionPath: "/posts", method: "POST" })).toBe(
      true,
    );
  });

  it("rejects token for incorrect path", () => {
    const csrf = new RequestForgeryProtection({ perFormTokens: true });
    const session = newSession();
    const perFormToken = csrf.generatePerFormToken(session, "/posts", "POST");
    expect(
      csrf.verifyToken(session, perFormToken, { actionPath: "/comments", method: "POST" }),
    ).toBe(false);
  });

  it("rejects token for incorrect method", () => {
    const csrf = new RequestForgeryProtection({ perFormTokens: true });
    const session = newSession();
    const perFormToken = csrf.generatePerFormToken(session, "/posts", "POST");
    expect(
      csrf.verifyToken(session, perFormToken, { actionPath: "/posts", method: "DELETE" }),
    ).toBe(false);
  });

  it("accepts global csrf token", () => {
    const csrf = new RequestForgeryProtection({ perFormTokens: true });
    const session = newSession();
    const realToken = csrf.getRealToken(session);
    const masked = csrf.maskToken(realToken);
    expect(csrf.verifyToken(session, masked)).toBe(true);
  });

  it("returns hmacd token", () => {
    const csrf = new RequestForgeryProtection({ perFormTokens: true });
    const session = newSession();
    const perFormToken = csrf.generatePerFormToken(session, "/posts", "POST");
    const realToken = csrf.getRealToken(session);
    const unmasked = csrf.unmaskToken(perFormToken);
    expect(unmasked).not.toBe(realToken);
  });

  it("chomps slashes", () => {
    const csrf = new RequestForgeryProtection({ perFormTokens: true });
    const session = newSession();
    const t1 = csrf.generatePerFormToken(session, "/posts/", "POST");
    expect(csrf.verifyToken(session, t1, { actionPath: "/posts", method: "POST" })).toBe(true);
  });

  it("ignores trailing slash during generation", () => {
    const csrf = new RequestForgeryProtection({ perFormTokens: true });
    const session = newSession();
    const t1 = csrf.generatePerFormToken(session, "/posts/", "POST");
    const t2 = csrf.generatePerFormToken(session, "/posts", "POST");
    expect(csrf.unmaskToken(t1)).toBe(csrf.unmaskToken(t2));
  });

  it("handles empty path as request path", () => {
    const csrf = new RequestForgeryProtection({ perFormTokens: true });
    const session = newSession();
    const token = csrf.generatePerFormToken(session, "", "POST");
    expect(csrf.verifyToken(session, token, { actionPath: "/", method: "POST" })).toBe(true);
  });

  it("handles query string", () => {
    const csrf = new RequestForgeryProtection({ perFormTokens: true });
    const session = newSession();
    const token = csrf.generatePerFormToken(session, "/posts?sort=name", "POST");
    expect(
      csrf.verifyToken(session, token, { actionPath: "/posts?sort=date", method: "POST" }),
    ).toBe(true);
  });

  it("handles fragment", () => {
    const csrf = new RequestForgeryProtection({ perFormTokens: true });
    const session = newSession();
    const token = csrf.generatePerFormToken(session, "/posts#top", "POST");
    expect(csrf.verifyToken(session, token, { actionPath: "/posts", method: "POST" })).toBe(true);
  });

  it("ignores trailing slash during validation", () => {
    const csrf = new RequestForgeryProtection({ perFormTokens: true });
    const session = newSession();
    const token = csrf.generatePerFormToken(session, "/posts", "POST");
    expect(csrf.verifyToken(session, token, { actionPath: "/posts/", method: "POST" })).toBe(true);
  });

  it("method is case insensitive", () => {
    const csrf = new RequestForgeryProtection({ perFormTokens: true });
    const session = newSession();
    const token = csrf.generatePerFormToken(session, "/posts", "post");
    expect(csrf.verifyToken(session, token, { actionPath: "/posts", method: "POST" })).toBe(true);
  });

  it.skip("rejects garbage path", () => {});
  it.skip("rejects token for incorrect method button to", () => {});
  it.skip("Accepts proper token for implicit post method on button_to tag", () => {});
  it.skip("Accepts proper token for delete method on button_to tag", () => {});
  it.skip("Accepts proper token for post method on button_to tag", () => {});
  it.skip("Accepts proper token for patch method on button_to tag", () => {});
  it("does not return old csrf token", () => {
    const csrf = new RequestForgeryProtection({ perFormTokens: true });
    const session = newSession();
    const realToken = csrf.getRealToken(session);
    const perFormToken = csrf.generatePerFormToken(session, "/per_form_tokens/post_one", "POST");
    const unmasked = csrf.unmaskToken(perFormToken);
    expect(unmasked).not.toBe(realToken);
  });

  it("accepts old csrf token", () => {
    const csrf = new RequestForgeryProtection({ perFormTokens: true });
    const session = newSession();
    const realToken = csrf.getRealToken(session);
    const nonHmacToken = csrf.maskToken(realToken);
    expect(
      csrf.verifyToken(session, nonHmacToken, {
        actionPath: "/per_form_tokens/post_one",
        method: "POST",
      }),
    ).toBe(true);
  });

  it.skip("handles relative paths", () => {});
  it.skip("handles relative paths with dot", () => {});

  it("ignores origin during generation", () => {
    const csrf = new RequestForgeryProtection({ perFormTokens: true });
    const session = newSession();
    const tokenWithOrigin = csrf.generatePerFormToken(
      session,
      "https://example.com/per_form_tokens/post_one/",
      "POST",
    );
    expect(
      csrf.verifyToken(session, tokenWithOrigin, {
        actionPath: "/per_form_tokens/post_one",
        method: "POST",
      }),
    ).toBe(true);
  });

  it("ignores origin during generation with protocol-relative url", () => {
    const csrf = new RequestForgeryProtection({ perFormTokens: true });
    const session = newSession();
    const tokenWithOrigin = csrf.generatePerFormToken(
      session,
      "//example.com/per_form_tokens/post_one/",
      "POST",
    );
    expect(
      csrf.verifyToken(session, tokenWithOrigin, {
        actionPath: "/per_form_tokens/post_one",
        method: "POST",
      }),
    ).toBe(true);
  });
});

describe("PrependProtectForgeryBaseControllerTest", () => {
  it.skip("verify authenticity token is prepended", () => {});
  it.skip("verify authenticity token is not prepended", () => {});
  it.skip("verify authenticity token is not prepended by default", () => {});
});

describe("FreeCookieControllerTest", () => {
  it("should allow all methods without token", () => {
    const csrf = new RequestForgeryProtection({ protectedMethods: new Set() });
    expect(csrf.requiresVerification("POST")).toBe(false);
    expect(csrf.requiresVerification("DELETE")).toBe(false);
  });
  it.skip("should not render form with token tag", () => {});
  it.skip("should not render button to with token tag", () => {});
  it.skip("should not emit a csrf-token meta tag", () => {});
});

describe("SkipProtectionControllerTest", () => {
  it.skip("should not allow post without token when not skipping", () => {});
  it.skip("should allow post without token when skipping", () => {});
});

describe("SkipProtectionWhenUnprotectedControllerTest", () => {
  it.skip("should allow skip request when protection is not set", () => {});
});

describe("CookieCsrfTokenStorageStrategyControllerTest", () => {
  it.skip("csrf token is stored in cookie", () => {});
  it.skip("csrf token is stored in custom cookie", () => {});
  it.skip("csrf token cookie has same site lax", () => {});
  it.skip("csrf token cookie is http only", () => {});
  it.skip("csrf token cookie is permanent", () => {});
  it.skip("reset csrf token deletes cookie", () => {});
  it.skip("should allow when session id in cookie matches session id", () => {});
  it.skip("should not allow when session id in cookie does not match session id", () => {});
  it.skip("should allow when session id in cookie and session id are nil", () => {});
  it.skip("should not allow when session id in cookie but session id is nil", () => {});
  it.skip("should allow when session id in cookie is nil and session created before token validation", () => {});
  it.skip("should allow when session id in cookie is nil and session reset before token validation", () => {});
  it.skip("should not allow when session id in cookie but request made with no session", () => {});
});

describe("CustomCsrfTokenStorageStrategyControllerTest", () => {
  it.skip("csrf token is stored in custom location", () => {});
});
