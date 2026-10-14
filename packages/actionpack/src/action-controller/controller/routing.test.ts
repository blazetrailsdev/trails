/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging --
   Ruby `include RoutingTestHelpers` / `include ActionDispatch::RoutingVerbs`; the class/interface
   merge is how `include()` surfaces those members on the type side. */
import { describe, it, expect, beforeEach } from "vitest";

import { ActiveSupportJSON, include, isPresent, type Included } from "@blazetrails/activesupport";
import { Utils, bodyFromString } from "@blazetrails/rack";
import {
  URI,
  first,
  rbModConstDefined,
  registerConstant,
  type Module,
} from "@blazetrails/ruby-compat";
import { Base } from "../base.js";
import { deprecator } from "../../action-dispatch/deprecator.js";
import { Request, controllerConstants } from "../../action-dispatch/http/request.js";
import type { DispatchableControllerClass } from "../../action-dispatch/routing/dispatcher.js";
import { RouteSet } from "../../action-dispatch/routing/route-set.js";
import { RoutingError, UnknownHttpMethod, UrlGenerationError } from "../metal/exceptions.js";
import { ArgumentError } from "@blazetrails/activemodel";
import { RoutingTestHelpers, RoutingVerbs } from "../../test-helpers/abstract-unit.js";
import "../../test-helpers/lib/controller/fake-controllers.js";

type NamedRoutes = Record<string, (...args: unknown[]) => string>;

class MilestonesController extends Base {
  declare show: () => void;

  index(): void {
    this.head("ok");
  }

  static {
    this.prototype.show = this.prototype.index;
  }
}
registerConstant("MilestonesController", MilestonesController);
controllerConstants.set(
  "milestones",
  MilestonesController as unknown as DispatchableControllerClass,
);

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

  setupRequestMethodRoutesFor(method: string): void {
    this.rs.draw(function () {
      this.match({ "/match": `books#${method}`, via: method });
    });
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

      this.get("/:url", { controller: "content", action: "translate" });
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

  it("named route without hash", () => {
    expect(() => {
      rs.draw(function () {
        deprecator().silence(() => {
          this.get(":controller/:action/:id", { as: "normal" });
        });
      });
    }).not.toThrow();
  });

  it("named route root", () => {
    rs.draw(function () {
      this.root({ to: "hello#index" });
    });
    const routes = tc.setupForNamedRoute();
    expect(routes.rootUrl()).toBe("http://test.host/");
    expect(routes.rootPath()).toBe("/");
  });

  it("named route root without hash", () => {
    rs.draw(function () {
      this.root("hello#index");
    });
    const routes = tc.setupForNamedRoute();
    expect(routes.rootUrl()).toBe("http://test.host/");
    expect(routes.rootPath()).toBe("/");
  });

  it("named route root with hash", () => {
    rs.draw(function () {
      this.root("hello#index", { as: "index" });
    });

    const routes = tc.setupForNamedRoute();
    expect(routes.indexUrl()).toBe("http://test.host/");
    expect(routes.indexPath()).toBe("/");
  });

  it("root without path raises argument error", () => {
    expect(() => {
      rs.draw(function () {
        this.root(null);
      });
    }).toThrow(ArgumentError);
  });

  it("named route root with trailing slash", () => {
    rs.draw(function () {
      this.root("hello#index");
    });

    const routes = tc.setupForNamedRoute({ trailingSlash: true });
    expect(routes.rootUrl()).toBe("http://test.host/");
    expect(routes.rootUrl({ foo: "bar" })).toBe("http://test.host/?foo=bar");
  });

  it("named route with regexps", () => {
    rs.draw(function () {
      this.get({
        "page/:year/:month/:day/:title": "page#show",
        as: "article",
        year: /\d+/,
        month: /\d+/,
        day: /\d+/,
      });

      deprecator().silence(() => {
        this.get(":controller/:action/:id");
      });
    });

    const routes = tc.setupForNamedRoute();

    expect(routes.articleUrl({ title: "hi", day: 10, year: 2005, month: 6 })).toBe(
      "http://test.host/page/2005/6/10/hi",
    );
  });

  it("changing controller", async () => {
    rs.draw(function () {
      deprecator().silence(() => {
        this.get(":controller/:action/:id");
      });
    });

    await tc.get(URI.parse("http://test.host/admin/user/index/10"));

    expect(
      tc.controller!.urlFor({ controller: "stuff", action: "show", id: 10, onlyPath: true }),
    ).toBe("/admin/stuff/show/10");
  });

  it("paths escaped", () => {
    rs.draw(function () {
      this.get({ "file/*path": "content#show_file", as: "path" });

      deprecator().silence(() => {
        this.get(":controller/:action/:id");
      });
    });

    let results = rs.recognizePath("/file/hello+world/how+are+you%3F");
    expect(results, "Recognition should have succeeded").toBeTruthy();
    expect(results["path"]).toBe("hello+world/how+are+you?");

    results = rs.recognizePath("/file/hello%20world/how%20are%20you%3F");
    expect(results, "Recognition should have succeeded").toBeTruthy();
    expect(results["path"]).toBe("hello world/how are you?");
  });

  it("paths slashes unescaped with ordered parameters", () => {
    rs.draw(function () {
      this.get({ "/file/*path": "content#index", as: "path" });
    });

    expect(tc.setupForNamedRoute().pathPath(["hello", "world"])).toBe("/file/hello/world");
  });

  it("non controllers cannot be matched", () => {
    rs.draw(function () {
      deprecator().silence(() => {
        this.get(":controller/:action/:id");
      });
    });
    expect(() => rs.recognizePath("/not_a/show/10")).toThrow(RoutingError);
  });

  it("should list options diff when routing constraints dont match", () => {
    rs.draw(function () {
      this.get({ "post/:id": "post#show", constraints: { id: /\d+/ }, as: "post" });
    });
    expect(() =>
      tc.urlFor(rs, { controller: "post", action: "show", bad_param: "foo", useRoute: "post" }),
    ).toThrow(UrlGenerationError);
  });

  it("dynamic path allowed", () => {
    rs.draw(function () {
      this.get({ "*path": "content#show_file" });
    });

    expect(
      tc.urlFor(rs, { controller: "content", action: "show_file", path: ["pages", "boo"] }),
    ).toBe("/pages/boo");
  });

  it("escapes newline character for dynamic path", () => {
    rs.draw(function () {
      this.get({ "/dynamic/:dynamic_segment": "subpath_books#show", as: "dynamic" });

      deprecator().silence(() => {
        this.get(":controller/:action/:id");
      });
    });

    const results = rs.recognizePath("/dynamic/a%0Anewline");
    expect(results, "Recognition should have succeeded").toBeTruthy();
    expect(results["dynamic_segment"]).toBe("a\nnewline");
  });

  it("escapes newline character for wildcard path", () => {
    rs.draw(function () {
      this.get({ "/wildcard/*wildcard_segment": "subpath_books#show", as: "wildcard" });

      deprecator().silence(() => {
        this.get(":controller/:action/:id");
      });
    });

    const results = rs.recognizePath("/wildcard/a%0Anewline");
    expect(results, "Recognition should have succeeded").toBeTruthy();
    expect(results["wildcard_segment"]).toBe("a\nnewline");
  });

  it("dynamic recall paths allowed", async () => {
    rs.draw(function () {
      this.get({ "*path": "content#show_file" });
    });

    await tc.get(URI.parse("http://test.host/pages/boo"));
    expect(tc.controller!.request.pathParameters).toEqual({
      controller: "content",
      action: "show_file",
      path: "pages/boo",
    });

    expect(tc.controller!.urlFor({ onlyPath: true })).toBe("/pages/boo");
  });

  it("backwards", async () => {
    rs.draw(function () {
      deprecator().silence(() => {
        this.get({ "page/:id(/:action)": "pages#show" });
        this.get(":controller(/:action(/:id))");
      });
    });

    await tc.get(URI.parse("http://test.host/pages/show"));
    expect(tc.controller!.urlFor({ id: 20, onlyPath: true })).toBe("/page/20");
    expect(tc.urlFor(rs, { controller: "pages", id: 20, action: "show" })).toBe("/page/20");
    expect(tc.urlFor(rs, { controller: "pages", action: "boo" })).toBe("/pages/boo");
  });

  it("route with integer default", () => {
    rs.draw(function () {
      this.get({ "page(/:id)": "content#show_page", id: 1 });

      deprecator().silence(() => {
        this.get(":controller/:action/:id");
      });
    });

    expect(tc.urlFor(rs, { controller: "content", action: "show_page" })).toBe("/page");
    expect(tc.urlFor(rs, { controller: "content", action: "show_page", id: 1 })).toBe("/page");
    expect(tc.urlFor(rs, { controller: "content", action: "show_page", id: "1" })).toBe("/page");
    expect(tc.urlFor(rs, { controller: "content", action: "show_page", id: 10 })).toBe("/page/10");

    expect(rs.recognizePath("/page")).toEqual({
      controller: "content",
      action: "show_page",
      id: 1,
    });
    expect(rs.recognizePath("/page/1")).toEqual({
      controller: "content",
      action: "show_page",
      id: "1",
    });
    expect(rs.recognizePath("/page/10")).toEqual({
      controller: "content",
      action: "show_page",
      id: "10",
    });
  });

  it("route with text default", () => {
    rs.draw(function () {
      this.get({ "page/:id": "content#show_page", id: 1 });

      deprecator().silence(() => {
        this.get(":controller/:action/:id");
      });
    });

    expect(tc.urlFor(rs, { controller: "content", action: "show_page", id: "foo" })).toBe(
      "/page/foo",
    );
    expect(rs.recognizePath("/page/foo")).toEqual({
      controller: "content",
      action: "show_page",
      id: "foo",
    });

    const token = "текст";
    const escapedToken = Utils.escape(token);

    expect(tc.urlFor(rs, { controller: "content", action: "show_page", id: token })).toBe(
      "/page/" + escapedToken,
    );
    expect(rs.recognizePath(`/page/${escapedToken}`)).toEqual({
      controller: "content",
      action: "show_page",
      id: token,
    });
  });

  it("action expiry", async () => {
    rs.draw(function () {
      deprecator().silence(() => {
        this.get(":controller(/:action(/:id))");
      });
    });
    await tc.get(URI.parse("http://test.host/content/show"));
    expect(tc.controller!.urlFor({ controller: "content", onlyPath: true })).toBe("/content");
  });

  it("requirement should prevent optional id", () => {
    rs.draw(function () {
      this.get({ "post/:id": "post#show", constraints: { id: /\d+/ }, as: "post" });
    });

    expect(tc.urlFor(rs, { controller: "post", action: "show", id: 10 })).toBe("/post/10");

    expect(() => tc.urlFor(rs, { controller: "post", action: "show" })).toThrow(UrlGenerationError);
  });

  it("both requirement and optional", () => {
    rs.draw(function () {
      this.get({
        "test(/:year)": "post#show",
        as: "blog",
        defaults: { year: null },
        constraints: { year: /\d{4}/ },
      });

      deprecator().silence(() => {
        this.get(":controller/:action/:id");
      });
    });

    expect(tc.urlFor(rs, { controller: "post", action: "show" })).toBe("/test");
    expect(tc.urlFor(rs, { controller: "post", action: "show", year: null })).toBe("/test");

    expect(tc.setupForNamedRoute().blogUrl()).toBe("http://test.host/test");
  });

  it("set to nil forgets", async () => {
    rs.draw(function () {
      this.get({
        "pages(/:year(/:month(/:day)))": "content#list_pages",
        month: null,
        day: null,
      });

      deprecator().silence(() => {
        this.get(":controller/:action/:id");
      });
    });

    expect(tc.urlFor(rs, { controller: "content", action: "list_pages", year: 2005 })).toBe(
      "/pages/2005",
    );
    expect(
      tc.urlFor(rs, { controller: "content", action: "list_pages", year: 2005, month: 6 }),
    ).toBe("/pages/2005/6");
    expect(
      tc.urlFor(rs, { controller: "content", action: "list_pages", year: 2005, month: 6, day: 12 }),
    ).toBe("/pages/2005/6/12");

    await tc.get(URI.parse("http://test.host/pages/2005/6/12"));
    expect(tc.controller!.request.pathParameters).toEqual({
      controller: "content",
      action: "list_pages",
      year: "2005",
      month: "6",
      day: "12",
    });

    expect(tc.controller!.urlFor({ day: 4, onlyPath: true })).toBe("/pages/2005/6/4");

    expect(tc.controller!.urlFor({ day: null, onlyPath: true })).toBe("/pages/2005/6");

    expect(tc.controller!.urlFor({ day: null, month: null, onlyPath: true })).toBe("/pages/2005");
  });

  it("root url generation with controller and action", () => {
    rs.draw(function () {
      this.root({ to: "content#index" });
    });

    expect(tc.urlFor(rs, { controller: "content", action: "index" })).toBe("/");
    expect(tc.urlFor(rs, { controller: "content" })).toBe("/");
  });

  it("named root url generation with controller and action", () => {
    rs.draw(function () {
      this.root({ to: "content#index", as: "home" });
    });

    expect(tc.urlFor(rs, { controller: "content", action: "index" })).toBe("/");
    expect(tc.urlFor(rs, { controller: "content" })).toBe("/");

    expect(tc.setupForNamedRoute().homeUrl()).toBe("http://test.host/");
  });

  const testNamedRouteMethod = () => {
    rs.draw(function () {
      this.get({ categories: "content#categories", as: "categories" });

      deprecator().silence(() => {
        this.get(":controller(/:action(/:id))");
      });
    });

    expect(tc.urlFor(rs, { controller: "content", action: "categories" })).toBe("/categories");
    expect(tc.urlFor(rs, { controller: "content", action: "hi" })).toBe("/content/hi");
  };

  it("named route method", () => {
    testNamedRouteMethod();
  });

  it("named routes array", () => {
    testNamedRouteMethod();
    expect(rs.namedRoutes.names()).toEqual(["categories"]);
  });

  it("nil defaults", () => {
    rs.draw(function () {
      this.get({ journal: "content#list_journal", date: null, user_id: null });

      deprecator().silence(() => {
        this.get(":controller/:action/:id");
      });
    });

    expect(
      tc.urlFor(rs, { controller: "content", action: "list_journal", date: null, user_id: null }),
    ).toBe("/journal");
  });

  for (const requestMethod of ["GET", "PATCH", "POST", "PUT", "DELETE"]) {
    it(`request method recognized with ${requestMethod}`, () => {
      tc.setupRequestMethodRoutesFor(requestMethod.toLowerCase());
      const params = rs.recognizePath("/match", { method: requestMethod });
      expect(params["action"]).toBe(requestMethod.toLowerCase());
    });
  }

  it("recognize array of methods", () => {
    rs.draw(function () {
      this.match({ "/match": "books#get_or_post", via: [":get", ":post"] });
      this.put({ "/match": "books#not_get_or_post" });
    });

    let params = rs.recognizePath("/match", { method: "post" });
    expect(params["action"]).toBe("get_or_post");

    params = rs.recognizePath("/match", { method: "put" });
    expect(params["action"]).toBe("not_get_or_post");
  });

  it("subpath recognized", () => {
    rs.draw(function () {
      deprecator().silence(() => {
        this.get({ "/books/:id/edit": "subpath_books#edit" });
        this.get({ "/items/:id/:action": "subpath_books" });
        this.get({ "/posts/new/:action": "subpath_books" });
        this.get({ "/posts/:id": "subpath_books#show" });
      });
    });

    let hash = rs.recognizePath("/books/17/edit");
    expect(hash).not.toBeNull();
    expect([hash["controller"], hash["id"], hash["action"]]).toEqual([
      "subpath_books",
      "17",
      "edit",
    ]);

    hash = rs.recognizePath("/items/3/complete");
    expect(hash).not.toBeNull();
    expect([hash["controller"], hash["id"], hash["action"]]).toEqual([
      "subpath_books",
      "3",
      "complete",
    ]);

    hash = rs.recognizePath("/posts/new/preview");
    expect(hash).not.toBeNull();
    expect([hash["controller"], hash["action"]]).toEqual(["subpath_books", "preview"]);

    hash = rs.recognizePath("/posts/7");
    expect(hash).not.toBeNull();
    expect([hash["controller"], hash["action"], hash["id"]]).toEqual([
      "subpath_books",
      "show",
      "7",
    ]);
  });

  it("subpath generated", () => {
    rs.draw(function () {
      deprecator().silence(() => {
        this.get({ "/books/:id/edit": "subpath_books#edit" });
        this.get({ "/items/:id/:action": "subpath_books" });
        this.get({ "/posts/new/:action": "subpath_books" });
      });
    });

    expect(tc.urlFor(rs, { controller: "subpath_books", id: 7, action: "edit" })).toBe(
      "/books/7/edit",
    );
    expect(tc.urlFor(rs, { controller: "subpath_books", id: 15, action: "complete" })).toBe(
      "/items/15/complete",
    );
    expect(tc.urlFor(rs, { controller: "subpath_books", action: "preview" })).toBe(
      "/posts/new/preview",
    );
  });

  it("failed constraints raises exception with violated constraints", () => {
    rs.draw(function () {
      this.get({
        "foos/:id": "foos#show",
        as: "foo_with_requirement",
        constraints: { id: /\d+/ },
      });
    });

    expect(() => {
      tc.setupForNamedRoute().fooWithRequirementUrl("I am Against the constraints");
    }).toThrow(UrlGenerationError);
  });

  it("routes changed correctly after clear", () => {
    const rs = new RouteSet();
    rs.draw(function () {
      this.get({ ca: "ca#aa" });
      this.get({ cb: "cb#ab" });
      this.get({ cc: "cc#ac" });

      deprecator().silence(() => {
        this.get(":controller/:action/:id");
        this.get(":controller/:action/:id.:format");
      });
    });

    let hash = rs.recognizePath("/cc");

    expect(hash).not.toBeNull();
    expect([hash["controller"], hash["action"]]).toEqual(["cc", "ac"]);

    rs.draw(function () {
      this.get({ cb: "cb#ab" });
      this.get({ cc: "cc#ac" });

      deprecator().silence(() => {
        this.get(":controller/:action/:id");
        this.get(":controller/:action/:id.:format");
      });
    });

    hash = rs.recognizePath("/cc");

    expect(hash).not.toBeNull();
    expect([hash["controller"], hash["action"]]).toEqual(["cc", "ac"]);
  });

  it("drawing more routes after eager loading", () => {
    const rs = new RouteSet();
    rs.disableClearAndFinalize = true;

    rs.draw(function () {
      this.get({ "/plain": "c#plain" });
      this.get({ "/:symbol": "c#symbol" });
      this.get({ "/glob/*": "c#glob" });
      this.get({ "/with#anchor": "c#with_anchor" });
    });

    let hash = rs.recognizePath("/symbol");
    expect(hash).not.toBeNull();
    expect([hash["controller"], hash["action"]]).toEqual(["c", "symbol"]);

    rs.eagerLoadBang();

    rs.draw(function () {
      this.get({ "/more/plain": "c#plain" });
      this.get({ "/more/:symbol": "c#symbol" });
      this.get({ "/more/glob/*": "c#glob" });
      this.get({ "/more/with#anchor": "c#with_anchor" });
    });

    hash = rs.recognizePath("/symbol");
    expect(hash).not.toBeNull();
    expect([hash["controller"], hash["action"]]).toEqual(["c", "symbol"]);

    hash = rs.recognizePath("/more/symbol");
    expect(hash).not.toBeNull();
    expect([hash["controller"], hash["action"]]).toEqual(["c", "symbol"]);
  });
});

class RouteSetTest {
  set!: RouteSet;
  controller: Base | null = null;

  get routes(): RouteSet {
    return this.set;
  }

  async setupNamedRouteTest(): Promise<NamedRoutes> {
    this.set.draw(function () {
      this.get({ "/people(/:id)": "people#show", as: "show" });
      this.get({ "/people": "people#index", as: "index" });
      this.get({ "/people/go/:foo/:bar/joe(/:id)": "people#multi", as: "multi" });
      this.get({ "/admin/users": "admin/users#index", as: "users" });
    });

    await this.get(URI.parse("http://test.host/people"));
    return this.controller as unknown as NamedRoutes;
  }

  private _defaultRouteSet?: RouteSet;

  get defaultRouteSet(): RouteSet {
    return (this._defaultRouteSet ||= (() => {
      const set = new RouteSet();
      set.draw(function () {
        deprecator().silence(() => {
          this.get("/:controller(/:action(/:id))");
        });
      });
      return set;
    })());
  }
}
interface RouteSetTest extends Included<typeof RoutingTestHelpers>, Included<typeof RoutingVerbs> {}
include(RouteSetTest, RoutingTestHelpers);
include(RouteSetTest, RoutingVerbs);

function assertUriEqual(expected: string, actual: string): void {
  expect(sortQueryStringParams(actual)).toBe(sortQueryStringParams(expected));
}

function sortQueryStringParams(uri: string): string {
  const path = uri.split("?")[0];
  let qs: string | undefined = uri.split("?")[1];
  if (qs != null) qs = qs.split("&").sort().join("&");
  return qs != null ? `${path}?${qs}` : path;
}

describe("RouteSetTest", () => {
  let tc: RouteSetTest;
  let set: RouteSet;

  beforeEach(() => {
    tc = new RouteSetTest();
    tc.set = tc.makeSet();
    set = tc.set;
  });

  it("generate extras", () => {
    set.draw(function () {
      deprecator().silence(() => {
        this.get(":controller/(:action(/:id))");
      });
    });
    const [path, extras] = set.generateExtras({
      controller: "foo",
      action: "bar",
      id: 15,
      this: "hello",
      that: "world",
    });
    expect(path).toBe("/foo/bar/15");
    expect(extras.map(String).sort()).toEqual(["that", "this"]);
  });

  it("extra keys", () => {
    set.draw(function () {
      deprecator().silence(() => {
        this.get(":controller/:action/:id");
      });
    });
    const extras = set.extraKeys({
      controller: "foo",
      action: "bar",
      id: 15,
      this: "hello",
      that: "world",
    });
    expect(extras.map(String).sort()).toEqual(["that", "this"]);
  });

  it("generate extras not first", () => {
    set.draw(function () {
      deprecator().silence(() => {
        this.get(":controller/:action/:id.:format");
        this.get(":controller/:action/:id");
      });
    });
    const [path, extras] = set.generateExtras({
      controller: "foo",
      action: "bar",
      id: 15,
      this: "hello",
      that: "world",
    });
    expect(path).toBe("/foo/bar/15");
    expect(extras.map(String).sort()).toEqual(["that", "this"]);
  });

  it("generate not first", () => {
    set.draw(function () {
      deprecator().silence(() => {
        this.get(":controller/:action/:id.:format");
        this.get(":controller/:action/:id");
      });
    });
    expect(tc.urlFor(set, { controller: "foo", action: "bar", id: 15, this: "hello" })).toBe(
      "/foo/bar/15?this=hello",
    );
  });

  it("extra keys not first", () => {
    set.draw(function () {
      deprecator().silence(() => {
        this.get(":controller/:action/:id.:format");
        this.get(":controller/:action/:id");
      });
    });
    const extras = set.extraKeys({
      controller: "foo",
      action: "bar",
      id: 15,
      this: "hello",
      that: "world",
    });
    expect(extras.map(String).sort()).toEqual(["that", "this"]);
  });

  it("draw", () => {
    expect(set.routes.size).toBe(0);
    set.draw(function () {
      this.get({ "/hello/world": "a#b" });
    });
    expect(set.routes.size).toBe(1);
  });

  it("draw symbol controller name", () => {
    expect(set.routes.size).toBe(0);
    set.draw(function () {
      this.get({ "/users/index": "users#index" });
    });
    set.recognizePath("/users/index", { method: "get" });
    expect(set.routes.size).toBe(1);
  });

  it("named draw", () => {
    expect(set.routes.size).toBe(0);
    set.draw(function () {
      this.get({ "/hello/world": "a#b", as: "hello" });
    });
    expect(set.routes.size).toBe(1);
    expect(set.namedRoutes.get("hello")).toBe(first(set.routes));
  });

  it("duplicate named route raises rather than pick precedence", () => {
    expect(() => {
      set.draw(function () {
        this.get({ "/hello/world": "a#b", as: "hello" });
        this.get({ "/hello": "a#b", as: "hello" });
      });
    }).toThrow(ArgumentError);
  });

  it("named route url method", async () => {
    const controller = await tc.setupNamedRouteTest();

    expect(controller.showUrl({ id: 5 })).toBe("http://test.host/people/5");
    expect(controller.showPath({ id: 5 })).toBe("/people/5");

    expect(controller.indexUrl()).toBe("http://test.host/people");
    expect(controller.indexPath()).toBe("/people");

    expect(controller.usersUrl()).toBe("http://test.host/admin/users");
    expect(controller.usersPath()).toBe("/admin/users");
  });

  it("named route url method with anchor", async () => {
    const controller = await tc.setupNamedRouteTest();

    expect(controller.showUrl({ id: 5, anchor: "location" })).toBe(
      "http://test.host/people/5#location",
    );
    expect(controller.showPath({ id: 5, anchor: "location" })).toBe("/people/5#location");

    expect(controller.indexUrl({ anchor: "location" })).toBe("http://test.host/people#location");
    expect(controller.indexPath({ anchor: "location" })).toBe("/people#location");

    expect(controller.usersUrl({ anchor: "location" })).toBe(
      "http://test.host/admin/users#location",
    );
    expect(controller.usersPath({ anchor: "location" })).toBe("/admin/users#location");

    expect(controller.multiUrl(7, "hello", 5, { anchor: "location" })).toBe(
      "http://test.host/people/go/7/hello/joe/5#location",
    );

    expect(controller.multiUrl(7, "hello", 5, { baz: "bar", anchor: "location" })).toBe(
      "http://test.host/people/go/7/hello/joe/5?baz=bar#location",
    );

    expect(controller.indexUrl({ baz: "bar", anchor: "location" })).toBe(
      "http://test.host/people?baz=bar#location",
    );

    expect(controller.indexUrl({ anchor: null })).toBe("http://test.host/people");
    expect(controller.indexUrl({ anchor: false })).toBe("http://test.host/people");
  });

  it("named route url method with port", async () => {
    const controller = await tc.setupNamedRouteTest();
    expect(controller.showUrl(5, { port: 8080 })).toBe("http://test.host:8080/people/5");
  });

  it("named route url method with host", async () => {
    const controller = await tc.setupNamedRouteTest();
    expect(controller.showUrl(5, { host: "some.example.com" })).toBe(
      "http://some.example.com/people/5",
    );
  });

  it("named route url method with protocol", async () => {
    const controller = await tc.setupNamedRouteTest();
    expect(controller.showUrl(5, { protocol: "https" })).toBe("https://test.host/people/5");
  });

  it("named route url method with ordered parameters", async () => {
    const controller = await tc.setupNamedRouteTest();
    expect(controller.multiUrl(7, "hello", 5)).toBe("http://test.host/people/go/7/hello/joe/5");
  });

  it("named route url method with ordered parameters and hash", async () => {
    const controller = await tc.setupNamedRouteTest();
    expect(controller.multiUrl(7, "hello", 5, { baz: "bar" })).toBe(
      "http://test.host/people/go/7/hello/joe/5?baz=bar",
    );
  });

  it("named route url method with ordered parameters and empty hash", async () => {
    const controller = await tc.setupNamedRouteTest();
    expect(controller.multiUrl(7, "hello", 5, {})).toBe("http://test.host/people/go/7/hello/joe/5");
  });

  it("named route url method with no positional arguments", async () => {
    const controller = await tc.setupNamedRouteTest();
    expect(controller.indexUrl({ baz: "bar" })).toBe("http://test.host/people?baz=bar");
  });

  it("draw default route", () => {
    set.draw(function () {
      deprecator().silence(() => {
        this.get(":controller/:action/:id");
      });
    });

    expect(set.routes.size).toBe(1);

    expect(tc.urlFor(set, { controller: "users", action: "show", id: 10 })).toBe("/users/show/10");
    expect(tc.urlFor(set, { controller: "users", id: 10 })).toBe("/users/index/10");

    expect(set.recognizePath("/users/index/10")).toEqual({
      controller: "users",
      action: "index",
      id: "10",
    });
    expect(set.recognizePath("/users/index/10/")).toEqual({
      controller: "users",
      action: "index",
      id: "10",
    });
  });
  it("route with parameter shell", async () => {
    set.draw(function () {
      this.get({ "page/:id": "pages#show", id: /\d+/ });

      deprecator().silence(() => {
        this.get("/:controller(/:action(/:id))");
      });
    });

    expect(await tc.requestPathParams("/pages")).toEqual({ controller: "pages", action: "index" });
    expect(await tc.requestPathParams("/pages/index")).toEqual({
      controller: "pages",
      action: "index",
    });
    expect(await tc.requestPathParams("/pages/list")).toEqual({
      controller: "pages",
      action: "list",
    });

    expect(await tc.requestPathParams("/pages/show/10")).toEqual({
      controller: "pages",
      action: "show",
      id: "10",
    });
    expect(await tc.requestPathParams("/page/10")).toEqual({
      controller: "pages",
      action: "show",
      id: "10",
    });
  });

  it("route constraints on request object with anchors are valid", () => {
    expect(() => {
      set.draw(function () {
        this.get({ "page/:id": "pages#show", constraints: { host: /^foo$/ } });
      });
    }).not.toThrow();
  });

  it("route constraints with anchor chars are invalid", () => {
    expect(() => {
      set.draw(function () {
        this.get({ "page/:id": "pages#show", id: /^\d+/ });
      });
    }).toThrow(ArgumentError);
    expect(() => {
      set.draw(function () {
        this.get({ "page/:id": "pages#show", id: new RegExp("\\A\\d+") });
      });
    }).toThrow(ArgumentError);
    expect(() => {
      set.draw(function () {
        this.get({ "page/:id": "pages#show", id: /\d+$/ });
      });
    }).toThrow(ArgumentError);
    expect(() => {
      set.draw(function () {
        this.get({ "page/:id": "pages#show", id: new RegExp("\\d+\\Z") });
      });
    }).toThrow(ArgumentError);
    expect(() => {
      set.draw(function () {
        this.get({ "page/:id": "pages#show", id: new RegExp("\\d+\\z") });
      });
    }).toThrow(ArgumentError);
  });

  it("route constraints with options method condition is valid", () => {
    expect(() => {
      set.draw(function () {
        this.match({ "valid/route": "pages#show", via: "options" });
      });
    }).not.toThrow();
  });

  it("route error with missing controller", async () => {
    set.draw(function () {
      this.get({ "/people": "missing#index" });
    });

    await expect(tc.requestPathParams("/people")).rejects.toThrow(RoutingError);
  });

  it("recognize with encoded id and regex", async () => {
    set.draw(function () {
      this.get({ "page/:id": "pages#show", id: /[a-zA-Z0-9+]+/ });
    });

    expect(await tc.requestPathParams("/page/10")).toEqual({
      controller: "pages",
      action: "show",
      id: "10",
    });
    expect(await tc.requestPathParams("/page/hello+world")).toEqual({
      controller: "pages",
      action: "show",
      id: "hello+world",
    });
  });

  it("recognize with http methods", async () => {
    set.draw(function () {
      this.get({ "/people": "people#index", as: "people" });
      this.post({ "/people": "people#create" });
      this.get({ "/people/:id": "people#show", as: "person" });
      this.put({ "/people/:id": "people#update" });
      this.patch({ "/people/:id": "people#update" });
      this.delete({ "/people/:id": "people#destroy" });
    });

    let params = await tc.requestPathParams("/people", { method: "get" });
    expect(params["action"]).toBe("index");

    params = await tc.requestPathParams("/people", { method: "post" });
    expect(params["action"]).toBe("create");

    params = await tc.requestPathParams("/people/5", { method: "put" });
    expect(params["action"]).toBe("update");

    params = await tc.requestPathParams("/people/5", { method: "patch" });
    expect(params["action"]).toBe("update");

    await expect(tc.requestPathParams("/people", { method: "bacon" })).rejects.toThrow(
      UnknownHttpMethod,
    );

    params = await tc.requestPathParams("/people/5", { method: "get" });
    expect(params["action"]).toBe("show");
    expect(params["id"]).toBe("5");

    params = await tc.requestPathParams("/people/5", { method: "put" });
    expect(params["action"]).toBe("update");
    expect(params["id"]).toBe("5");

    params = await tc.requestPathParams("/people/5", { method: "patch" });
    expect(params["action"]).toBe("update");
    expect(params["id"]).toBe("5");

    params = await tc.requestPathParams("/people/5", { method: "delete" });
    expect(params["action"]).toBe("destroy");
    expect(params["id"]).toBe("5");

    await expect(tc.requestPathParams("/people/5", { method: "post" })).rejects.toThrow(
      RoutingError,
    );
  });

  it("recognize with alias in conditions", async () => {
    set.draw(function () {
      this.match({ "/people": "people#index", as: "people", via: "get" });
      this.root({ to: "people#index" });
    });

    let params = await tc.requestPathParams("/people", { method: "get" });
    expect(params["controller"]).toBe("people");
    expect(params["action"]).toBe("index");

    params = await tc.requestPathParams("/", { method: "get" });
    expect(params["controller"]).toBe("people");
    expect(params["action"]).toBe("index");
  });

  it("typo recognition", async () => {
    set.draw(function () {
      this.get({
        "articles/:year/:month/:day/:title": "articles#permalink",
        year: /\d{4}/,
        day: /\d{1,2}/,
        month: /\d{1,2}/,
      });
    });

    const params = await tc.requestPathParams("/articles/2005/11/05/a-very-interesting-article", {
      method: "get",
    });
    expect(params["action"]).toBe("permalink");
    expect(params["year"]).toBe("2005");
    expect(params["month"]).toBe("11");
    expect(params["day"]).toBe("05");
    expect(params["title"]).toBe("a-very-interesting-article");
  });

  it("routing traversal does not load extra classes", async () => {
    expect(rbModConstDefined(Object, "Profiler__"), "Profiler should not be loaded").toBe(false);
    set.draw(function () {
      this.get({ "/profile": "profile#index" });
    });

    await tc.requestPathParams("/profile").catch(() => null);

    expect(rbModConstDefined(Object, "Profiler__"), "Profiler should not be loaded").toBe(false);
  });

  it("recognize with conditions and format", async () => {
    set.draw(function () {
      this.get({ "people/:id": "people#show", as: "person" });
      this.put({ "people/:id": "people#update" });
      this.patch({ "people/:id": "people#update" });
      this.get({ "people/:id(.:format)": "people#show" });
    });

    let params = await tc.requestPathParams("/people/5", { method: "get" });
    expect(params["action"]).toBe("show");
    expect(params["id"]).toBe("5");

    params = await tc.requestPathParams("/people/5", { method: "put" });
    expect(params["action"]).toBe("update");

    params = await tc.requestPathParams("/people/5", { method: "patch" });
    expect(params["action"]).toBe("update");

    params = await tc.requestPathParams("/people/5.png", { method: "get" });
    expect(params["action"]).toBe("show");
    expect(params["id"]).toBe("5");
    expect(params["format"]).toBe("png");
  });

  it("generate with default action", () => {
    set.draw(function () {
      this.get("/people", { controller: "people", action: "index" });
      this.get("/people/list", { controller: "people", action: "list" });
    });

    const url = tc.urlFor(set, { controller: "people", action: "list" });
    expect(url).toBe("/people/list");
  });

  it("root map", async () => {
    set.draw(function () {
      this.root({ to: "people#index" });
    });

    const params = await tc.requestPathParams("", { method: "get" });
    expect(params["controller"]).toBe("people");
    expect(params["action"]).toBe("index");
  });

  it("namespace", async () => {
    set.draw(function () {
      this.namespace("api", () => {
        this.get({ inventory: "products#inventory" });
      });
    });

    const params = await tc.requestPathParams("/api/inventory", { method: "get" });
    expect(params["controller"]).toBe("api/products");
    expect(params["action"]).toBe("inventory");
  });

  it("namespaced root map", async () => {
    set.draw(function () {
      this.namespace("api", () => {
        this.root({ to: "products#index" });
      });
    });

    const params = await tc.requestPathParams("/api", { method: "get" });
    expect(params["controller"]).toBe("api/products");
    expect(params["action"]).toBe("index");
  });

  it("namespace with path prefix", async () => {
    set.draw(function () {
      this.scope({ module: "api", path: "prefix" }, () => {
        this.get({ inventory: "products#inventory" });
      });
    });

    const params = await tc.requestPathParams("/prefix/inventory", { method: "get" });
    expect(params["controller"]).toBe("api/products");
    expect(params["action"]).toBe("inventory");
  });

  it("namespace with blank path prefix", async () => {
    set.draw(function () {
      this.scope({ module: "api", path: "" }, () => {
        this.get({ inventory: "products#inventory" });
      });
    });

    const params = await tc.requestPathParams("/inventory", { method: "get" });
    expect(params["controller"]).toBe("api/products");
    expect(params["action"]).toBe("inventory");
  });

  it("id is sticky when it ought to be", async () => {
    tc.set = tc.makeSet(false);
    set = tc.set;

    set.draw(function () {
      deprecator().silence(() => {
        this.get(":controller/:id/:action");
      });
    });

    await tc.get(URI.parse("http://test.host/people/7/show"));

    expect(tc.controller!.urlFor({ action: "destroy", onlyPath: true })).toBe("/people/7/destroy");
  });

  it("use static path when possible", async () => {
    tc.set = tc.makeSet(false);
    set = tc.set;

    set.draw(function () {
      this.get({ about: "welcome#about" });

      deprecator().silence(() => {
        this.get(":controller/:id/:action");
      });
    });

    await tc.get(URI.parse("http://test.host/welcom/get/7"));

    expect(tc.controller!.urlFor({ controller: "welcome", action: "about", onlyPath: true })).toBe(
      "/about",
    );
  });

  it("generate", () => {
    set.draw(function () {
      deprecator().silence(() => {
        this.get(":controller/:action/:id");
      });
    });

    const args = { controller: "foo", action: "bar", id: "7", x: "y" };
    expect(tc.urlFor(set, args)).toBe("/foo/bar/7?x=y");
    expect(set.generateExtras(args)).toEqual(["/foo/bar/7", ["x"]]);
    expect(set.extraKeys(args)).toEqual(["x"]);
  });

  it("generate with path prefix", () => {
    set.draw(function () {
      this.scope("my", () => {
        deprecator().silence(() => {
          this.get(":controller(/:action(/:id))");
        });
      });
    });

    const args = { controller: "foo", action: "bar", id: "7", x: "y" };
    expect(tc.urlFor(set, args)).toBe("/my/foo/bar/7?x=y");
  });

  it("generate with blank path prefix", () => {
    set.draw(function () {
      this.scope("", () => {
        deprecator().silence(() => {
          this.get(":controller(/:action(/:id))");
        });
      });
    });

    const args = { controller: "foo", action: "bar", id: "7", x: "y" };
    expect(tc.urlFor(set, args)).toBe("/foo/bar/7?x=y");
  });

  it("named routes are never relative to modules", async () => {
    tc.set = tc.makeSet(false);
    set = tc.set;

    set.draw(function () {
      deprecator().silence(() => {
        this.get({ "/connection/manage(/:action)": "connection/manage#index" });
        this.get({ "/connection/connection": "connection/connection#index" });
        this.get({ "/connection": "connection#index", as: "family_connection" });
      });
    });

    expect(await tc.requestPathParams("/connection/manage")).toEqual({
      controller: "connection/manage",
      action: "index",
    });

    let url = tc.controller!.urlFor({ controller: "connection", onlyPath: true });
    expect(url).toBe("/connection/connection");

    url = tc.controller!.urlFor({
      useRoute: "family_connection",
      controller: "connection",
      onlyPath: true,
    });
    expect(url).toBe("/connection");
  });

  it("action left off when id is recalled", async () => {
    tc.set = tc.makeSet(false);
    set = tc.set;

    set.draw(function () {
      deprecator().silence(() => {
        this.get(":controller(/:action(/:id))");
      });
    });

    await tc.get(URI.parse("http://test.host/books/show/10"));

    expect(tc.controller!.urlFor({ controller: "books", onlyPath: true, action: "index" })).toBe(
      "/books",
    );
  });

  it("query params will be shown when recalled", async () => {
    tc.set = tc.makeSet(false);
    set = tc.set;

    set.draw(function () {
      this.get({ "show_weblog/:parameter": "weblog#show" });

      deprecator().silence(() => {
        this.get(":controller(/:action(/:id))");
      });
    });

    await tc.get(URI.parse("http://test.host/weblog/show/1"));

    expect(tc.controller!.urlFor({ action: "edit", parameter: 1, onlyPath: true })).toBe(
      "/weblog/edit?parameter=1",
    );
  });

  it("format is not inherit", async () => {
    set.draw(function () {
      this.get({ "/posts(.:format)": "posts#index" });
    });

    await tc.get(URI.parse("http://test.host/posts.xml"));
    expect(tc.controller!.request.pathParameters).toEqual({
      controller: "posts",
      action: "index",
      format: "xml",
    });

    expect(tc.controller!.urlFor({ controller: "posts", onlyPath: true })).toBe("/posts");

    expect(tc.controller!.urlFor({ controller: "posts", format: "xml", onlyPath: true })).toBe(
      "/posts.xml",
    );
  });

  it("expiry determination should consider values with to param", async () => {
    tc.set = tc.makeSet(false);
    set = tc.set;

    set.draw(function () {
      deprecator().silence(() => {
        this.get("projects/:project_id/:controller/:action");
      });
    });

    await tc.get(URI.parse("http://test.host/projects/1/weblog/show"));

    expect(tc.controller!.request.pathParameters).toEqual({
      controller: "weblog",
      action: "show",
      project_id: "1",
    });

    expect(tc.controller!.urlFor({ action: "show", project_id: 1, onlyPath: true })).toBe(
      "/projects/1/weblog/show",
    );
  });

  it("named route in nested resource", () => {
    set.draw(function () {
      this.resources("projects", () => {
        this.member(() => {
          this.get({ milestones: "milestones#index", as: "milestones" });
        });
      });
    });

    const params = set.recognizePath("/projects/1/milestones", { method: "get" });
    expect(params["controller"]).toBe("milestones");
    expect(params["action"]).toBe("index");
  });

  it("setting root in namespace using symbol", () => {
    expect(() => {
      set.draw(function () {
        this.namespace("admin", () => {
          this.root({ to: "home#index" });
        });
      });
    }).not.toThrow();
  });

  it("setting root in namespace using string", () => {
    expect(() => {
      set.draw(function () {
        this.namespace("admin", () => {
          this.root({ to: "home#index" });
        });
      });
    }).not.toThrow();
  });

  it("route constraints with unsupported regexp options must error", () => {
    expect(() => {
      set.draw(function () {
        this.get({ "page/:name": "pages#show", constraints: { name: /(david|jamis)/s } });
      });
    }).toThrow(ArgumentError);
  });

  it("route constraints with supported options must not error", () => {
    expect(() => {
      set.draw(function () {
        this.get({ "page/:name": "pages#show", constraints: { name: /(david|jamis)/i } });
      });
    }).not.toThrow();
  });

  it("route with subdomain and constraints must receive params", () => {
    let nameParam: unknown = null;
    set.draw(function () {
      this.get({
        "page/:name": "pages#show",
        constraints: (request: Request) => {
          nameParam = request.params["name"];
          return true;
        },
      });
    });
    expect(set.recognizePath("http://subdomain.example.org/page/mypage")).toEqual({
      controller: "pages",
      action: "show",
      name: "mypage",
    });
    expect(nameParam).toBe("mypage");
  });

  it("route requirement recognize with ignore case", () => {
    set.draw(function () {
      this.get({ "page/:name": "pages#show", constraints: { name: /(david|jamis)/i } });
    });
    expect(set.recognizePath("/page/jamis")).toEqual({
      controller: "pages",
      action: "show",
      name: "jamis",
    });
    expect(() => {
      set.recognizePath("/page/davidjamis");
    }).toThrow(RoutingError);
    expect(set.recognizePath("/page/DAVID")).toEqual({
      controller: "pages",
      action: "show",
      name: "DAVID",
    });
  });

  it("route requirement generate with ignore case", () => {
    set.draw(function () {
      this.get({ "page/:name": "pages#show", constraints: { name: /(david|jamis)/i } });
    });

    let url = tc.urlFor(set, { controller: "pages", action: "show", name: "david" });
    expect(url).toBe("/page/david");
    expect(() => {
      tc.urlFor(set, { controller: "pages", action: "show", name: "davidjamis" });
    }).toThrow(UrlGenerationError);
    url = tc.urlFor(set, { controller: "pages", action: "show", name: "JAMIS" });
    expect(url).toBe("/page/JAMIS");
  });

  it("route requirement recognize with extended syntax", () => {
    set.draw(function () {
      this.get({ "page/:name": "pages#show", constraints: { name: /(david|jamis)/ } });
    });
    expect(set.recognizePath("/page/jamis")).toEqual({
      controller: "pages",
      action: "show",
      name: "jamis",
    });
    expect(set.recognizePath("/page/david")).toEqual({
      controller: "pages",
      action: "show",
      name: "david",
    });
    expect(() => {
      set.recognizePath("/page/david #The Creator");
    }).toThrow(RoutingError);
    expect(() => {
      set.recognizePath("/page/David");
    }).toThrow(RoutingError);
  });

  it("route requirement with xi modifiers", () => {
    set.draw(function () {
      this.get({ "page/:name": "pages#show", constraints: { name: /(david|jamis)/i } });
    });

    expect(set.recognizePath("/page/JAMIS")).toEqual({
      controller: "pages",
      action: "show",
      name: "JAMIS",
    });

    expect(tc.urlFor(set, { controller: "pages", action: "show", name: "JAMIS" })).toBe(
      "/page/JAMIS",
    );
  });

  it("routes with symbols", () => {
    set.draw(function () {
      this.get("unnamed", { controller: "pages", action: "show", name: "as_symbol" });
      this.get("named", { controller: "pages", action: "show", name: "as_symbol", as: "named" });
    });
    expect(set.recognizePath("/unnamed")).toEqual({
      controller: "pages",
      action: "show",
      name: "as_symbol",
    });
    expect(set.recognizePath("/named")).toEqual({
      controller: "pages",
      action: "show",
      name: "as_symbol",
    });
  });

  it("regexp chunk should add question mark for optionals", () => {
    set.draw(function () {
      this.get({ "/": "foo#index" });
      this.get({ "/hello": "bar#index" });
    });

    expect(tc.urlFor(set, { controller: "foo" })).toBe("/");
    expect(tc.urlFor(set, { controller: "bar" })).toBe("/hello");

    expect(set.recognizePath("/")).toEqual({ controller: "foo", action: "index" });
    expect(set.recognizePath("/hello")).toEqual({ controller: "bar", action: "index" });
  });

  it("assign route options with anchor chars", () => {
    set.draw(function () {
      deprecator().silence(() => {
        this.get("/cars/:action/:person/:car/", { controller: "cars" });
      });
    });

    expect(tc.urlFor(set, { controller: "cars", action: "buy", person: "1", car: "2" })).toBe(
      "/cars/buy/1/2",
    );

    expect(set.recognizePath("/cars/buy/1/2")).toEqual({
      controller: "cars",
      action: "buy",
      person: "1",
      car: "2",
    });
  });

  it("segmentation of dot path", () => {
    set.draw(function () {
      deprecator().silence(() => {
        this.get("/books/:action.rss", { controller: "books" });
      });
    });

    expect(tc.urlFor(set, { controller: "books", action: "list" })).toBe("/books/list.rss");

    expect(set.recognizePath("/books/list.rss")).toEqual({ controller: "books", action: "list" });
  });

  it("segmentation of dynamic dot path", () => {
    set.draw(function () {
      deprecator().silence(() => {
        this.get("/books(/:action(.:format))", { controller: "books" });
      });
    });

    expect(tc.urlFor(set, { controller: "books", action: "list", format: "rss" })).toBe(
      "/books/list.rss",
    );
    expect(tc.urlFor(set, { controller: "books", action: "list", format: "xml" })).toBe(
      "/books/list.xml",
    );
    expect(tc.urlFor(set, { controller: "books", action: "list" })).toBe("/books/list");
    expect(tc.urlFor(set, { controller: "books", action: "index" })).toBe("/books");

    expect(set.recognizePath("/books/list.rss")).toEqual({
      controller: "books",
      action: "list",
      format: "rss",
    });
    expect(set.recognizePath("/books/list.xml")).toEqual({
      controller: "books",
      action: "list",
      format: "xml",
    });
    expect(set.recognizePath("/books/list")).toEqual({ controller: "books", action: "list" });
    expect(set.recognizePath("/books")).toEqual({ controller: "books", action: "index" });
  });

  it("slashes are implied", () => {
    set.draw(function () {
      deprecator().silence(() => {
        this.get("/:controller(/:action(/:id))");
      });
    });

    expect(tc.urlFor(set, { controller: "content", action: "index" })).toBe("/content");
    expect(tc.urlFor(set, { controller: "content", action: "list" })).toBe("/content/list");
    expect(tc.urlFor(set, { controller: "content", action: "show", id: "1" })).toBe(
      "/content/show/1",
    );

    expect(set.recognizePath("/content")).toEqual({ controller: "content", action: "index" });
    expect(set.recognizePath("/content/index")).toEqual({ controller: "content", action: "index" });
    expect(set.recognizePath("/content/list")).toEqual({ controller: "content", action: "list" });
    expect(set.recognizePath("/content/show/1")).toEqual({
      controller: "content",
      action: "show",
      id: "1",
    });
  });

  it("default route recognition", () => {
    const expected: Record<string, unknown> = { controller: "pages", action: "show", id: "10" };
    expect(tc.defaultRouteSet.recognizePath("/pages/show/10")).toEqual(expected);
    expect(tc.defaultRouteSet.recognizePath("/pages/show/10/")).toEqual(expected);

    expected["id"] = "jamis";
    expect(tc.defaultRouteSet.recognizePath("/pages/show/jamis/")).toEqual(expected);

    delete expected["id"];
    expect(tc.defaultRouteSet.recognizePath("/pages/show")).toEqual(expected);
    expect(tc.defaultRouteSet.recognizePath("/pages/show/")).toEqual(expected);

    expected["action"] = "index";
    expect(tc.defaultRouteSet.recognizePath("/pages/")).toEqual(expected);
    expect(tc.defaultRouteSet.recognizePath("/pages")).toEqual(expected);

    expect(() => tc.defaultRouteSet.recognizePath("/")).toThrow(RoutingError);
    expect(() => tc.defaultRouteSet.recognizePath("/pages/how/goood/it/is/to/be/free")).toThrow(
      RoutingError,
    );
  });

  it("default route should omit default action", () => {
    expect(tc.urlFor(tc.defaultRouteSet, { controller: "accounts", action: "index" })).toBe(
      "/accounts",
    );
  });

  it("default route should include default action when id present", () => {
    expect(
      tc.urlFor(tc.defaultRouteSet, { controller: "accounts", action: "index", id: "20" }),
    ).toBe("/accounts/index/20");
  });

  it("default route should work with action but no id", () => {
    expect(tc.urlFor(tc.defaultRouteSet, { controller: "accounts", action: "list_all" })).toBe(
      "/accounts/list_all",
    );
  });

  it("default route should uri escape pluses", () => {
    const expected = { controller: "pages", action: "show", id: "hello world" };
    expect(tc.defaultRouteSet.recognizePath("/pages/show/hello%20world")).toEqual(expected);
    expect(tc.urlFor(tc.defaultRouteSet, expected)).toBe("/pages/show/hello%20world");

    expected["id"] = "hello+world";
    expect(tc.defaultRouteSet.recognizePath("/pages/show/hello+world")).toEqual(expected);
    expect(tc.defaultRouteSet.recognizePath("/pages/show/hello%2Bworld")).toEqual(expected);
    expect(tc.urlFor(tc.defaultRouteSet, expected)).toBe("/pages/show/hello+world");
  });

  it("build empty query string", () => {
    assertUriEqual("/foo", tc.urlFor(tc.defaultRouteSet, { controller: "foo" }));
  });

  it("build query string with nil value", () => {
    assertUriEqual("/foo", tc.urlFor(tc.defaultRouteSet, { controller: "foo", x: null }));
  });

  it("simple build query string", () => {
    assertUriEqual(
      "/foo?x=1&y=2",
      tc.urlFor(tc.defaultRouteSet, { controller: "foo", x: "1", y: "2" }),
    );
  });

  it("convert ints build query string", () => {
    assertUriEqual(
      "/foo?x=1&y=2",
      tc.urlFor(tc.defaultRouteSet, { controller: "foo", x: 1, y: 2 }),
    );
  });

  it("escape spaces build query string", () => {
    assertUriEqual(
      "/foo?x=hello+world&y=goodbye+world",
      tc.urlFor(tc.defaultRouteSet, { controller: "foo", x: "hello world", y: "goodbye world" }),
    );
  });

  it("expand array build query string", () => {
    assertUriEqual(
      "/foo?x%5B%5D=1&x%5B%5D=2",
      tc.urlFor(tc.defaultRouteSet, { controller: "foo", x: [1, 2] }),
    );
  });

  it("escape spaces build query string selected keys", () => {
    assertUriEqual(
      "/foo?x=hello+world",
      tc.urlFor(tc.defaultRouteSet, { controller: "foo", x: "hello world" }),
    );
  });

  it("generate with default params", () => {
    set.draw(function () {
      this.get({ "dummy/page/:page": "dummy#show" });
      this.get({ "dummy/dots/page.:page": "dummy#dots" });
      this.get({
        "ibocorp(/:page)": "ibocorp#show",
        constraints: { page: /\d+/ },
        defaults: { page: 1 },
      });

      deprecator().silence(() => {
        this.get(":controller/:action/:id");
      });
    });

    expect(tc.urlFor(set, { controller: "ibocorp", action: "show", page: 1 })).toBe("/ibocorp");
  });
});
