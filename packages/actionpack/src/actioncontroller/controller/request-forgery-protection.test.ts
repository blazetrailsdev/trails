import { describe, it } from "vitest";

describe("RequestForgeryProtectionControllerUsingNullSessionTest", () => {
  it.skip("should allow to set signed cookies", () => {});
  it.skip("should allow to set encrypted cookies", () => {});
});

describe("PrependProtectForgeryBaseControllerTest", () => {
  it.skip("verify authenticity token is prepended", () => {});
  it.skip("verify authenticity token is not prepended", () => {});
  it.skip("verify authenticity token is not prepended by default", () => {});
});

describe("FreeCookieControllerTest", () => {
  it.skip("should not render form with token tag", () => {});
  it.skip("should not render button to with token tag", () => {});
  it.skip("should allow all methods without token", () => {});
  it.skip("should not emit a csrf-token meta tag", () => {});
});

describe("PerFormTokensControllerTest", () => {
  it.skip("rejects garbage path", () => {});
  it.skip("rejects token for incorrect method button to", () => {});
  it.skip("Accepts proper token for implicit post method on button_to tag", () => {});
  it.skip("Accepts proper token for  method on button_to tag", () => {});
  it.skip("does not return old csrf token", () => {});
  it.skip("accepts old csrf token", () => {});
  it.skip("handles relative paths", () => {});
  it.skip("handles relative paths with dot", () => {});
  it.skip("ignores origin during generation", () => {});
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
it.skip("should allow post without token on unsafe action", () => {});
it.skip("should allow delete with token in header", () => {});
it.skip("should allow patch with token in header", () => {});
it.skip("should allow put with token in header", () => {});
it.skip("should only allow same origin js get with xhr header", () => {});
it.skip("should warn on not same origin js", () => {});
it.skip("should not warn if csrf logging disabled and not same origin js", () => {});
it.skip("should allow non get js without xhr header", () => {});
it.skip("should only allow cross origin js get without xhr header if protection disabled", () => {});
