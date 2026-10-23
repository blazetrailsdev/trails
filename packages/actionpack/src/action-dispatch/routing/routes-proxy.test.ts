import { describe, expect, it } from "vitest";

import { RouteSet } from "./route-set.js";
import { RoutesProxy, mergeScriptNames, type RoutesProxyInstance } from "./routes-proxy.js";
import { urlOptions, type UrlForHost, type UrlForRoutes } from "./url-for.js";

function makeRoutes(label = "R1"): UrlForRoutes {
  return {
    urlFor: () => `/${label}`,
    isOptimizeRoutesGeneration: () => true,
  };
}

function makeScope(routes: UrlForRoutes, extraOptions: Record<string, unknown> = {}): UrlForHost {
  const scope: UrlForHost = {
    _routes: routes,
    defaultUrlOptions: { host: "example.com", ...extraOptions },
    urlOptions() {
      return { ...urlOptions.call(this), routesRef: this._routes };
    },
  };
  return scope;
}

describe("RoutesProxy", () => {
  it("exposes routes and _routes alias", () => {
    const routes = makeRoutes();
    const scope = makeScope(makeRoutes("OTHER"));
    const proxy = new RoutesProxy(routes, scope, {});
    expect(proxy.routes).toBe(routes);
    expect(proxy._routes).toBe(routes);
  });

  it("urlOptions runs scope.urlOptions with _routes swapped to proxy routes", () => {
    const proxyRoutes = makeRoutes("PROXY");
    const scopeRoutes = makeRoutes("SCOPE");
    const scope = makeScope(scopeRoutes);
    const proxy = new RoutesProxy(proxyRoutes, scope, {});

    const opts = proxy.urlOptions();
    expect(opts.routesRef).toBe(proxyRoutes);
    expect(scope._routes).toBe(scopeRoutes);
    expect(opts.host).toBe("example.com");
  });

  it("forwards helper calls with merged url_options", () => {
    const seen: unknown[] = [];
    const helpers = {
      usersUrl(...args: unknown[]) {
        seen.push(args);
        return "/users";
      },
    };
    const routes = makeRoutes();
    const scope = makeScope(makeRoutes("SCOPE"));
    const proxy = new RoutesProxy(routes, scope, helpers) as RoutesProxyInstance;

    expect(proxy.usersUrl(1, { page: 2 })).toBe("/users");
    const lastArg = (seen[0] as unknown[])[(seen[0] as unknown[]).length - 1] as Record<
      string,
      unknown
    >;
    expect(lastArg.host).toBe("example.com");
    expect(lastArg.page).toBe(2);
  });

  it("appends merged options when no inline options were passed", () => {
    const seen: unknown[][] = [];
    const helpers = {
      thingUrl(...args: unknown[]) {
        seen.push(args);
        return "/thing";
      },
    };
    const proxy = new RoutesProxy(
      makeRoutes(),
      makeScope(makeRoutes()),
      helpers,
    ) as RoutesProxyInstance;
    proxy.thingUrl(7);
    expect(seen[0].length).toBe(2);
    expect((seen[0][1] as Record<string, unknown>).host).toBe("example.com");
  });

  it("calls scriptNamer and merges via mergeScriptNames", () => {
    const captured: Record<string, unknown>[] = [];
    const helpers = {
      thingUrl(...args: unknown[]) {
        captured.push(args[args.length - 1] as Record<string, unknown>);
        return "/x";
      },
    };
    const scope = makeScope(makeRoutes());
    const proxy = new RoutesProxy(
      makeRoutes(),
      scope,
      helpers,
      () => "/mounted",
    ) as RoutesProxyInstance;

    proxy.thingUrl({ scriptName: "/ctx/old" });
    expect(captured[0].scriptName).toBe("/ctx/mounted");
  });

  it("throws on undefined helper when accessed directly", () => {
    const proxy = new RoutesProxy(makeRoutes(), makeScope(makeRoutes()), {});
    expect((proxy as RoutesProxyInstance).missingUrl).toBeUndefined();
  });
  it("forwards a helper defined on a url helpers module as a property", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/posts/:id", { to: "posts#show", as: "post" });
    });
    const proxy = new RoutesProxy(
      routes as unknown as UrlForRoutes,
      { urlOptions: () => ({}) } as UrlForHost,
      routes.urlHelpers() as unknown as Record<string, unknown>,
    ) as RoutesProxyInstance;

    expect("postPath" in proxy).toBe(true);
    expect(proxy.postPath(1)).toBe("/posts/1");
  });

  it("forwards a helper its helpers answer through respond_to_missing", () => {
    class Helpers {
      respondToMissing(method: string): boolean {
        return method === "dynamicPath";
      }
      methodMissing(_method: string, ..._args: unknown[]): string {
        return "/dynamic";
      }
    }
    const proxy = new RoutesProxy(
      makeRoutes(),
      { urlOptions: () => ({}) } as UrlForHost,
      new Helpers() as unknown as Record<string, unknown>,
    ) as RoutesProxyInstance;

    expect("dynamicPath" in proxy).toBe(true);
    expect(proxy.dynamicPath()).toBe("/dynamic");
  });
});

describe("mergeScriptNames", () => {
  it("returns newScriptName when previous is null", () => {
    expect(mergeScriptNames(null, "/foo")).toBe("/foo");
    expect(mergeScriptNames(undefined, "/foo")).toBe("/foo");
  });

  it("keeps context parts of previous and appends new", () => {
    expect(mergeScriptNames("/ctx/old", "/mounted")).toBe("/ctx/mounted");
  });

  it("handles deeper context", () => {
    expect(mergeScriptNames("/a/b/old", "/mounted")).toBe("/a/b/mounted");
  });

  it("handles new with multiple parts", () => {
    expect(mergeScriptNames("/ctx/old", "/m/n")).toBe("/m/n");
  });
});
