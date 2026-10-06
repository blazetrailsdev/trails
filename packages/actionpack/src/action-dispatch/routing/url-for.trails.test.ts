import { describe, expect, it } from "vitest";

import { initializeIncludedModules } from "@blazetrails/activesupport";
import { include, rbObjSingletonClass } from "@blazetrails/ruby-compat";

import { RouteSet } from "./route-set.js";
import { UrlFor } from "./url-for.js";

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
      constructor() {
        initializeIncludedModules(this);
      }
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
      constructor() {
        initializeIncludedModules(this);
      }
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
