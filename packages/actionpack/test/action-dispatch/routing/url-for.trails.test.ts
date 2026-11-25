import { describe, expect, it } from "vitest";

import { TopLevel } from "@blazetrails/activesupport";
import { include, isModuleIncluded } from "@blazetrails/ruby-compat/include";
import { rbObjSingletonClass } from "@blazetrails/ruby-compat/object";

import { RouteSet } from "../../../lib/action-dispatch/routing/route-set.js";
import { UrlFor, urlFor, type UrlForHost } from "../../../lib/action-dispatch/routing/url-for.js";
import { Base as ViewBase } from "@blazetrails/actionview";
import { Parameters } from "../../../lib/action-controller/metal/strong-parameters.js";

describe("ActionDispatch::Routing::UrlFor included", () => {
  it("gives a class a default_url_options class attribute", () => {
    class Host {
      declare static defaultUrlOptions: Record<string, unknown>;
    }
    include(Host, UrlFor);
    expect(Host.defaultUrlOptions).toEqual({});
    expect((new Host() as { urlOptions(): unknown }).urlOptions()).toEqual({});
  });

  it("keeps a default_url_options the class already defines", () => {
    class Host {
      get defaultUrlOptions(): Record<string, unknown> {
        return { host: "example.com" };
      }
    }
    include(Host, UrlFor);
    expect(Object.hasOwn(Host, "defaultUrlOptions")).toBe(false);
  });

  it("includes the class's _url_for_modules", () => {
    class Extra {
      extra(): string {
        return "extra";
      }
    }
    class Host {
      static _urlForModules(): typeof Extra {
        return Extra;
      }
    }
    include(Host, UrlFor);
    expect((new Host() as unknown as Extra).extra()).toBe("extra");
  });

  it("reads the route set of url_helpers included into the singleton class after initialize", () => {
    class Host {
      declare _routes: RouteSet;
    }
    include(Host, UrlFor);
    const host = new Host();
    expect(Object.hasOwn(host, "_routes")).toBe(false);

    const routes = new RouteSet();
    include(rbObjSingletonClass(host), routes.urlHelpers());
    expect(host._routes).toBe(routes);
  });

  it("initialize nils @_routes through the url_helpers accessor a class already includes", () => {
    const routes = new RouteSet();
    class Host {
      declare _routes: RouteSet | null;
    }
    include(Host, routes.urlHelpers());
    include(Host, UrlFor);
    const host = new Host();
    expect(Object.hasOwn(host, "_routes")).toBe(false);
    expect(host._routes).toBe(routes);

    const other = new RouteSet();
    host._routes = other;
    expect(host._routes).toBe(other);
    expect(new Host()._routes).toBe(routes);
  });
});

describe("ActionView::Base with Routing::UrlFor included", () => {
  it("takes the _routes segment on a view class that includes the url helpers", () => {
    const routes = new RouteSet();
    const View = class extends ViewBase {};
    include(View, routes.urlHelpers());
    expect(TopLevel.ActionDispatch?.Routing.UrlFor).toBe(UrlFor);
    expect(isModuleIncluded(View, UrlFor)).toBe(true);
    expect(isModuleIncluded(ViewBase, UrlFor)).toBe(false);
    expect((View.empty() as unknown as { _routes: unknown })._routes).toBe(routes);
  });
});

describe("UrlForOptions mirrors full_url_for's arms", () => {
  it("rejects a known url option of the wrong type at compile time", () => {
    const host = {
      _routes: { urlFor: () => "http://www.example.com/" },
      defaultUrlOptions: {},
      urlOptions: () => ({}),
    } as unknown as UrlForHost;
    // @ts-expect-error onlyPath is a boolean (UrlOptions)
    const wronglyTyped = (): string => urlFor.call(host, { onlyPath: "yes" });
    expect(typeof wronglyTyped).toBe("function");
    expect(urlFor.call(host, { onlyPath: true, useRoute: "root", id: 1 })).toBe(
      "http://www.example.com/",
    );
  });
});

describe("ActionDispatch::Routing::UrlFor#full_url_for with Parameters", () => {
  it("crosses a Parameters' snake_case option keys into the camelCase option names", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/:controller/:action");
    });
    const host = {
      _routes: routes,
      defaultUrlOptions: { host: "example.com" },
      urlOptions() {
        return this.defaultUrlOptions;
      },
    } as UrlForHost;
    const params = new Parameters({ controller: "foo", action: "other", only_path: true });
    expect(urlFor.call(host, params.permitBang())).toBe("/foo/other");
  });
});
