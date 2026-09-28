/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging --
   Ruby `include RoutingTestHelpers` / `include CookieAssertions`; the class/interface merge is how
   `include()` surfaces those members on the type side. */
import { beforeEach, describe, expect, it } from "vitest";
import { include, type Included } from "@blazetrails/activesupport";
import { URI } from "@blazetrails/ruby-compat";

import { helper, type HelpersClassMethods } from "../abstract-controller/helpers.js";
import { Base } from "../action-controller/base.js";
import { Request } from "../action-dispatch/http/request.js";
import { Response } from "../action-dispatch/http/response.js";
import { RoutingError } from "../action-controller/metal/exceptions.js";
import { deprecator } from "../action-dispatch/deprecator.js";
import type { RouteSet } from "../action-dispatch/routing/route-set.js";
import {
  AccountsController,
  CommentsController,
  CookieAssertions,
  FIXTURE_LOAD_PATH,
  HeadersAssertions,
  ResourcesController,
  RoutingTestHelpers,
  RoutingVerbs,
} from "./abstract-unit.js";
import { GamesHelper } from "./fixtures/helpers/fun/games-helper.js";

class FixtureLoadPathController extends Base {
  async helloWorldWithLayout(): Promise<void> {
    await this.render({ template: "test/hello_world", layout: "layouts/standard" });
  }

  async renderHelloWorld(): Promise<void> {
    await this.render({ inline: "hello: <%= stratego() %>" });
  }
}
FixtureLoadPathController.prependViewPath(FIXTURE_LOAD_PATH);
helper(FixtureLoadPathController as unknown as HelpersClassMethods, GamesHelper);

async function dispatch(action: string): Promise<unknown> {
  const controller = new FixtureLoadPathController();
  const env = { REQUEST_METHOD: "GET", PATH_INFO: "/", HTTP_HOST: "localhost" };
  await controller.dispatch(action, new Request(env), new Response());
  return controller.responseBody;
}

describe("FIXTURE_LOAD_PATH", () => {
  it("renders a template inside a fixture layout", async () => {
    expect(await dispatch("helloWorldWithLayout")).toBe("<html>Hello world!</html>\n");
  });

  it("renders through a fixture helper module", async () => {
    expect(await dispatch("renderHelloWorld")).toBe("hello: Iz guuut!");
  });
});

class RoutingHost {
  routes!: RouteSet;
  controller: Base | null = null;
}
interface RoutingHost extends Included<typeof RoutingTestHelpers>, Included<typeof RoutingVerbs> {}
include(RoutingHost, RoutingTestHelpers);
include(RoutingHost, RoutingVerbs);

describe("RoutingTestHelpers", () => {
  let tc: RoutingHost;

  beforeEach(() => {
    tc = new RoutingHost();
  });

  it("make_set captures the dispatched controller and verbs return the body", async () => {
    tc.routes = tc.makeSet(false);
    tc.routes.draw((r) => {
      deprecator().silence(() => {
        r.get(":controller(/:action(/:id))");
      });
    });

    expect(await tc.get(URI.parse("http://test.host/posts/show/1"))).toBe("");
    expect(tc.controller).toBeInstanceOf(Base);
    expect(tc.controller!.request.pathParameters).toEqual({
      controller: "posts",
      action: "show",
      id: "1",
    });
    expect(await tc.requestPathParams("/posts/edit/2", { method: "get" })).toEqual({
      controller: "posts",
      action: "edit",
      id: "2",
    });
  });

  it("request_path_params raises RoutingError when no route matches", async () => {
    tc.routes = tc.makeSet(false);
    tc.routes.draw((r) => {
      r.get("/posts", { to: "posts#index" });
    });

    await expect(tc.requestPathParams("/nowhere")).rejects.toThrow(
      new RoutingError('No route matches "/nowhere"'),
    );
  });

  it("a strict set dispatches to the routed controller class", async () => {
    tc.routes = tc.makeSet();
    tc.routes.draw((r) => {
      r.resources("comments");
      r.resources("accounts");
    });

    await tc.get(URI.parse("http://test.host/comments/1"));
    expect(tc.controller).toBeInstanceOf(CommentsController);
    expect(tc.controller).toBeInstanceOf(ResourcesController);
    await tc.get(URI.parse("http://test.host/accounts"));
    expect(tc.controller).toBeInstanceOf(AccountsController);
  });

  it("url_for generates an only-path url through use_route", () => {
    const set = tc.makeSet(false);
    set.draw((r) => {
      r.get("/admin/users", { to: "admin/users#index", as: "admin_users" });
    });

    expect(tc.urlFor(set, { useRoute: "admin_users" })).toBe("/admin/users");
  });
});

class AssertionsHost {
  response = new Response();
}
interface AssertionsHost
  extends Included<typeof CookieAssertions>, Included<typeof HeadersAssertions> {}
include(AssertionsHost, CookieAssertions);
include(AssertionsHost, HeadersAssertions);

describe("CookieAssertions", () => {
  let tc: AssertionsHost;

  beforeEach(() => {
    tc = new AssertionsHost();
    tc.response.setHeader(
      "Set-Cookie",
      "user_name=david; path=/; SameSite=Lax\nlogin=XJ-122; path=/; HttpOnly",
    );
  });

  it("parses the set-cookie header into names and attributes", () => {
    const cookies = tc.parseSetCookiesHeaders(tc.response.headers.get("Set-Cookie"));
    expect([...cookies.keys()]).toEqual(["user_name", "login"]);
    expect(cookies.get("login")).toEqual({ value: "XJ-122", path: "/", httponly: true });
    expect(tc.parseSetCookieAttributes("Path=/; Secure")).toEqual({ path: "/", secure: true });
  });

  it("asserts cookie attributes and headers", () => {
    tc.assertSetCookieAttributes("user_name", { samesite: "lax" });
    tc.assertSetCookieAttributes("login", "httponly");
    tc.assertNotSetCookieAttributes("user_name", { httponly: true, samesite: "strict" });
    tc.assertSetCookieHeader(["login=XJ-122; path=/; HttpOnly"]);
    tc.assertNotSetCookieHeader("remember_me");

    expect(() => tc.assertSetCookieAttributes("missing", {})).toThrow(
      "No cookie found with the name 'missing', found cookies: user_name, login",
    );
    expect(() => tc.assertNotSetCookieAttributes("login", "httponly")).toThrow();
    expect(() => tc.assertSetCookieHeader("user_name=david; path=/; SameSite=Strict")).toThrow();
    expect(() => tc.assertNotSetCookieHeader("login")).toThrow();
  });
});

describe("HeadersAssertions", () => {
  let tc: AssertionsHost;

  beforeEach(() => {
    tc = new AssertionsHost();
    tc.response.setHeader("Content-Type", "text/html");
  });

  it("asserts normalized headers", () => {
    tc.assertHeaders({ "content-type": "text/html" });
    tc.assertHeader("content-type", "text/html");
    tc.assertNotHeader("x-missing");
    tc.assertHeaderValue("a,b", ["a", "b"]);

    expect(() => tc.assertHeader("content-type", "text/plain")).toThrow();
    expect(() => tc.assertNotHeader("content-type")).toThrow();
  });
});
