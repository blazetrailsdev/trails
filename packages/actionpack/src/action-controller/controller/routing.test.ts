/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging --
   Ruby `include RoutingTestHelpers` / `include ActionDispatch::RoutingVerbs`; the class/interface
   merge is how `include()` surfaces those members on the type side. */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";

import { ActiveSupportJSON, include, isPresent, type Included } from "@blazetrails/activesupport";
import { bodyFromString } from "@blazetrails/rack";
import { URI, type Module } from "@blazetrails/ruby-compat";
import type { Base } from "../base.js";
import { deprecator } from "../../action-dispatch/deprecator.js";
import { Request } from "../../action-dispatch/http/request.js";
import { RouteSet } from "../../action-dispatch/routing/route-set.js";
import { RoutingError, UrlGenerationError } from "../metal/exceptions.js";
import { ArgumentError } from "@blazetrails/activemodel";
import { controllerConstants } from "../../action-dispatch/http/request.js";
import type { DispatchableControllerClass } from "../../action-dispatch/routing/dispatcher.js";
import { RoutingTestHelpers, RoutingVerbs } from "../../test-helpers/abstract-unit.js";
import "../../test-helpers/lib/controller/fake-controllers.js";

class StubController {}

beforeAll(() => {
  controllerConstants.set("not_a", StubController as unknown as DispatchableControllerClass);
});

function urlFor(rs: RouteSet, options: Record<string, unknown>): string {
  const opts = { ...options };
  return rs.generateExtras(opts)[0];
}

type NamedRoutes = Record<string, (...args: unknown[]) => string>;

class UriReservedCharactersRoutingTest {
  set!: RouteSet;
  segment!: string;
  escaped!: string;
  controller: Base | null = null;
}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- `include RoutingTestHelpers` (`routing_test.rb:15`) is the only module mixed in.
interface UriReservedCharactersRoutingTest extends Included<typeof RoutingTestHelpers> {}
include(UriReservedCharactersRoutingTest, RoutingTestHelpers);

describe("UriReservedCharactersRoutingTest", () => {
  let tc: UriReservedCharactersRoutingTest;

  beforeEach(() => {
    tc = new UriReservedCharactersRoutingTest();
    tc.set = new RouteSet();
    tc.set.draw(function () {
      deprecator().silence(() => {
        this.get(":controller/:action/:variable/*additional");
      });
    });

    const [safe, unsafe] = [
      [":", "@", "&", "=", "+", "$", ",", ";"],
      ["^", "?", "#", "[", "]"],
    ];
    const hex = unsafe.map((char) => "%" + char.charCodeAt(0).toString(16).toUpperCase());

    tc.segment = `${safe.join("")}${unsafe.join("")}`;
    tc.escaped = `${safe.join("")}${hex.join("")}`;
  });

  it("route generation escapes unsafe path characters", () => {
    expect(
      tc.urlFor(tc.set, {
        controller: "content",
        action: `act${tc.segment}ion`,
        variable: `var${tc.segment}iable`,
        additional: [`add${tc.segment}itional-1`, `add${tc.segment}itional-2`],
      }),
    ).toBe(
      `/content/act${tc.escaped}ion/var${tc.escaped}iable/add${tc.escaped}itional-1/add${tc.escaped}itional-2`,
    );
  });

  it("route recognition unescapes path components", () => {
    const options = {
      controller: "content",
      action: `act${tc.segment}ion`,
      variable: `var${tc.segment}iable`,
      additional: `add${tc.segment}itional-1/add${tc.segment}itional-2`,
    };
    expect(
      tc.set.recognizePath(
        `/content/act${tc.escaped}ion/var${tc.escaped}iable/add${tc.escaped}itional-1/add${tc.escaped}itional-2`,
      ),
    ).toEqual(options);
  });

  it("route generation allows passing non string values to generated helper", () => {
    expect(
      tc.urlFor(tc.set, {
        controller: "content",
        action: "action",
        variable: "variable",
        additional: [1, 2],
      }),
    ).toBe("/content/action/variable/1/2");
  });
});

class MockController {
  static build(helpers: Module, additionalOptions: Record<string, unknown> = {}) {
    const klass = class {
      urlOptions(): Record<string, unknown> {
        const options = helpers.superMethod(this, "urlOptions")!() as Record<string, unknown>;
        options.protocol ||= "http";
        options.host ||= "test.host";
        return { ...options, ...additionalOptions };
      }
    };
    include(klass, helpers);
    return klass;
  }
}

class LegacyRouteSetTests {
  rs!: RouteSet;
  controller: Base | null = null;
  response: unknown;

  get routes(): RouteSet {
    return this.rs;
  }

  setupForNamedRoute(options: Record<string, unknown> = {}): NamedRoutes {
    return new (MockController.build(this.rs.urlHelpers(), options))() as unknown as NamedRoutes;
  }
}
interface LegacyRouteSetTests
  extends Included<typeof RoutingTestHelpers>, Included<typeof RoutingVerbs> {}
include(LegacyRouteSetTests, RoutingTestHelpers);
include(LegacyRouteSetTests, RoutingVerbs);

describe("LegacyRouteSetTests", () => {
  let tc: LegacyRouteSetTests;
  let rs: RouteSet;

  beforeEach(() => {
    tc = new LegacyRouteSetTests();
    tc.rs = tc.makeSet();
    tc.response = null;
    rs = tc.rs;
  });

  it("symbols with dashes", async () => {
    rs.draw(function () {
      this.get("/:artist/:song-omg", {
        to: (env: any) => {
          const resp = ActiveSupportJSON.encode(new Request(env).pathParameters);
          return [200, {}, bodyFromString(resp)];
        },
      });
    });

    const hash = ActiveSupportJSON.decode(
      await tc.get(URI.parse("http://example.org/journey/faithfully-omg")),
    );
    expect(hash).toEqual({ artist: "journey", song: "faithfully" });
  });

  it("id encoding", async () => {
    rs.draw(function () {
      this.get("/journey/:id", {
        to: (env: any) => {
          const param = new Request(env).pathParameters;
          const resp = ActiveSupportJSON.encode(param);
          return [200, {}, bodyFromString(resp)];
        },
      });
    });

    const hash = ActiveSupportJSON.decode(
      await tc.get(URI.parse("http://example.org/journey/%E5%A4%AA%E9%83%8E")),
    );
    expect(hash).toEqual({ id: "太郎" });
  });

  it("id with dash", async () => {
    rs.draw(function () {
      this.get("/journey/:id", {
        to: (env: any) => {
          const resp = ActiveSupportJSON.encode(new Request(env).pathParameters);
          return [200, {}, bodyFromString(resp)];
        },
      });
    });

    const hash = ActiveSupportJSON.decode(
      await tc.get(URI.parse("http://example.org/journey/faithfully-omg")),
    );
    expect(hash).toEqual({ id: "faithfully-omg" });
  });

  it("dash with custom regexp", async () => {
    rs.draw(function () {
      this.get("/:artist/:song-omg", {
        constraints: { song: /\d+/ },
        to: (env: any) => {
          const resp = ActiveSupportJSON.encode(new Request(env).pathParameters);
          return [200, {}, bodyFromString(resp)];
        },
      });
    });

    const hash = ActiveSupportJSON.decode(
      await tc.get(URI.parse("http://example.org/journey/123-omg")),
    );
    expect(hash).toEqual({ artist: "journey", song: "123" });
    expect(await tc.get(URI.parse("http://example.org/journey/faithfully-omg"))).toBe("Not Found");
  });

  it("pre dash", async () => {
    rs.draw(function () {
      this.get("/:artist/omg-:song", {
        to: (env: any) => {
          const resp = ActiveSupportJSON.encode(new Request(env).pathParameters);
          return [200, {}, bodyFromString(resp)];
        },
      });
    });

    const hash = ActiveSupportJSON.decode(
      await tc.get(URI.parse("http://example.org/journey/omg-faithfully")),
    );
    expect(hash).toEqual({ artist: "journey", song: "faithfully" });
  });

  it("pre dash with custom regexp", async () => {
    rs.draw(function () {
      this.get("/:artist/omg-:song", {
        constraints: { song: /\d+/ },
        to: (env: any) => {
          const resp = ActiveSupportJSON.encode(new Request(env).pathParameters);
          return [200, {}, bodyFromString(resp)];
        },
      });
    });

    const hash = ActiveSupportJSON.decode(
      await tc.get(URI.parse("http://example.org/journey/omg-123")),
    );
    expect(hash).toEqual({ artist: "journey", song: "123" });
    expect(await tc.get(URI.parse("http://example.org/journey/omg-faithfully"))).toBe("Not Found");
  });

  it("star paths are greedy", async () => {
    rs.draw(function () {
      this.get("/*path", {
        to: (env: any) => {
          const x = env["action_dispatch.request.path_parameters"]["path"];
          return [200, {}, bodyFromString(x)];
        },
        format: false,
      });
    });

    const u = URI.parse("http://example.org/foo/bar.html");
    expect(await tc.get(u)).toBe(u.path!.replace(/^\//, ""));
  });

  it("star paths are greedy but not too much", async () => {
    rs.draw(function () {
      this.get("/*path", {
        to: (env: any) => {
          const x = ActiveSupportJSON.encode(env["action_dispatch.request.path_parameters"]);
          return [200, {}, bodyFromString(x)];
        },
      });
    });

    const expected = { path: "foo/bar", format: "html" };
    const u = URI.parse("http://example.org/foo/bar.html");
    expect(ActiveSupportJSON.decode(await tc.get(u))).toEqual(expected);
  });

  it("optional star paths are greedy", async () => {
    rs.draw(function () {
      this.get("/(*filters)", {
        to: (env: any) => {
          const x = env["action_dispatch.request.path_parameters"]["filters"];
          return [200, {}, bodyFromString(x)];
        },
        format: false,
      });
    });

    const u = URI.parse("http://example.org/ne_27.065938,-80.6092/sw_25.489856,-82.542794");
    expect(await tc.get(u)).toBe(u.path!.replace(/^\//, ""));
  });

  it("optional star paths are greedy but not too much", async () => {
    rs.draw(function () {
      this.get("/(*filters)", {
        to: (env: any) => {
          const x = ActiveSupportJSON.encode(env["action_dispatch.request.path_parameters"]);
          return [200, {}, bodyFromString(x)];
        },
      });
    });

    const expected = { filters: "ne_27.065938,-80.6092/sw_25.489856,-82", format: "542794" };
    const u = URI.parse("http://example.org/ne_27.065938,-80.6092/sw_25.489856,-82.542794");
    expect(ActiveSupportJSON.decode(await tc.get(u))).toEqual(expected);
  });

  it("regexp precedence", async () => {
    rs.draw(function () {
      this.get("/whois/:domain", {
        constraints: { domain: /\w+\.[\w.]+/ },
        to: (_env: any) => [200, {}, bodyFromString("regexp")],
      });

      this.get("/whois/:id", { to: (_env: any) => [200, {}, bodyFromString("id")] });
    });

    expect(await tc.get(URI.parse("http://example.org/whois/example.org"))).toBe("regexp");
    expect(await tc.get(URI.parse("http://example.org/whois/123"))).toBe("id");
  });

  it("class and lambda constraints", async () => {
    const subdomain = class {
      matches(request: Request): boolean {
        return isPresent(request.subdomain()) && request.subdomain() !== "clients";
      }
    };

    rs.draw(function () {
      this.get("/", {
        constraints: new subdomain(),
        to: (_env: any) => [200, {}, bodyFromString("default")],
      });
      this.get("/", {
        constraints: { subdomain: "clients" },
        to: (_env: any) => [200, {}, bodyFromString("clients")],
      });
    });

    expect(await tc.get(URI.parse("http://www.example.org/"))).toBe("default");
    expect(await tc.get(URI.parse("http://clients.example.org/"))).toBe("clients");
  });

  it("format symbol constraints", async () => {
    rs.draw(function () {
      this.get("/api", {
        constraints: { format: "json" },
        to: (_env: any) => [200, {}, bodyFromString("json")],
      });
      this.get("/api", {
        constraints: { format: "xml" },
        to: (_env: any) => [200, {}, bodyFromString("xml")],
      });
    });

    expect(await tc.get(URI.parse("http://www.example.org/api.json"))).toBe("json");
    expect(await tc.get(URI.parse("http://clients.example.org/api.xml"))).toBe("xml");
  });

  it("lambda constraints", async () => {
    rs.draw(function () {
      this.get("/", {
        constraints: (req: Request) => isPresent(req.subdomain()) && req.subdomain() !== "clients",
        to: (_env: any) => [200, {}, bodyFromString("default")],
      });

      this.get("/", {
        constraints: (req: Request) => isPresent(req.subdomain()) && req.subdomain() === "clients",
        to: (_env: any) => [200, {}, bodyFromString("clients")],
      });
    });

    expect(await tc.get(URI.parse("http://www.example.org/"))).toBe("default");
    expect(await tc.get(URI.parse("http://clients.example.org/"))).toBe("clients");
  });

  it("scoped lambda", async () => {
    let scopeCalled = false;
    rs.draw(function () {
      this.scope("/foo", { constraints: (_req: Request) => (scopeCalled = true) }, () => {
        this.get("/", { to: (_env: any) => [200, {}, bodyFromString("default")] });
      });
    });

    expect(await tc.get(URI.parse("http://www.example.org/foo/"))).toBe("default");
    expect(scopeCalled, "scope constraint should be called").toBeTruthy();
  });

  it("scoped lambda with get lambda", async () => {
    let innerCalled = false;

    rs.draw(function () {
      this.scope(
        "/foo",
        { constraints: (_req: Request) => expect.fail("should not be called") },
        () => {
          this.get("/", {
            constraints: (_req: Request) => (innerCalled = true),
            to: (_env: any) => [200, {}, bodyFromString("default")],
          });
        },
      );
    });

    expect(await tc.get(URI.parse("http://www.example.org/foo/"))).toBe("default");
    expect(innerCalled, "inner constraint should be called").toBeTruthy();
  });

  it("empty string match", async () => {
    rs.draw(function () {
      this.get("/:username", {
        constraints: { username: /[^/]+/ },
        to: (_e: any) => [200, {}, bodyFromString("foo")],
      });
    });
    expect(await tc.get(URI.parse("http://example.org/"))).toBe("Not Found");
    expect(await tc.get(URI.parse("http://example.org/hello"))).toBe("foo");
  });

  it("non greedy glob regexp", async () => {
    let params: unknown = null;
    rs.draw(function () {
      this.get("/posts/:id(/*filters)", {
        constraints: { filters: /.+?/ },
        to: (e: any) => {
          params = e["action_dispatch.request.path_parameters"];
          return [200, {}, bodyFromString("foo")];
        },
      });
    });
    expect(await tc.get(URI.parse("http://example.org/posts/1/foo.js"))).toBe("foo");
    expect(params).toEqual({ id: "1", filters: "foo", format: "js" });
  });

  it("specific controller action failure", () => {
    rs.draw(function () {
      this.mount(new Map<unknown, unknown>([[() => {}, "/foo"]]));
    });

    expect(() => tc.urlFor(rs, { controller: "omg", action: "lol" })).toThrow(UrlGenerationError);
  });

  it("default setup", async () => {
    rs.draw(function () {
      deprecator().silence(() => {
        this.get("/:controller(/:action(/:id))");
      });
    });
    expect(rs.recognizePath("/content")).toEqual({ controller: "content", action: "index" });
    expect(rs.recognizePath("/content/list")).toEqual({ controller: "content", action: "list" });
    expect(rs.recognizePath("/content/show/10")).toEqual({
      controller: "content",
      action: "show",
      id: "10",
    });

    expect(rs.recognizePath("/admin/user/show/10")).toEqual({
      controller: "admin/user",
      action: "show",
      id: "10",
    });

    expect(tc.urlFor(rs, { controller: "admin/user", action: "show", id: 10 })).toBe(
      "/admin/user/show/10",
    );

    await tc.get(URI.parse("http://test.host/admin/user/list/10"));

    expect(tc.controller!.request.pathParameters).toEqual({
      controller: "admin/user",
      action: "list",
      id: "10",
    });

    expect(tc.controller!.urlFor({ action: "show", onlyPath: true })).toBe("/admin/user/show");
    expect(tc.controller!.urlFor({ onlyPath: true })).toBe("/admin/user/list/10");

    expect(tc.controller!.urlFor({ controller: "stuff", onlyPath: true })).toBe("/admin/stuff");
    expect(tc.controller!.urlFor({ controller: "/stuff", onlyPath: true })).toBe("/stuff");
  });

  it("route uri pattern", async () => {
    rs.draw(function () {
      deprecator().silence(() => {
        this.get("/:controller(/:action(/:id))");
      });
    });

    await tc.get(URI.parse("http://test.host/admin/user/list/10"));

    expect(tc.controller!.request.routeUriPattern).toBe("/:controller(/:action(/:id))(.:format)");

    expect(tc.controller!.request.getHeader("action_dispatch.route_uri_pattern")).toBe(
      "/:controller(/:action(/:id))(.:format)",
    );
  });

  it("route with colon first", () => {
    rs.draw(function () {
      deprecator().silence(() => {
        this.get("/:controller/:action/:id", { action: "index", id: null });
      });

      this.get(":url", { controller: "content", action: "translate" });
    });

    expect(rs.recognizePath("/example")).toEqual({
      controller: "content",
      action: "translate",
      url: "example",
    });
  });

  it("route with regexp for action", () => {
    rs.draw(function () {
      deprecator().silence(() => {
        this.get("/:controller/:action", { action: /auth[-|_].+/ });
      });
    });

    expect(rs.recognizePath("/content/auth_google")).toEqual({
      action: "auth_google",
      controller: "content",
    });
    expect(rs.recognizePath("/content/auth-twitter")).toEqual({
      action: "auth-twitter",
      controller: "content",
    });

    expect(tc.urlFor(rs, { controller: "content", action: "auth_google" })).toBe(
      "/content/auth_google",
    );
    expect(tc.urlFor(rs, { controller: "content", action: "auth-twitter" })).toBe(
      "/content/auth-twitter",
    );
  });

  it("route with regexp for controller", () => {
    rs.draw(function () {
      deprecator().silence(() => {
        this.get(":controller/:admintoken(/:action(/:id))", { controller: /admin\/.+/ });
        this.get("/:controller(/:action(/:id))");
      });
    });

    expect(rs.recognizePath("/admin/user/foo")).toEqual({
      controller: "admin/user",
      admintoken: "foo",
      action: "index",
    });
    expect(rs.recognizePath("/content/foo")).toEqual({ controller: "content", action: "foo" });

    expect(tc.urlFor(rs, { controller: "admin/user", admintoken: "foo", action: "index" })).toBe(
      "/admin/user/foo",
    );
    expect(tc.urlFor(rs, { controller: "content", action: "foo" })).toBe("/content/foo");
  });

  it("route with regexp and captures for controller", () => {
    rs.draw(function () {
      deprecator().silence(() => {
        this.get("/:controller(/:action(/:id))", { controller: /admin\/(accounts|users)/ });
      });
    });
    expect(rs.recognizePath("/admin/accounts")).toEqual({
      controller: "admin/accounts",
      action: "index",
    });
    expect(rs.recognizePath("/admin/users")).toEqual({
      controller: "admin/users",
      action: "index",
    });
    expect(() => rs.recognizePath("/admin/products")).toThrow(RoutingError);
  });

  it("route with regexp and dot", () => {
    rs.draw(function () {
      deprecator().silence(() => {
        this.get(":controller/:action/:file", {
          controller: /admin|user/,
          action: /upload|download/,
          defaults: { file: null },
          constraints: { file: /[^/]+(\.[^/]+)?/ },
        });
      });
    });
    expect(tc.urlFor(rs, { controller: "user", action: "download", file: "file" })).toBe(
      "/user/download/file",
    );

    expect(rs.recognizePath("/user/download/file")).toEqual({
      controller: "user",
      action: "download",
      file: "file",
    });

    expect(tc.urlFor(rs, { controller: "user", action: "download", file: "file.jpg" })).toBe(
      "/user/download/file.jpg",
    );

    expect(rs.recognizePath("/user/download/file.jpg")).toEqual({
      controller: "user",
      action: "download",
      file: "file.jpg",
    });
  });

  it("basic named route", () => {
    rs.draw(function () {
      this.root({ to: "content#list", as: "home" });
    });
    expect(tc.setupForNamedRoute().homeUrl()).toBe("http://test.host/");
  });

  it("named route with option", () => {
    rs.draw(function () {
      this.get({ "page/:title": "content#show_page", as: "page" });
    });

    expect(tc.setupForNamedRoute().pageUrl({ title: "new stuff" })).toBe(
      "http://test.host/page/new%20stuff",
    );
  });

  it("named route with default", () => {
    rs.draw(function () {
      this.get({ "page/:title": "content#show_page", title: "AboutPage", as: "page" });
    });

    expect(tc.setupForNamedRoute().pageUrl({ title: "AboutRails" })).toBe(
      "http://test.host/page/AboutRails",
    );
  });

  it("named route with path prefix", () => {
    rs.draw(function () {
      this.scope("my", () => {
        this.get({ page: "content#show_page", as: "page" });
      });
    });

    expect(tc.setupForNamedRoute().pageUrl()).toBe("http://test.host/my/page");
  });

  it("named route with blank path prefix", () => {
    rs.draw(function () {
      this.scope("", () => {
        this.get({ page: "content#show_page", as: "page" });
      });
    });

    expect(tc.setupForNamedRoute().pageUrl()).toBe("http://test.host/page");
  });

  it("named route with nested controller", () => {
    rs.draw(function () {
      this.get({ "admin/user": "admin/user#index", as: "users" });
    });

    expect(tc.setupForNamedRoute().usersUrl()).toBe("http://test.host/admin/user");
  });

  it("optimised named route with host", () => {
    rs.draw(function () {
      this.get({ page: "content#show_page", as: "pages", host: "foo.com" });
    });
    const routes = tc.setupForNamedRoute();
    expect(routes.pagesUrl()).toBe("http://foo.com/page");
  });

  it("paths escaped", () => {
    rs.draw(function () {
      this.get("file/*path", { to: "content#show_file", as: "path" });
      this.get(":controller/:action/:id", {});
    });

    const results = rs.recognizePath("/file/hello+world/how+are+you%3F");
    expect(results).toBeTruthy();
    expect(results["path"]).toBe("hello+world/how+are+you?");

    const results2 = rs.recognizePath("/file/hello%20world/how%20are%20you%3F");
    expect(results2).toBeTruthy();
    expect(results2["path"]).toBe("hello world/how are you?");
  });

  it.skip("non controllers cannot be matched", () => {
    rs.draw(function () {
      this.get(":controller/:action/:id", {});
    });

    expect(() => rs.recognizePath("/not_a/show/10")).toThrow(RoutingError);
  });

  it.skip("should list options diff when routing constraints dont match", () => {
    rs.draw(function () {
      this.get("post/:id", { to: "post#show", constraints: { id: /\d+/ }, as: "post" });
    });

    expect(() =>
      urlFor(rs, { controller: "post", action: "show", bad_param: "foo", useRoute: "post" }),
    ).toThrow(UrlGenerationError);
  });

  it.skip("dynamic path allowed", () => {
    rs.draw(function () {
      this.get("*path", { to: "content#show_file" });
    });

    expect(urlFor(rs, { controller: "content", action: "show_file", path: ["pages", "boo"] })).toBe(
      "/pages/boo",
    );
  });

  it("escapes newline character for dynamic path", () => {
    rs.draw(function () {
      this.get("/dynamic/:dynamic_segment", { to: "subpath_books#show", as: "dynamic" });
      this.get(":controller/:action/:id", {});
    });

    const results = rs.recognizePath("/dynamic/a%0Anewline");
    expect(results).toBeTruthy();
    expect(results["dynamic_segment"]).toBe("a\nnewline");
  });

  it("escapes newline character for wildcard path", () => {
    rs.draw(function () {
      this.get("/wildcard/*wildcard_segment", { to: "subpath_books#show", as: "wildcard" });
      this.get(":controller/:action/:id", {});
    });

    const results = rs.recognizePath("/wildcard/a%0Anewline");
    expect(results).toBeTruthy();
    expect(results["wildcard_segment"]).toBe("a\nnewline");
  });

  it.skip("route with integer default", () => {
    rs.draw(function () {
      this.get("page(/:id)", { to: "content#show_page", id: 1 } as any);
    });

    expect(urlFor(rs, { controller: "content", action: "show_page" })).toBe("/page");
    expect(urlFor(rs, { controller: "content", action: "show_page", id: 1 })).toBe("/page");
    expect(urlFor(rs, { controller: "content", action: "show_page", id: "1" })).toBe("/page");
    expect(urlFor(rs, { controller: "content", action: "show_page", id: 10 })).toBe("/page/10");

    expect(rs.recognizePath("/page")).toMatchObject({
      controller: "content",
      action: "show_page",
      id: 1,
    });
    expect(rs.recognizePath("/page/1")).toMatchObject({
      controller: "content",
      action: "show_page",
      id: "1",
    });
    expect(rs.recognizePath("/page/10")).toMatchObject({
      controller: "content",
      action: "show_page",
      id: "10",
    });
  });

  it.skip("requirement should prevent optional id", () => {
    rs.draw(function () {
      this.get("post/:id", { to: "post#show", constraints: { id: /\d+/ }, as: "post" });
    });

    expect(urlFor(rs, { controller: "post", action: "show", id: 10 })).toBe("/post/10");

    expect(() => urlFor(rs, { controller: "post", action: "show" })).toThrow(UrlGenerationError);
  });

  it.skip("named route without hash", () => {});

  it.skip("named route root", () => {});

  it.skip("named route root without hash", () => {});

  it.skip("named route root with hash", () => {});

  it.skip("root without path raises argument error", () => {});

  it.skip("named route root with trailing slash", () => {});

  it.skip("named route with regexps", () => {});

  it.skip("changing controller", () => {});

  it.skip("dynamic recall paths allowed", () => {});

  it.skip("backwards", () => {});

  it.skip("route with text default", () => {});

  it.skip("action expiry", () => {});

  it.skip("set to nil forgets", () => {});
});

describe("RouteSetTest", () => {
  let set: RouteSet;

  beforeEach(() => {
    set = new RouteSet();
  });

  it("route constraints on request object with anchors are valid", () => {
    expect(() => {
      set.draw(function () {
        this.get("page/:id", { to: "pages#show", constraints: { host: /^foo$/ } });
      });
    }).not.toThrow();
  });

  it("route constraints with anchor chars are invalid", () => {
    expect(() => {
      set.draw(function () {
        this.get("page/:id", { to: "pages#show", id: /^\d+/ } as Parameters<typeof this.get>[1]);
      });
    }).toThrow(ArgumentError);
    expect(() => {
      set.draw(function () {
        this.get("page/:id", { to: "pages#show", id: new RegExp("\\A\\d+") } as Parameters<
          typeof this.get
        >[1]);
      });
    }).toThrow(ArgumentError);
    expect(() => {
      set.draw(function () {
        this.get("page/:id", { to: "pages#show", id: /\d+$/ } as Parameters<typeof this.get>[1]);
      });
    }).toThrow(ArgumentError);
    expect(() => {
      set.draw(function () {
        this.get("page/:id", { to: "pages#show", id: new RegExp("\\d+\\Z") } as Parameters<
          typeof this.get
        >[1]);
      });
    }).toThrow(ArgumentError);
    expect(() => {
      set.draw(function () {
        this.get("page/:id", { to: "pages#show", id: new RegExp("\\d+\\z") } as Parameters<
          typeof this.get
        >[1]);
      });
    }).toThrow(ArgumentError);
  });

  it("route constraints with unsupported regexp options must error", () => {
    expect(() => {
      set.draw(function () {
        this.get("page/:name", { to: "pages#show", constraints: { name: /(david|jamis)/s } });
      });
    }).toThrow(ArgumentError);
  });

  it("route constraints with supported options must not error", () => {
    expect(() => {
      set.draw(function () {
        this.get("page/:name", { to: "pages#show", constraints: { name: /(david|jamis)/i } });
      });
    }).not.toThrow();
  });
});
