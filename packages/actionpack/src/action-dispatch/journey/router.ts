import { X_CASCADE } from "../constants.js";
import { unescapeUri } from "./router/utils.js";
import type { Route } from "./route.js";
import type { Routes } from "./routes.js";

/**
 * Minimal request shape consumed by the Router. Trails' `ActionDispatch::Request`
 * conforms; tests in this file build inline fakes.
 */
export interface RouterRequest {
  pathInfo: string;
  scriptName: string;
  requestMethod: string;
  pathParameters: Record<string, unknown>;
  routeUriPattern?: string | null;
  isHead?: boolean;
  /** Route matching is verb-based; constraints may inspect arbitrary keys. */
  [key: string]: unknown;
}

export interface RackishResponse {
  0: number;
  1: Record<string, string>;
  2: unknown;
}

export interface RoutableApp {
  serve(req: RouterRequest): RackishResponse;
}

/**
 * Journey router. Drives `serve` (Rack-style dispatch with X-Cascade pass-
 * through) and `recognize` (route introspection used by tests / inspect).
 *
 * Mirrors `action_dispatch/journey/router.rb`.
 */
export class Router {
  routes: Routes;

  constructor(routes: Routes) {
    this.routes = routes;
  }

  eagerLoadBang(): void {
    void this.simulator();
  }

  serve(req: RouterRequest): RackishResponse {
    for (const { match, parameters, route } of this.findRoutes(req)) {
      const setParams = req.pathParameters;
      const pathInfo = req.pathInfo;
      const scriptName = req.scriptName;

      if (!route.path.anchored) {
        req.scriptName = ((scriptName ?? "") + match.toString()).replace(/\/$/, "");
        let post = match.postMatch();
        if (!post.startsWith("/")) post = "/" + post;
        req.pathInfo = post;
      }

      const tmpParams: Record<string, unknown> = { ...setParams, ...route.defaults };
      for (const [key, val] of Object.entries(parameters)) {
        tmpParams[key] = val;
      }

      req.pathParameters = tmpParams;
      req.routeUriPattern = String(route.path.spec);

      const app = route.app as RoutableApp | undefined;
      if (!app) continue;
      const response = app.serve(req);
      const headers = response[1] ?? {};

      if (headers[X_CASCADE] === "pass") {
        req.scriptName = scriptName;
        req.pathInfo = pathInfo;
        req.pathParameters = setParams;
        continue;
      }

      return response;
    }

    return [404, { [X_CASCADE]: "pass" }, ["Not Found"]] as unknown as RackishResponse;
  }

  recognize(
    req: RouterRequest,
    // Block return is `unknown` so expression-bodied callbacks like
    // `(r) => arr.push(r.name)` (which return a number) remain type-
    // compatible with the previous `() => void` signature. Only an
    // explicit `=== true` signals short-circuit.
    block: (route: Route, parameters: Record<string, unknown>) => unknown,
  ): void {
    for (const { match, parameters, route } of this.findRoutes(req)) {
      if (!route.path.anchored) {
        req.scriptName = match.toString();
        let post = match.postMatch();
        if (!post.startsWith("/")) post = "/" + post;
        req.pathInfo = post;
      }
      const merged: Record<string, unknown> = { ...route.defaults, ...parameters };
      // JS callbacks can't `return` from the caller's frame the way Ruby
      // blocks can; returning `true` from the block signals "stop iterating".
      if (block(route, merged) === true) return;
    }
  }

  /** @internal */
  private partitionedRoutes(): [Route[], Route[]] {
    const anchored: Route[] = [];
    const custom: Route[] = [];
    for (const r of this.routes) {
      if (r.path.anchored && r.path.isRequirementsAnchored()) anchored.push(r);
      else custom.push(r);
    }
    return [anchored, custom];
  }

  /** @internal */
  private ast() {
    return this.routes.ast;
  }

  /** @internal */
  private simulator() {
    return this.routes.simulator;
  }

  /** @internal */
  private customRoutes(): readonly Route[] {
    return this.routes.customRoutes;
  }

  /** @internal */
  private filterRoutes(path: string): Route[] {
    if (!this.ast()) return [];
    return this.simulator().memos(path, () => []) as Route[];
  }

  /** @internal */
  private *findRoutes(
    req: RouterRequest,
  ): Generator<{ match: PatternMatch; parameters: Record<string, unknown>; route: Route }> {
    const pathInfo = req.pathInfo;
    let routes = [
      ...this.filterRoutes(pathInfo),
      ...this.customRoutes().filter((r) => r.path.isMatch(pathInfo)),
    ];

    if (req.isHead || req.requestMethod === "HEAD") {
      routes = this.matchHeadRoutes(routes, req);
    } else {
      routes = routes.filter((r) =>
        r.matches(req as unknown as { requestMethod: string } & Record<string, unknown>),
      );
    }

    routes.sort((a, b) => a.precedence - b.precedence);

    for (const r of routes) {
      const matchData = r.path.match(pathInfo);
      if (!matchData) continue;
      const pathParameters: Record<string, unknown> = {};
      matchData.names.forEach((name, i) => {
        const val = matchData.at(i + 1);
        if (val != null) pathParameters[name] = unescapeUri(val);
      });
      yield { match: matchData, parameters: pathParameters, route: r };
    }
  }

  /** @internal */
  private matchHeadRoutes(routes: Route[], req: RouterRequest): Route[] {
    const head = routes.filter(
      (r) =>
        r.isRequiresMatchingVerb() &&
        r.matches(req as unknown as { requestMethod: string } & Record<string, unknown>),
    );
    if (head.length > 0) return head;

    const original = req.requestMethod;
    try {
      req.requestMethod = "GET";
      return routes.filter((r) =>
        r.matches(req as unknown as { requestMethod: string } & Record<string, unknown>),
      );
    } finally {
      req.requestMethod = original;
    }
  }
}

interface PatternMatch {
  names: readonly string[];
  at(i: number): string | undefined;
  postMatch(): string;
  toString(): string;
}
