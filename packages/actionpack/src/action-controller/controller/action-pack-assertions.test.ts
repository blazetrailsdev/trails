import { registerConstant } from "@blazetrails/ruby-compat";
import { describe, it, expect, beforeEach } from "vitest";
import {
  Assertion,
  assertEqual,
  assertNothingRaised,
  assertRaise,
} from "@blazetrails/activesupport";
import { TestCase } from "../test-case.js";
import { Base } from "../base.js";
import { deprecator } from "../../action-dispatch/deprecator.js";
import type { RouteSet } from "../../action-dispatch/routing/route-set.js";

registerConstant("Admin", { name: "Admin" });
import "../../test-helpers/abstract-unit.js";

class ActionPackAssertionsController extends Base {
  declare routeOneUrl: () => string;
  declare routeTwoUrl: () => string;

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
  async redirectToNamedRoute() {
    this.redirectTo(this.routeOneUrl());
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
    await this.render({ plain: "Inconceivable!" });
  }
  async flashMeNaked() {
    this.flash.clear();
    await this.render({ plain: "wow!" });
  }
  async assignThis() {
    (this as any).howdy = "ho";
    await this.render({ plain: "Mr. Henke" });
  }
  async renderBasedOnParameters() {
    const name = this.params.get("name") ?? "";
    await this.render({ plain: `Mr. ${name}` });
  }
  async sessionStuffing() {
    this.session.set("xmas", "turkey");
    await this.render({ plain: "ho ho ho" });
  }
  async raiseExceptionOnGet() {
    const method = this.request.method;
    if (method === "GET") throw new Error("get");
    await this.render({ plain: `request method: ${method}` });
  }
  async raiseExceptionOnPost() {
    const method = this.request.method;
    if (method === "POST") throw new Error("post");
    await this.render({ plain: `request method: ${method}` });
  }
  async renderTextWithCustomContentType() {
    await this.render({ body: "Hello!", contentType: "application/rss+xml" });
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
    await this.render({ plain: "Boom", status: 500 });
  }
}

class InnerModuleController extends Base {
  declare adminInnerModulePath: () => string;
  declare topLevelUrl: (options: { id: string }) => string;
  declare topLevelPath: (id: string) => string;

  index() {
    this.head("ok");
  }

  redirectToIndex() {
    this.redirectTo(this.adminInnerModulePath());
  }

  redirectToAbsoluteController() {
    this.redirectTo({ controller: "/content" });
  }

  redirectToFellowController() {
    this.redirectTo({ controller: "user" });
  }

  redirectToTopLevelNamedRoute() {
    this.redirectTo(this.topLevelUrl({ id: "foo" }));
  }
}
Object.defineProperty(InnerModuleController, "name", { value: "Admin::InnerModuleController" });
const Admin = { InnerModuleController };

describe("ActionPackAssertionsControllerTest", () => {
  let tc: TestCase &
    Pick<ActionPackAssertionsController, "routeTwoUrl"> &
    Pick<InnerModuleController, "adminInnerModulePath" | "topLevelPath">;
  const assertRedirectedTo = (...args: Parameters<TestCase["assertRedirectedTo"]>): true =>
    tc.assertRedirectedTo(...args);
  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name) as typeof tc;
    tc.controller = new ActionPackAssertionsController();
    await tc.beforeSetup();
  });

  // BLOCKED: port-action-pack-assertions-render-file-builder-and-api-skips
  it.skip("render file absolute path", () => {});
  it.skip("render file relative path", () => {});

  it("get request", async () => {
    await expect(tc.get("raiseExceptionOnGet")).rejects.toThrow("get");
    await tc.get("raiseExceptionOnPost");
    expect(tc.response.body).toContain("GET");
  });

  it("post request", async () => {
    await expect(tc.post("raiseExceptionOnPost")).rejects.toThrow("post");
    await tc.post("raiseExceptionOnGet");
    expect(tc.response.body).toContain("POST");
  });

  it("get post request switch", async () => {
    await tc.post("raiseExceptionOnGet");
    expect(tc.response.body).toContain("POST");
    await tc.get("raiseExceptionOnPost");
    expect(tc.response.body).toContain("GET");
    await tc.post("raiseExceptionOnGet");
    expect(tc.response.body).toContain("POST");
    await tc.get("raiseExceptionOnPost");
    expect(tc.response.body).toContain("GET");
  });

  it("string constraint", async () => {
    await assertNothingRaised(() => {
      tc.withRouting((set: RouteSet) => {
        set.draw(function () {
          this.get("photos", {
            to: "action_pack_assertions#nothing",
            constraints: { subdomain: "admin" },
          });
        });
      });
    });
  });

  // BLOCKED: api-redirect-to-override-and-head-response-are-invented
  it.skip("with routing works with api only controllers", () => {});

  it("assert redirect to named route failure", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.get("route_one", { to: "action_pack_assertions#nothing", as: "route_one" });
        this.get("route_two", { to: "action_pack_assertions#nothing", id: "two", as: "route_two" });

        deprecator().silence(() => {
          this.get(":controller/:action");
        });
      });
      await tc.process("redirectToNamedRoute");
      await assertRaise([Assertion], {}, () => {
        assertRedirectedTo("http://test.host/route_two");
      });
      await assertRaise([Assertion], {}, () => {
        assertRedirectedTo(/^http:\/\/test.host\/route_two/);
      });
      await assertRaise([Assertion], {}, () => {
        assertRedirectedTo({ controller: "action_pack_assertions", action: "nothing", id: "two" });
      });
      await assertRaise([Assertion], {}, () => {
        assertRedirectedTo(tc.routeTwoUrl());
      });
    });
  });

  it("assert redirect to nested named route", async () => {
    tc.controller = new Admin.InnerModuleController();

    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.get("admin/inner_module", {
          to: "admin/inner_module#index",
          as: "admin_inner_module",
        });

        deprecator().silence(() => {
          this.get(":controller/:action");
        });
      });
      await tc.process("redirectToIndex");
      assertRedirectedTo(tc.adminInnerModulePath());
    });
  });

  it("assert redirected to top level named route from nested controller", async () => {
    tc.controller = new Admin.InnerModuleController();

    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.get("/action_pack_assertions/:id", {
          to: "action_pack_assertions#index",
          as: "top_level",
        });

        deprecator().silence(() => {
          this.get(":controller/:action");
        });
      });
      await tc.process("redirectToTopLevelNamedRoute");
      assertRedirectedTo("/action_pack_assertions/foo");
      assertRedirectedTo(/\/action_pack_assertions\/foo/);
    });
  });

  it("assert redirected to top level named route with same controller name in both namespaces", async () => {
    tc.controller = new Admin.InnerModuleController();

    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.get("/user/:id", { to: "user#index", as: "top_level" });

        deprecator().silence(() => {
          this.get(":controller/:action");
        });
      });
      await tc.process("redirectToTopLevelNamedRoute");
      assertRedirectedTo(tc.topLevelPath("foo"));
    });
  });
  it("assert redirect failure message with protocol relative url", async () => {
    try {
      await tc.process("redirectExternalProtocolRelative");
      assertRedirectedTo("/foo");
    } catch (ex) {
      if (!(ex instanceof Assertion)) throw ex;
      // eslint-disable-next-line vitest/no-conditional-expect -- mirrors Rails' method-level `rescue` (action_pack_assertions_test.rb:285)
      expect(ex.message, "protocol relative URL was incorrectly normalized").not.toMatch(
        new RegExp(`${tc.request.protocol}${tc.request.host}//www.rubyonrails.org`),
      );
    }
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
    expect(tc.flash().isEmpty()).toBe(true);
  });

  it("flash exist", async () => {
    await tc.get("flashMe");
    expect(tc.flash().isEmpty()).toBe(false);
    expect(tc.flash().get("hello")).toBeTruthy();
  });

  it("flash does not exist", async () => {
    await tc.get("nothing");
    expect(tc.flash().isEmpty()).toBe(true);
  });

  it("session exist", async () => {
    await tc.get("sessionStuffing");
    expect(tc.session().get("xmas")).toBe("turkey");
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
    expect(tc.response.isRedirection).toBe(true);
    expect(tc.response.redirectUrl).toMatch(/rubyonrails/);
    expect(tc.response.redirectUrl).not.toMatch(/perloffrails/);
  });

  it("redirection", async () => {
    await tc.get("redirectInternal");
    expect(tc.response.isRedirection).toBe(true);
    await tc.get("redirectExternal");
    expect(tc.response.isRedirection).toBe(true);
    await tc.get("nothing");
    expect(tc.response.isRedirection).toBe(false);
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
    expect(tc.response.body).toBe("Mr. David");
  });

  it("assert redirection fails with incorrect controller", async () => {
    await tc.get("redirectToController");
    expect(() =>
      tc.assertRedirectedTo("http://test.host/action_pack_assertions/flash_me"),
    ).toThrow();
  });

  it("assert redirection with extra controller option", async () => {
    await tc.get("redirectToAction");
    expect(tc.response.isRedirection).toBe(true);
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
    expect(tc.response.redirectUrl).toBe("http://test.hostht_tp://www.rubyonrails.org");
  });

  it("redirected to url full url", async () => {
    await tc.get("redirectToPath");
    tc.assertRedirectedTo("http://test.host/some/path");
  });

  it("assert redirection with symbol", async () => {
    await tc.get("redirectToControllerWithSymbol");
    expect(tc.response.isRedirection).toBe(true);
    expect(tc.response.redirectUrl).toContain("elsewhere");
  });

  it("assert redirection with custom message", async () => {
    const error = await assertRaise([Assertion], {}, () => {
      assertRedirectedTo("http://test.host/some/path", "wrong redirect");
    });

    assertEqual("wrong redirect", error.message);
  });

  it("assert redirection with status", async () => {
    await tc.get("redirectToPath");
    expect(tc.response.statusCode).toBe(302);
    tc.assertRedirectedTo("http://test.host/some/path");
    await tc.get("redirectPermanently");
    expect(tc.response.statusCode).toBe(301);
    tc.assertRedirectedTo("http://test.host/some/path");
  });

  it("redirected to with nested controller", async () => {
    tc.controller = new Admin.InnerModuleController();
    await tc.get("redirectToAbsoluteController");
    assertRedirectedTo({ controller: "/content" });

    await tc.get("redirectToFellowController");
    assertRedirectedTo({ controller: "admin/user" });
  });

  it("assert response uses exception message", async ({ task }) => {
    const tc2 = new TestCase(task.name);
    tc2.controller = new AssertResponseWithUnexpectedErrorController();
    await tc2.beforeSetup();
    await expect(tc2.get("index")).rejects.toThrow("FAIL");
  });

  it("assert response failure response with no exception", async ({ task }) => {
    const tc2 = new TestCase(task.name);
    tc2.controller = new AssertResponseWithUnexpectedErrorController();
    await tc2.beforeSetup();
    await tc2.get("show");
    tc2.assertResponse(500);
    expect(tc2.response.body).toBe("Boom");
  });
});

describe("ActionPackHeaderTest", () => {
  let tc: TestCase;
  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    tc.controller = new ActionPackAssertionsController();
    await tc.beforeSetup();
  });

  // BLOCKED: port-action-pack-assertions-render-file-builder-and-api-skips
  it.skip("rendering xml sets content type", () => {});
  it.skip("rendering xml respects content type", () => {});
  it.skip("rendering xml respects content type when set in the header", () => {});

  it("render text with custom content type", async () => {
    await tc.get("renderTextWithCustomContentType");
    expect(tc.response.getHeader("Content-Type")).toContain("application/rss+xml");
  });
});
