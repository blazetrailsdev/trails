import { describe, it, expect, beforeEach } from "vitest";
import { TestCase } from "../test-case.js";
import { Base } from "../base.js";

class ActionPackAssertionsController extends Base {
  async nothing() {
    this.head(200);
  }
  async redirectInternal() {
    this.redirectTo("http://test.host/nothing");
  }
  async redirectExternal() {
    this.redirectTo("http://www.rubyonrails.org");
  }
  async redirectExternalProtocolRelative() {
    this.redirectTo("//www.rubyonrails.org");
  }
  async redirectToPath() {
    this.redirectTo("http://test.host/some/path");
  }
  async redirectInvalidExternalRoute() {
    this.redirectTo("ht_tp://www.rubyonrails.org");
  }
  async redirectPermanently() {
    this.redirectTo("http://test.host/some/path", { status: 301 });
  }
  async response404() {
    this.head(404);
  }
  async response500() {
    this.head(500);
  }
  async response599() {
    this.head(599);
  }
  async flashMe() {
    this.flash.set("hello", "my name is inigo montoya...");
    this.render({ plain: "Inconceivable!" });
  }
  async flashMeNaked() {
    this.flash.clear();
    this.render({ plain: "wow!" });
  }
  async assignThis() {
    (this as any).howdy = "ho";
    this.render({ plain: "Mr. Henke" });
  }
  async renderBasedOnParameters() {
    const name = this.params.get("name") ?? "";
    this.render({ plain: `Mr. ${name}` });
  }
  async sessionStuffing() {
    this.session["xmas"] = "turkey";
    this.render({ plain: "ho ho ho" });
  }
  async raiseExceptionOnGet() {
    const method = this.request.method;
    if (method === "GET") throw new Error("get");
    this.render({ plain: `request method: ${method}` });
  }
  async raiseExceptionOnPost() {
    const method = this.request.method;
    if (method === "POST") throw new Error("post");
    this.render({ plain: `request method: ${method}` });
  }
  async renderTextWithCustomContentType() {
    this.render({ body: "Hello!", contentType: "application/rss+xml" });
  }
  async redirectToController() {
    this.redirectTo("http://test.host/elsewhere/flash_me");
  }
  async redirectToControllerWithSymbol() {
    this.redirectTo("http://test.host/elsewhere/flash_me");
  }
  async redirectToAction() {
    this.redirectTo("http://test.host/action_pack_assertions/flash_me?id=1&panda=fun");
  }
}

class AssertResponseWithUnexpectedErrorController extends Base {
  async index() {
    throw new Error("FAIL");
  }
  async show() {
    this.render({ plain: "Boom", status: 500 });
  }
}

describe("ActionPackAssertionsControllerTest", () => {
  let tc: TestCase;
  beforeEach(() => {
    tc = new TestCase(ActionPackAssertionsController);
  });

  it.skip("render file absolute path", () => {
    /* depends on filesystem template rendering */
  });
  it.skip("render file relative path", () => {
    /* depends on filesystem template rendering */
  });

  it("get request", async () => {
    await expect(tc.get("raiseExceptionOnGet")).rejects.toThrow("get");
    await tc.get("raiseExceptionOnPost");
    expect(tc.responseBody).toContain("GET");
  });

  it("post request", async () => {
    await expect(tc.post("raiseExceptionOnPost")).rejects.toThrow("post");
    await tc.post("raiseExceptionOnGet");
    expect(tc.responseBody).toContain("POST");
  });

  it("get post request switch", async () => {
    await tc.post("raiseExceptionOnGet");
    expect(tc.responseBody).toContain("POST");
    await tc.get("raiseExceptionOnPost");
    expect(tc.responseBody).toContain("GET");
    await tc.post("raiseExceptionOnGet");
    expect(tc.responseBody).toContain("POST");
    await tc.get("raiseExceptionOnPost");
    expect(tc.responseBody).toContain("GET");
  });

  it.skip("string constraint", () => {
    /* depends on with_routing / routing DSL */
  });
  it.skip("with routing works with api only controllers", () => {
    /* depends on with_routing */
  });
  it.skip("assert redirect to named route failure", () => {
    /* depends on with_routing / named routes */
  });
  it.skip("assert redirect to nested named route", () => {
    /* depends on with_routing / named routes */
  });
  it.skip("assert redirected to top level named route from nested controller", () => {
    /* depends on with_routing */
  });
  it.skip("assert redirected to top level named route with same controller name in both namespaces", () => {
    /* depends on with_routing */
  });
  it.skip("assert redirect failure message with protocol relative url", () => {
    /* depends on with_routing */
  });

  it("template objects exist", async () => {
    await tc.get("assignThis");
    expect((tc.controller as any).howdy).toBe("ho");
  });

  it("template objects missing", async () => {
    await tc.get("nothing");
    expect((tc.controller as any).howdy).toBeUndefined();
  });

  it("empty flash", async () => {
    await tc.get("flashMeNaked");
    expect(tc.flash.empty).toBe(true);
  });

  it("flash exist", async () => {
    await tc.get("flashMe");
    expect(tc.flash.empty).toBe(false);
    expect(tc.flash.get("hello")).toBeTruthy();
  });

  it("flash does not exist", async () => {
    await tc.get("nothing");
    expect(tc.flash.empty).toBe(true);
  });

  it("session exist", async () => {
    await tc.get("sessionStuffing");
    expect(tc.session["xmas"]).toBe("turkey");
  });

  it("redirection location", async () => {
    await tc.get("redirectInternal");
    expect(tc.response.redirectUrl).toBe("http://test.host/nothing");
    await tc.get("redirectExternal");
    expect(tc.response.redirectUrl).toBe("http://www.rubyonrails.org");
    await tc.get("redirectExternalProtocolRelative");
    expect(tc.response.redirectUrl).toBe("//www.rubyonrails.org");
  });

  it("no redirect url", async () => {
    await tc.get("nothing");
    expect(tc.response.redirectUrl).toBeFalsy();
  });

  it("server error response code", async () => {
    await tc.get("response500");
    expect(tc.response.serverError).toBe(true);
    await tc.get("response599");
    expect(tc.response.serverError).toBe(true);
    await tc.get("response404");
    expect(tc.response.serverError).toBe(false);
  });

  it("missing response code", async () => {
    await tc.get("response404");
    expect(tc.response.notFound).toBe(true);
  });

  it("client error response code", async () => {
    await tc.get("response404");
    expect(tc.response.clientError).toBe(true);
  });

  it("redirect url match", async () => {
    await tc.get("redirectExternal");
    expect(tc.response.redirection).toBe(true);
    expect(tc.response.redirectUrl).toMatch(/rubyonrails/);
    expect(tc.response.redirectUrl).not.toMatch(/perloffrails/);
  });

  it("redirection", async () => {
    await tc.get("redirectInternal");
    expect(tc.response.redirection).toBe(true);
    await tc.get("redirectExternal");
    expect(tc.response.redirection).toBe(true);
    await tc.get("nothing");
    expect(tc.response.redirection).toBe(false);
  });

  it("successful response code", async () => {
    await tc.get("nothing");
    expect(tc.response.successful).toBe(true);
  });

  it("response object", async () => {
    await tc.get("nothing");
    expect(tc.response).toBeDefined();
  });

  it("render based on parameters", async () => {
    await tc.get("renderBasedOnParameters", { params: { name: "David" } });
    expect(tc.responseBody).toBe("Mr. David");
  });

  it("assert redirection fails with incorrect controller", async () => {
    await tc.get("redirectToController");
    expect(() =>
      tc.assertRedirectedTo("http://test.host/action_pack_assertions/flash_me"),
    ).toThrow();
  });

  it("assert redirection with extra controller option", async () => {
    await tc.get("redirectToAction");
    expect(tc.response.redirection).toBe(true);
    expect(tc.response.redirectUrl).toContain("flash_me");
  });

  it("redirected to url leading slash", async () => {
    await tc.get("redirectToPath");
    tc.assertRedirectedTo("http://test.host/some/path");
  });

  it("redirected to url no leading slash fails", async () => {
    await tc.get("redirectToPath");
    expect(() => tc.assertRedirectedTo("some/path")).toThrow();
  });

  it("redirect invalid external route", async () => {
    await tc.get("redirectInvalidExternalRoute");
    expect(tc.response.redirectUrl).toBe("ht_tp://www.rubyonrails.org");
  });

  it("redirected to url full url", async () => {
    await tc.get("redirectToPath");
    tc.assertRedirectedTo("http://test.host/some/path");
  });

  it("assert redirection with symbol", async () => {
    await tc.get("redirectToControllerWithSymbol");
    expect(tc.response.redirection).toBe(true);
    expect(tc.response.redirectUrl).toContain("elsewhere");
  });

  it.skip("assert redirection with custom message", () => {
    /* depends on assertRedirectedTo custom message parameter */
  });

  it("assert redirection with status", async () => {
    await tc.get("redirectToPath");
    expect(tc.response.statusCode).toBe(302);
    tc.assertRedirectedTo("http://test.host/some/path");
    await tc.get("redirectPermanently");
    expect(tc.response.statusCode).toBe(301);
    tc.assertRedirectedTo("http://test.host/some/path");
  });

  it.skip("redirected to with nested controller", () => {
    /* depends on namespaced controller routing */
  });

  it("assert response uses exception message", async () => {
    const tc2 = new TestCase(AssertResponseWithUnexpectedErrorController);
    await expect(tc2.get("index")).rejects.toThrow("FAIL");
  });

  it("assert response failure response with no exception", async () => {
    const tc2 = new TestCase(AssertResponseWithUnexpectedErrorController);
    await tc2.get("show");
    tc2.assertResponse(500);
    expect(tc2.responseBody).toBe("Boom");
  });
});

describe("ActionPackHeaderTest", () => {
  let tc: TestCase;
  beforeEach(() => {
    tc = new TestCase(ActionPackAssertionsController);
  });

  it.skip("rendering xml sets content type", () => {
    /* depends on XML template rendering */
  });
  it.skip("rendering xml respects content type", () => {
    /* depends on XML template rendering */
  });
  it.skip("rendering xml respects content type when set in the header", () => {
    /* depends on XML template rendering */
  });

  it("render text with custom content type", async () => {
    await tc.get("renderTextWithCustomContentType");
    expect(tc.response.getHeader("Content-Type")).toContain("application/rss+xml");
  });
});
