import { afterEach, beforeEach, describe, it, expect } from "vitest";
import {
  assertEqual,
  assertMatch,
  assertRaise,
  assertRespondTo,
  HashWithIndifferentAccess,
  toQuery,
} from "@blazetrails/activesupport";
import { ArgumentError, include } from "@blazetrails/ruby-compat";
import { deprecator } from "../../action-dispatch/deprecator.js";
import { URL } from "../../action-dispatch/http/url.js";
import { RouteSet } from "../../action-dispatch/routing/route-set.js";
import { UrlGenerationError } from "../metal/exceptions.js";
import { Parameters, UnfilteredParameters } from "../metal/strong-parameters.js";
import { UrlFor } from "../metal/url-for.js";
import { TestCase } from "../test-case.js";
import { SharedTestRoutes } from "../../test-helpers/abstract-unit.js";

type Helpers = Record<string, (...args: unknown[]) => string>;

class W {
  static defaultUrlOptions: Record<string, unknown>;
  declare urlFor: (options: unknown) => string;
}
include(
  W,
  (() => {
    const r = new RouteSet();
    r.draw(function () {
      deprecator().silence(() => {
        this.get(":controller(/:action(/:id(.:format)))");
      });
    });
    return r;
  })().urlHelpers(),
);

function addHost(app: { defaultUrlOptions: Record<string, unknown> } = W): void {
  app.defaultUrlOptions["host"] = "www.basecamphq.com";
}

function addPort(): void {
  W.defaultUrlOptions["port"] = 3000;
}

function addNumericHost(): void {
  W.defaultUrlOptions["host"] = "127.0.0.1";
}

function extractParams(url: string): string[] {
  return url.split("?", 2).at(-1)!.split("&").sort();
}

function helpersFor(set: RouteSet): {
  new (): Helpers;
  defaultUrlOptions: Record<string, unknown>;
} {
  const kls = class {};
  include(kls, set.urlHelpers());
  return kls as unknown as { new (): Helpers; defaultUrlOptions: Record<string, unknown> };
}

describe("UrlForTest", () => {
  let tc: TestCase;

  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    await tc.beforeSetup();
    tc.routes = SharedTestRoutes;
  });

  afterEach(() => {
    for (const key of Object.keys(W.defaultUrlOptions)) delete W.defaultUrlOptions[key];
  });

  it("nested optional", () => {
    const r = new RouteSet();
    r.draw(function () {
      this.get("/foo/(:bar/(:baz))/:zot", { as: "fun", controller: "articles", action: "index" });
    });
    const klass = helpersFor(r);
    klass.defaultUrlOptions["host"] = "example.com";

    const path = new klass().funPath({ controller: "articles", baz: "baz", zot: "zot" });
    assertEqual("/foo/zot", path);
  });

  it("exception is thrown without host", async () => {
    await assertRaise([ArgumentError], {}, () => {
      new W().urlFor({ controller: "c", action: "a", id: "i" });
    });
  });

  it("anchor", () => {
    assertEqual(
      "/c/a#anchor",
      new W().urlFor({ onlyPath: true, controller: "c", action: "a", anchor: "anchor" }),
    );
  });

  it("nil anchor", () => {
    assertEqual(
      "/c/a",
      new W().urlFor({ onlyPath: true, controller: "c", action: "a", anchor: null }),
    );
  });

  it("false anchor", () => {
    assertEqual(
      "/c/a",
      new W().urlFor({ onlyPath: true, controller: "c", action: "a", anchor: false }),
    );
  });

  it("anchor should call to param", () => {
    assertEqual(
      "/c/a/i#anchor",
      new W().urlFor({
        onlyPath: true,
        controller: "c",
        action: "a",
        id: "i",
        anchor: { toParam: () => "anchor" },
      }),
    );
  });

  it("anchor should escape unsafe pchar", () => {
    assertEqual(
      "/c/a#%23anchor",
      new W().urlFor({
        onlyPath: true,
        controller: "c",
        action: "a",
        anchor: { toParam: () => "#anchor" },
      }),
    );
  });

  it("anchor should not escape safe pchar", () => {
    assertEqual(
      "/c/a#name=user&email=user@domain.com",
      new W().urlFor({
        onlyPath: true,
        controller: "c",
        action: "a",
        anchor: { toParam: () => "name=user&email=user@domain.com" },
      }),
    );
  });

  it("default host", () => {
    addHost();
    assertEqual(
      "http://www.basecamphq.com/c/a/i",
      new W().urlFor({ controller: "c", action: "a", id: "i" }),
    );
  });

  it("host may be overridden", () => {
    addHost();
    assertEqual(
      "http://37signals.basecamphq.com/c/a/i",
      new W().urlFor({ host: "37signals.basecamphq.com", controller: "c", action: "a", id: "i" }),
    );
  });

  it("subdomain may be changed", () => {
    addHost();
    assertEqual(
      "http://api.basecamphq.com/c/a/i",
      new W().urlFor({ subdomain: "api", controller: "c", action: "a", id: "i" }),
    );
  });

  it("subdomain may be object", () => {
    const model = { toParam: () => "api" };
    addHost();
    assertEqual(
      "http://api.basecamphq.com/c/a/i",
      new W().urlFor({ subdomain: model, controller: "c", action: "a", id: "i" }),
    );
  });

  it("subdomain may be removed", () => {
    addHost();
    assertEqual(
      "http://basecamphq.com/c/a/i",
      new W().urlFor({ subdomain: false, controller: "c", action: "a", id: "i" }),
    );
  });

  it("subdomain may be removed with blank string", () => {
    W.defaultUrlOptions["host"] = "api.basecamphq.com";
    assertEqual(
      "http://basecamphq.com/c/a/i",
      new W().urlFor({ subdomain: "", controller: "c", action: "a", id: "i" }),
    );
  });

  it("multiple subdomains may be removed", () => {
    W.defaultUrlOptions["host"] = "mobile.www.api.basecamphq.com";
    assertEqual(
      "http://basecamphq.com/c/a/i",
      new W().urlFor({ subdomain: false, controller: "c", action: "a", id: "i" }),
    );
  });

  it("subdomain may be accepted with numeric host", () => {
    addNumericHost();
    assertEqual(
      "http://127.0.0.1/c/a/i",
      new W().urlFor({ subdomain: "api", controller: "c", action: "a", id: "i" }),
    );
  });

  it("domain may be changed", () => {
    addHost();
    assertEqual(
      "http://www.37signals.com/c/a/i",
      new W().urlFor({ domain: "37signals.com", controller: "c", action: "a", id: "i" }),
    );
  });

  it("tld length may be changed", () => {
    addHost();
    assertEqual(
      "http://mobile.www.basecamphq.com/c/a/i",
      new W().urlFor({ subdomain: "mobile", tldLength: 2, controller: "c", action: "a", id: "i" }),
    );
  });

  it("port", () => {
    addHost();
    assertEqual(
      "http://www.basecamphq.com:3000/c/a/i",
      new W().urlFor({ controller: "c", action: "a", id: "i", port: 3000 }),
    );
  });

  it("default port", () => {
    addHost();
    addPort();
    assertEqual(
      "http://www.basecamphq.com:3000/c/a/i",
      new W().urlFor({ controller: "c", action: "a", id: "i" }),
    );
  });

  it("protocol with and without separators", () => {
    addHost();
    assertEqual(
      "https://www.basecamphq.com/c/a/i",
      new W().urlFor({ controller: "c", action: "a", id: "i", protocol: "https" }),
    );
    assertEqual(
      "https://www.basecamphq.com/c/a/i",
      new W().urlFor({ controller: "c", action: "a", id: "i", protocol: "https:" }),
    );
    assertEqual(
      "https://www.basecamphq.com/c/a/i",
      new W().urlFor({ controller: "c", action: "a", id: "i", protocol: "https://" }),
    );
  });

  it("without protocol", () => {
    addHost();
    assertEqual(
      "//www.basecamphq.com/c/a/i",
      new W().urlFor({ controller: "c", action: "a", id: "i", protocol: "//" }),
    );
    assertEqual(
      "//www.basecamphq.com/c/a/i",
      new W().urlFor({ controller: "c", action: "a", id: "i", protocol: false }),
    );
  });

  it("without protocol and with port", () => {
    addHost();
    addPort();

    assertEqual(
      "//www.basecamphq.com:3000/c/a/i",
      new W().urlFor({ controller: "c", action: "a", id: "i", protocol: "//" }),
    );
    assertEqual(
      "//www.basecamphq.com:3000/c/a/i",
      new W().urlFor({ controller: "c", action: "a", id: "i", protocol: false }),
    );
  });

  it("user name and password", () => {
    addHost();
    assertEqual(
      "http://david:secret@www.basecamphq.com/c/a/i",
      new W().urlFor({ user: "david", password: "secret", controller: "c", action: "a", id: "i" }),
    );
  });

  it("user name and password with escape codes", () => {
    addHost();
    assertEqual(
      "http://openid.aol.com%2Fnextangler:one+two%3F@www.basecamphq.com/c/a/i",
      new W().urlFor({
        user: "openid.aol.com/nextangler",
        password: "one two?",
        controller: "c",
        action: "a",
        id: "i",
      }),
    );
  });

  it("trailing slash", () => {
    addHost();
    const options = { controller: "foo", trailingSlash: true, action: "bar", id: "33" };
    assertEqual("http://www.basecamphq.com/foo/bar/33/", new W().urlFor(options));
  });

  it("trailing slash with protocol", () => {
    addHost();
    const options = {
      trailingSlash: true,
      protocol: "https",
      controller: "foo",
      action: "bar",
      id: "33",
    };
    assertEqual("https://www.basecamphq.com/foo/bar/33/", new W().urlFor(options));
    assertEqual(
      "https://www.basecamphq.com/foo/bar/33/?query=string",
      new W().urlFor({ ...options, query: "string" }),
    );
  });

  it("trailing slash with only path", () => {
    const options: Record<string, unknown> = { controller: "foo", trailingSlash: true };
    assertEqual("/foo/", new W().urlFor({ ...options, onlyPath: true }));
    Object.assign(options, { action: "bar", id: "33" });
    assertEqual("/foo/bar/33/", new W().urlFor({ ...options, onlyPath: true }));
    assertEqual(
      "/foo/bar/33/?query=string",
      new W().urlFor({ ...options, query: "string", onlyPath: true }),
    );
  });

  it("trailing slash with anchor", () => {
    const options = {
      trailingSlash: true,
      controller: "foo",
      action: "bar",
      id: "33",
      onlyPath: true,
      anchor: "chapter7",
    };
    assertEqual("/foo/bar/33/#chapter7", new W().urlFor(options));
    assertEqual(
      "/foo/bar/33/?query=string#chapter7",
      new W().urlFor({ ...options, query: "string" }),
    );
  });

  it("trailing slash with params", () => {
    const url = new W().urlFor({
      trailingSlash: true,
      onlyPath: true,
      controller: "cont",
      action: "act",
      p1: "cafe",
      p2: "link",
    });
    const params = extractParams(url);
    assertEqual(toQuery({ p1: "cafe" }), params[0]);
    assertEqual(toQuery({ p2: "link" }), params[1]);
  });

  it("relative url root is respected", () => {
    addHost();
    assertEqual(
      "https://www.basecamphq.com/subdir/c/a/i",
      new W().urlFor({
        controller: "c",
        action: "a",
        id: "i",
        protocol: "https",
        scriptName: "/subdir",
      }),
    );
  });

  it("relative url root is respected with environment variable", () => {
    const config = new RouteSet.Config("/subdir");
    const r = new RouteSet(config);
    r.draw(function () {
      deprecator().silence(() => {
        this.get(":controller(/:action(/:id(.:format)))");
      });
    });
    const w = helpersFor(r);
    addHost(w);
    assertEqual(
      "https://www.basecamphq.com/subdir/c/a/i",
      new w().urlFor({ controller: "c", action: "a", id: "i", protocol: "https" }),
    );
  });

  it("named routes", () => {
    const set = new RouteSet();
    set.draw(function () {
      this.get("this/is/verbose", { to: "home#index", as: "no_args" });
      this.get("home/sweet/home/:user", { to: "home#index", as: "home" });
    });

    const kls = helpersFor(set);

    const controller = new kls();
    assertRespondTo(controller, "homeUrl");
    assertEqual(
      "http://www.basecamphq.com/home/sweet/home/again",
      controller.homeUrl({ host: "www.basecamphq.com", user: "again" }),
    );

    assertEqual(
      "/home/sweet/home/alabama",
      controller.homePath({ user: "alabama", host: "unused" }),
    );
    assertEqual(
      "http://www.basecamphq.com/home/sweet/home/alabama",
      controller.homeUrl({ user: "alabama", host: "www.basecamphq.com" }),
    );
    assertEqual(
      "http://www.basecamphq.com/this/is/verbose",
      controller.noArgsUrl({ host: "www.basecamphq.com" }),
    );
  });

  it("relative url root is respected for named routes", () => {
    const set = new RouteSet();
    set.draw(function () {
      this.get("/home/sweet/home/:user", { to: "home#index", as: "home" });
    });

    const kls = helpersFor(set);
    const controller = new kls();

    assertEqual(
      "http://www.basecamphq.com/subdir/home/sweet/home/again",
      controller.homeUrl({ host: "www.basecamphq.com", user: "again", scriptName: "/subdir" }),
    );
  });

  it("path params with default url options", () => {
    const set = new RouteSet();
    set.draw(function () {
      this.scope(":account_id", () => {
        this.get({ dashboard: "pages#dashboard", as: "dashboard" });
        this.get({ "search(/:term)": "search#search", as: "search" });
      });
      this.delete({ signout: "sessions#destroy", as: "signout" });
    });

    const kls = class {
      get defaultUrlOptions(): Record<string, unknown> {
        return { pathParams: { account_id: "foo" } };
      }
    };
    include(kls, set.urlHelpers());

    const controller = new kls() as unknown as Helpers;

    assertEqual("/foo/dashboard", controller.dashboardPath());
    assertEqual("/bar/dashboard", controller.dashboardPath({ account_id: "bar" }));
    assertEqual("/signout", controller.signoutPath());
    assertEqual("/signout?account_id=bar", controller.signoutPath({ account_id: "bar" }));
    assertEqual(
      "/signout?account_id=bar",
      controller.signoutPath({ account_id: "bar", pathParams: { account_id: "baz" } }),
    );
    assertEqual("/foo/search/quin", controller.searchPath("quin"));
  });

  it("path params without default url options", async () => {
    const set = new RouteSet();
    set.draw(function () {
      this.scope(":account_id", () => {
        this.get({ dashboard: "pages#dashboard", as: "dashboard" });
        this.get({ "search(/:term)": "search#search", as: "search" });
      });
      this.delete({ signout: "sessions#destroy", as: "signout" });
    });

    const kls = helpersFor(set);
    const controller = new kls();

    await assertRaise([UrlGenerationError], {}, () => {
      controller.dashboardPath();
    });

    assertEqual("/bar/dashboard", controller.dashboardPath({ pathParams: { account_id: "bar" } }));
    assertEqual("/signout", controller.signoutPath({ pathParams: { account_id: "bar" } }));
    assertEqual(
      "/signout?account_id=bar",
      controller.signoutPath({ account_id: "bar", pathParams: { account_id: "baz" } }),
    );
    assertEqual("/foo/search/quin", controller.searchPath("foo", "quin"));
  });

  it("using nil script name properly concats with original script name", () => {
    addHost();
    assertEqual(
      "https://www.basecamphq.com/subdir/c/a/i",
      new W().urlFor({
        controller: "c",
        action: "a",
        id: "i",
        protocol: "https",
        scriptName: null,
        originalScriptName: "/subdir",
      }),
    );
  });

  it("only path", () => {
    const set = new RouteSet();
    set.draw(function () {
      this.get("home/sweet/home/:user", { to: "home#index", as: "home" });

      deprecator().silence(() => {
        this.get(":controller/:action/:id");
      });
    });

    const kls = helpersFor(set);
    const controller = new kls();
    assertRespondTo(controller, "homeUrl");
    assertEqual(
      "/brave/new/world",
      controller.urlFor({ controller: "brave", action: "new", id: "world", onlyPath: true }),
    );

    assertEqual(
      "/home/sweet/home/alabama",
      controller.homePath({ user: "alabama", host: "unused" }),
    );
    assertEqual("/home/sweet/home/alabama", controller.homePath("alabama"));
  });

  it("one parameter", () => {
    assertEqual(
      "/c/a?param=val",
      new W().urlFor({ onlyPath: true, controller: "c", action: "a", param: "val" }),
    );
  });

  it("two parameters", () => {
    const url = new W().urlFor({
      onlyPath: true,
      controller: "c",
      action: "a",
      p1: "X1",
      p2: "Y2",
    });
    const params = extractParams(url);
    assertEqual(toQuery({ p1: "X1" }), params[0]);
    assertEqual(toQuery({ p2: "Y2" }), params[1]);
  });

  it("params option", () => {
    const url = new W().urlFor({
      onlyPath: true,
      controller: "c",
      action: "a",
      params: { domain: "foo", id: "1" },
    });
    const params = extractParams(url);
    assertEqual("/c/a?domain=foo&id=1", url);
    assertEqual(toQuery({ domain: "foo" }), params[0]);
    assertEqual(toQuery({ id: "1" }), params[1]);
  });

  it("params option strong parameters", () => {
    const requestParams = new Parameters({ domain: "foo", id: "1", other: "BAD" });
    const url = new W().urlFor({
      onlyPath: true,
      controller: "c",
      action: "a",
      params: requestParams.permit("domain", "id"),
    });
    const params = extractParams(url);
    assertEqual("/c/a?domain=foo&id=1", url);
    assertEqual(toQuery({ domain: "foo" }), params[0]);
    assertEqual(toQuery({ id: "1" }), params[1]);
  });

  it("non hash params option", () => {
    const url = new W().urlFor({ onlyPath: true, controller: "c", action: "a", params: "p" });
    const params = extractParams(url);
    assertEqual("/c/a?params=p", url);
    assertEqual(toQuery({ params: "p" }), params[0]);
  });

  it("hash parameter", () => {
    const url = new W().urlFor({
      onlyPath: true,
      controller: "c",
      action: "a",
      query: { name: "Bob", category: "prof" },
    });
    const params = extractParams(url);
    assertEqual(toQuery({ "query[category]": "prof" }), params[0]);
    assertEqual(toQuery({ "query[name]": "Bob" }), params[1]);
  });

  it("array parameter", () => {
    const url = new W().urlFor({
      onlyPath: true,
      controller: "c",
      action: "a",
      query: ["Bob", "prof"],
    });
    const params = extractParams(url);
    assertEqual(toQuery({ "query[]": "Bob" }), params[0]);
    assertEqual(toQuery({ "query[]": "prof" }), params[1]);
  });

  it("hash recursive parameters", () => {
    const url = new W().urlFor({
      onlyPath: true,
      controller: "c",
      action: "a",
      query: { person: { name: "Bob", position: "prof" }, hobby: "piercing" },
    });
    const params = extractParams(url);
    assertEqual(toQuery({ "query[hobby]": "piercing" }), params[0]);
    assertEqual(toQuery({ "query[person][name]": "Bob" }), params[1]);
    assertEqual(toQuery({ "query[person][position]": "prof" }), params[2]);
  });

  it("hash recursive and array parameters", () => {
    const url = new W().urlFor({
      onlyPath: true,
      controller: "c",
      action: "a",
      id: 101,
      query: { person: { name: "Bob", position: ["prof", "art director"] }, hobby: "piercing" },
    });
    assertMatch(/^\/c\/a\/101/, url);
    const params = extractParams(url);
    assertEqual(toQuery({ "query[hobby]": "piercing" }), params[0]);
    assertEqual(toQuery({ "query[person][name]": "Bob" }), params[1]);
    assertEqual(toQuery({ "query[person][position][]": "art director" }), params[2]);
    assertEqual(toQuery({ "query[person][position][]": "prof" }), params[3]);
  });

  it("url action controller parameters", async () => {
    addHost();
    await assertRaise([UnfilteredParameters], {}, () => {
      new W().urlFor(
        new Parameters({
          controller: "c",
          action: "a",
          protocol: "javascript",
          f: "%0Aeval(name)",
        }),
      );
    });
  });

  it("path generation for symbol parameter keys", () => {
    tc.assertGenerates("/image", { controller: "image" });
  });

  it("named routes with nil keys", () => {
    const set = new RouteSet();
    set.draw(function () {
      this.get("posts.:format", { to: "posts#index", as: "posts" });
      this.get("/", { to: "posts#index", as: "main" });
    });

    const kls = helpersFor(set);
    kls.defaultUrlOptions["host"] = "www.basecamphq.com";

    const controller = new kls();
    const params: Record<string, unknown> = { action: "index", controller: "posts", format: "xml" };
    assertEqual("http://www.basecamphq.com/posts.xml", controller.urlFor(params));
    params["format"] = null;
    assertEqual("http://www.basecamphq.com/", controller.urlFor(params));
  });

  it("multiple includes maintain distinct options", () => {
    const firstClass = class {} as unknown as { defaultUrlOptions: Record<string, unknown> };
    include(firstClass, UrlFor);
    const secondClass = class {} as unknown as { defaultUrlOptions: Record<string, unknown> };
    include(secondClass, UrlFor);

    const [firstHost, secondHost] = ["firsthost.com", "secondhost.com"];

    firstClass.defaultUrlOptions["host"] = firstHost;
    secondClass.defaultUrlOptions["host"] = secondHost;

    assertEqual(firstHost, firstClass.defaultUrlOptions["host"]);
    assertEqual(secondHost, secondClass.defaultUrlOptions["host"]);
  });

  it("with stringified keys", () => {
    assertEqual("/c", new W().urlFor({ controller: "c", onlyPath: true }));
    assertEqual("/c/a", new W().urlFor({ controller: "c", action: "a", onlyPath: true }));
  });

  it("with hash with indifferent access", () => {
    W.defaultUrlOptions["controller"] = "d";
    W.defaultUrlOptions["onlyPath"] = false;
    assertEqual(
      "/c",
      new W().urlFor(new HashWithIndifferentAccess({ controller: "c", onlyPath: true })),
    );

    W.defaultUrlOptions["action"] = "b";
    assertEqual(
      "/c/a",
      new W().urlFor(
        new HashWithIndifferentAccess({ controller: "c", action: "a", onlyPath: true }),
      ),
    );
  });

  it("url params with nil to param are not in url", () => {
    assertEqual(
      "/c/a",
      new W().urlFor({
        onlyPath: true,
        controller: "c",
        action: "a",
        id: { toParam: () => null },
      }),
    );
  });

  it("false url params are included in query", () => {
    assertEqual(
      "/c/a?show=false",
      new W().urlFor({ onlyPath: true, controller: "c", action: "a", show: false }),
    );
  });

  it("url generation with array and hash", () => {
    const set = new RouteSet();
    set.draw(function () {
      this.namespace("admin", () => {
        this.resources("posts");
      });
    });

    const kls = helpersFor(set);
    kls.defaultUrlOptions["host"] = "www.basecamphq.com";

    const controller = new kls();
    assertEqual(
      "http://www.basecamphq.com/admin/posts/new?param=value",
      controller.urlFor([":new", ":admin", ":post", { param: "value" }]),
    );
  });

  it("url for with array is unmodified", () => {
    const set = new RouteSet();
    set.draw(function () {
      this.namespace("admin", () => {
        this.resources("posts");
      });
    });

    const kls = helpersFor(set);
    kls.defaultUrlOptions["host"] = "www.basecamphq.com";

    const originalComponents = [":new", ":admin", ":post", { param: "value" }];
    const components = [...originalComponents];

    new kls().urlFor(components);

    assertEqual(originalComponents, components);
  });

  it("default params first empty", () => {
    const set = new RouteSet();
    set.draw(function () {
      this.get({
        "(:param1)/test(/:param2)": "index#index",
        defaults: { param1: 1, param2: 2 },
        constraints: { param1: /\d*/, param2: /\d+/ },
      });
    });

    const kls = helpersFor(set);
    kls.defaultUrlOptions["host"] = "www.basecamphq.com";

    assertEqual(
      "http://www.basecamphq.com/test",
      new kls().urlFor({ controller: "index", param1: "1" }),
    );
  });

  it("https default port", () => {
    expect(URL.urlFor({ host: "example.com", protocol: "https", port: 443, path: "/" })).toBe(
      "https://example.com/",
    );
  });
});
