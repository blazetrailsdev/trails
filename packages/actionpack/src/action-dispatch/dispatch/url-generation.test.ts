/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging --
   Ruby `include Routes.url_helpers`; the class/interface merge is how
   `include()` surfaces those members on the type side. */
import { beforeEach, describe, it } from "vitest";
import { assertEqual } from "@blazetrails/activesupport";
import { include } from "@blazetrails/ruby-compat";
import { Base } from "../../action-controller/base.js";
import { URL } from "../http/url.js";
import { controllerConstants } from "../http/request.js";
import { RouteSet } from "../routing/route-set.js";
import type { UrlForRoutes } from "../routing/url-for.js";
import { IntegrationTest } from "../testing/integration.js";
import "../../test-helpers/abstract-unit.js";

type Helper = (...args: unknown[]) => string;

describe("WithMountPoint", () => {
  const Routes = new RouteSet();

  class MyRouteGeneratingController extends Base {
    async index(): Promise<void> {
      await this.render({ plain: this.fooPath() });
    }

    async addTrailingSlash(): Promise<void> {
      await this.render({
        plain: this.urlFor({
          trailingSlash: true,
          params: this.request.queryParameters,
          format: this.params.get("format"),
        }),
      });
    }

    async trailingSlashDefault(): Promise<void> {
      if (this.params.get("url") != null) {
        await this.render({
          plain: this.trailingSlashDefaultUrl({ format: this.params.get("url_format") }),
        });
      } else {
        await this.render({
          plain: this.trailingSlashDefaultPath({ format: this.params.get("url_format") }),
        });
      }
    }
  }
  interface MyRouteGeneratingController {
    fooPath: Helper;
    trailingSlashDefaultUrl: Helper;
    trailingSlashDefaultPath: Helper;
  }
  include(MyRouteGeneratingController, Routes.urlHelpers());
  controllerConstants.set("my_route_generating", MyRouteGeneratingController);

  Routes.draw(function () {
    this.get("/foo", { to: "my_route_generating#index", as: "foo" });
    this.get("(/optional/:optional_id)/baz", { to: "my_route_generating#index", as: "baz" });
    this.get("/add_trailing_slash", {
      to: "my_route_generating#addTrailingSlash",
      as: "add_trailing_slash",
    });
    this.get("/trailing_slash_default", {
      to: "my_route_generating#trailingSlashDefault",
      as: "trailing_slash_default",
      trailingSlash: true,
    });

    this.resources("bars");

    this.mount(MyRouteGeneratingController.action("index"), { at: "/bar" });
  });

  const APP = IntegrationTest.buildApp(Routes);

  class WithMountPoint extends IntegrationTest {
    override get _routes(): UrlForRoutes {
      return Routes;
    }

    override get app(): unknown {
      return APP;
    }
  }
  interface WithMountPoint {
    fooPath: Helper;
    fooUrl: Helper;
    bazUrl: Helper;
    barsPath: Helper;
    barPath: Helper;
  }
  include(WithMountPoint, Routes.urlHelpers());

  let t: WithMountPoint;
  beforeEach(({ task }) => {
    t = new WithMountPoint(task.name);
  });

  it("generating URLS normally", () => {
    assertEqual("/foo", t.fooPath());
  });

  it("accepting a :script_name option", () => {
    assertEqual("/bar/foo", t.fooPath({ scriptName: "/bar" }));
  });

  it("the request's SCRIPT_NAME takes precedence over the route", async () => {
    await t.get("/foo", { headers: { SCRIPT_NAME: "/new", "action_dispatch.routes": Routes } });
    assertEqual("/new/foo", t.response.body);
  });

  it("the request's SCRIPT_NAME wraps the mounted app's", async () => {
    await t.get("/new/bar/foo", {
      headers: { SCRIPT_NAME: "/new", PATH_INFO: "/bar/foo", "action_dispatch.routes": Routes },
    });
    assertEqual("/new/bar/foo", t.response.body);
  });

  it("handling http protocol with https set", () => {
    t.httpsBang();
    assertEqual("http://www.example.com/foo", t.fooUrl({ protocol: "http" }));
  });

  it("respects secure_protocol configuration when protocol not present", () => {
    const oldSecureProtocol = URL.secureProtocol;

    try {
      URL.secureProtocol = true;
      assertEqual("https://www.example.com/foo", t.fooUrl({ protocol: null }));
    } finally {
      URL.secureProtocol = oldSecureProtocol;
    }
  });

  it("extracting protocol from host when protocol not present", () => {
    assertEqual(
      "httpz://www.example.com/foo",
      t.fooUrl({ host: "httpz://www.example.com", protocol: null }),
    );
  });

  it("formatting host when protocol is present", () => {
    assertEqual(
      "http://www.example.com/foo",
      t.fooUrl({ host: "httpz://www.example.com", protocol: "http://" }),
    );
  });

  it("default ports are removed from the host", () => {
    assertEqual(
      "http://www.example.com/foo",
      t.fooUrl({ host: "www.example.com:80", protocol: "http://" }),
    );
    assertEqual(
      "https://www.example.com/foo",
      t.fooUrl({ host: "www.example.com:443", protocol: "https://" }),
    );
  });

  it("port is extracted from the host", () => {
    assertEqual(
      "http://www.example.com:8080/foo",
      t.fooUrl({ host: "www.example.com:8080", protocol: "http://" }),
    );
    assertEqual(
      "//www.example.com:8080/foo",
      t.fooUrl({ host: "www.example.com:8080", protocol: "//" }),
    );
    assertEqual(
      "//www.example.com:80/foo",
      t.fooUrl({ host: "www.example.com:80", protocol: "//" }),
    );
  });

  it("port option is used", () => {
    assertEqual(
      "http://www.example.com:8080/foo",
      t.fooUrl({ host: "www.example.com", protocol: "http://", port: 8080 }),
    );
    assertEqual(
      "//www.example.com:8080/foo",
      t.fooUrl({ host: "www.example.com", protocol: "//", port: 8080 }),
    );
    assertEqual(
      "//www.example.com:80/foo",
      t.fooUrl({ host: "www.example.com", protocol: "//", port: 80 }),
    );
  });

  it("port option overrides the host", () => {
    assertEqual(
      "http://www.example.com:8080/foo",
      t.fooUrl({ host: "www.example.com:8443", protocol: "http://", port: 8080 }),
    );
    assertEqual(
      "//www.example.com:8080/foo",
      t.fooUrl({ host: "www.example.com:8443", protocol: "//", port: 8080 }),
    );
    assertEqual(
      "//www.example.com:80/foo",
      t.fooUrl({ host: "www.example.com:443", protocol: "//", port: 80 }),
    );
  });

  it("port option disables the host when set to nil", () => {
    assertEqual(
      "http://www.example.com/foo",
      t.fooUrl({ host: "www.example.com:8443", protocol: "http://", port: null }),
    );
    assertEqual(
      "//www.example.com/foo",
      t.fooUrl({ host: "www.example.com:8443", protocol: "//", port: null }),
    );
  });

  it("port option disables the host when set to false", () => {
    assertEqual(
      "http://www.example.com/foo",
      t.fooUrl({ host: "www.example.com:8443", protocol: "http://", port: false }),
    );
    assertEqual(
      "//www.example.com/foo",
      t.fooUrl({ host: "www.example.com:8443", protocol: "//", port: false }),
    );
  });

  it("keep subdomain when key is true", () => {
    assertEqual("http://www.example.com/foo", t.fooUrl({ subdomain: true }));
  });

  it("keep subdomain when key is missing", () => {
    assertEqual("http://www.example.com/foo", t.fooUrl());
  });

  it("omit subdomain when key is nil", () => {
    assertEqual("http://example.com/foo", t.fooUrl({ subdomain: null }));
  });

  it("omit subdomain when key is false", () => {
    assertEqual("http://example.com/foo", t.fooUrl({ subdomain: false }));
  });

  it("omit subdomain when key is blank", () => {
    assertEqual("http://example.com/foo", t.fooUrl({ subdomain: "" }));
  });

  it("keep optional path parameter when given", () => {
    assertEqual("http://www.example.com/optional/123/baz", t.bazUrl({ optional_id: 123 }));
  });

  it("keep optional path parameter when true", () => {
    assertEqual("http://www.example.com/optional/true/baz", t.bazUrl({ optional_id: true }));
  });

  it("omit optional path parameter when false", () => {
    assertEqual("http://www.example.com/optional/false/baz", t.bazUrl({ optional_id: false }));
  });

  it("omit optional path parameter when blank", () => {
    assertEqual("http://www.example.com/baz", t.bazUrl({ optional_id: "" }));
  });

  it("keep positional path parameter when true", () => {
    assertEqual("http://www.example.com/optional/true/baz", t.bazUrl(true));
  });

  it("omit positional path parameter when false", () => {
    assertEqual("http://www.example.com/optional/false/baz", t.bazUrl(false));
  });

  it("omit positional path parameter when blank", () => {
    assertEqual("http://www.example.com/baz", t.bazUrl(""));
  });

  it("generating the current URL with a trailing slashes", async () => {
    await t.get("/add_trailing_slash");
    assertEqual("http://www.example.com/add_trailing_slash/", t.response.body);
  });

  it("generating the current URL with a trailing slashes and query string", async () => {
    await t.get("/add_trailing_slash?a=b");
    assertEqual("http://www.example.com/add_trailing_slash/?a=b", t.response.body);
  });

  it("generating the current URL with a trailing slashes and format indicator", async () => {
    await t.get("/add_trailing_slash.json");
    assertEqual("http://www.example.com/add_trailing_slash.json", t.response.body);
  });

  it("generating the path with `trailing_slashes: true` default options", async () => {
    await t.get("/trailing_slash_default");
    assertEqual("/trailing_slash_default/", t.response.body);

    await t.get("/trailing_slash_default?url=1");
    assertEqual("http://www.example.com/trailing_slash_default/", t.response.body);
  });

  it("generating the path with `trailing_slashes: true` default options and format", async () => {
    await t.get("/trailing_slash_default?url_format=json");
    assertEqual("/trailing_slash_default.json", t.response.body);

    await t.get("/trailing_slash_default?url=1&url_format=json");
    assertEqual("http://www.example.com/trailing_slash_default.json", t.response.body);
  });

  it("generating URLs with trailing slashes", () => {
    assertEqual("/bars/", t.barsPath({ trailingSlash: true }));
  });

  it("generating URLs with trailing slashes and dot including param", () => {
    assertEqual("/bars/hax0r.json/", t.barPath("hax0r.json", { trailingSlash: true }));
  });

  it("generating URLs with trailing slashes and query string", () => {
    assertEqual("/bars/?a=b", t.barsPath({ trailingSlash: true, a: "b" }));
  });

  it("generating URLs with trailing slashes and format", () => {
    assertEqual("/bars.json", t.barsPath({ trailingSlash: true, format: "json" }));
  });

  it("generating URLS with querystring and trailing slashes", () => {
    assertEqual("/bars.json?a=b", t.barsPath({ trailingSlash: true, a: "b", format: "json" }));
  });

  it("generating URLS with empty querystring", () => {
    assertEqual("/bars.json", t.barsPath({ a: {}, format: "json" }));
  });
});
