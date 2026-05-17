import { describe, expect, it, vi } from "vitest";

import {
  _routesContext,
  _withRoutes,
  fullUrlFor,
  initialize,
  optimizeRoutesGeneration,
  routeFor,
  urlFor,
  urlOptions,
  type UrlForHost,
  type UrlForRoutes,
} from "./url-for.js";

function makeRoutes(): UrlForRoutes & {
  calls: Array<[Record<string, unknown>, string | null | undefined]>;
} {
  const calls: Array<[Record<string, unknown>, string | null | undefined]> = [];
  return {
    calls,
    urlFor(opts, routeName) {
      calls.push([opts, routeName ?? null]);
      return `/generated?${Object.keys(opts).sort().join(",")}`;
    },
    optimizeRoutesGeneration() {
      return true;
    },
  };
}

function makeHost(overrides: Partial<UrlForHost> = {}): UrlForHost {
  const host: UrlForHost = {
    _routes: makeRoutes(),
    defaultUrlOptions: {},
    urlOptions() {
      return urlOptions.call(this);
    },
    ...overrides,
  };
  return host;
}

describe("ActionDispatch::Routing::UrlFor", () => {
  it("urlFor() delegates to fullUrlFor", () => {
    const host = makeHost();
    const spy = vi.spyOn(host._routes as UrlForRoutes, "urlFor");
    urlFor.call(host, { controller: "users", action: "new" });
    expect(spy).toHaveBeenCalledOnce();
  });

  it("nil options → _routes.urlFor(urlOptions)", () => {
    const host = makeHost({ defaultUrlOptions: { host: "example.com" } });
    const out = fullUrlFor.call(host, null);
    expect(out).toBe("/generated?host");
  });

  it("string options → returned verbatim", () => {
    expect(fullUrlFor.call(makeHost(), "/already/built")).toBe("/already/built");
  });

  it("hash options merge under urlOptions and strip use_route", () => {
    const host = makeHost({ defaultUrlOptions: { host: "example.com" } });
    const routes = host._routes as ReturnType<typeof makeRoutes>;
    fullUrlFor.call(host, { controller: "posts", use_route: "post" });
    const [opts, routeName] = routes.calls[0]!;
    expect(routeName).toBe("post");
    expect(opts).toEqual({ host: "example.com", controller: "posts" });
    expect(opts).not.toHaveProperty("use_route");
  });

  it("explicit option wins over urlOptions default", () => {
    const host = makeHost({ defaultUrlOptions: { host: "default.test" } });
    const routes = host._routes as ReturnType<typeof makeRoutes>;
    fullUrlFor.call(host, { host: "override.test" });
    expect(routes.calls[0]![0]).toEqual({ host: "override.test" });
  });

  it("symbol options throw with HelperMethodBuilder reference", () => {
    expect(() => fullUrlFor.call(makeHost(), Symbol("user"))).toThrow(/HelperMethodBuilder/);
  });

  it("array options delegate to host.polymorphicUrl when present", () => {
    const polymorphicUrl = vi.fn(() => "/posts/1");
    const host = makeHost({ polymorphicUrl });
    const result = fullUrlFor.call(host, [{ id: 1 }, { only_path: true }]);
    expect(result).toBe("/posts/1");
    expect(polymorphicUrl).toHaveBeenCalledWith([{ id: 1 }], { only_path: true });
  });

  it("array options throw when polymorphicUrl missing", () => {
    expect(() => fullUrlFor.call(makeHost(), [{ id: 1 }])).toThrow(/PolymorphicRoutes/);
  });

  it("initialize() sets _routes to null", () => {
    const host = makeHost();
    initialize.call(host);
    expect(host._routes).toBeNull();
  });

  it("routeFor calls `${name}Url` on the host", () => {
    const userUrl = vi.fn(() => "/users/42");
    const host = makeHost();
    (host as unknown as Record<string, unknown>)["userUrl"] = userUrl;
    expect(routeFor.call(host, "user", { id: 42 })).toBe("/users/42");
    expect(userUrl).toHaveBeenCalledWith({ id: 42 });
  });

  it("routeFor throws when helper missing", () => {
    expect(() => routeFor.call(makeHost(), "missing")).toThrow(/missingUrl/);
  });

  it("optimizeRoutesGeneration requires empty defaultUrlOptions", () => {
    expect(optimizeRoutesGeneration.call(makeHost())).toBe(true);
    expect(optimizeRoutesGeneration.call(makeHost({ defaultUrlOptions: { host: "x" } }))).toBe(
      false,
    );
  });

  it("_withRoutes swaps _routes for the block and restores", () => {
    const host = makeHost();
    const original = host._routes;
    const temp = makeRoutes();
    const seen = _withRoutes.call(host, temp, () => host._routes);
    expect(seen).toBe(temp);
    expect(host._routes).toBe(original);
  });

  it("_withRoutes restores _routes even when block throws", () => {
    const host = makeHost();
    const original = host._routes;
    expect(() =>
      _withRoutes.call(host, makeRoutes(), () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(host._routes).toBe(original);
  });

  it("_routesContext returns the host itself", () => {
    const host = makeHost();
    expect(_routesContext.call(host)).toBe(host);
  });

  it("urlOptions default returns defaultUrlOptions", () => {
    const host = makeHost({ defaultUrlOptions: { host: "x.test", port: 3000 } });
    expect(urlOptions.call(host)).toEqual({ host: "x.test", port: 3000 });
  });

  it("throws when no _routes available", () => {
    const host = makeHost({ _routes: null });
    expect(() => fullUrlFor.call(host, null)).toThrow(/No routes/);
  });
});
