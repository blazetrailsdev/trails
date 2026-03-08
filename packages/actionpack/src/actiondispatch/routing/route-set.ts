/**
 * ActionDispatch::Routing::RouteSet
 *
 * The central route collection. Supports:
 * - draw() with the Mapper DSL
 * - recognize() to match a request
 * - pathFor() / urlFor() to generate URLs from named routes
 * - Rack-compatible call() for dispatching
 */

import type { RackEnv, RackResponse } from "@rails-ts/rack";
import { bodyFromString } from "@rails-ts/rack";
import { Mapper } from "./mapper.js";
import type { MatchedRoute } from "./route.js";
import { Route } from "./route.js";

export type DrawCallback = (mapper: Mapper) => void;

export type Dispatcher = (
  controller: string,
  action: string,
  params: Record<string, string>,
  env: RackEnv
) => Promise<RackResponse>;

export class RouteSet {
  private routes: Route[] = [];
  private namedRoutes: Map<string, Route> = new Map();
  private dispatcher: Dispatcher | undefined;
  private defaultUrlOptions: { host?: string } = {};

  /**
   * Draw routes using the Mapper DSL. Can be called multiple times;
   * each call appends routes (like Rails).
   */
  draw(callback: DrawCallback): void {
    const mapper = new Mapper();
    callback(mapper);

    for (const route of mapper.routes) {
      this.routes.push(route);
      if (route.name) {
        this.namedRoutes.set(route.name, route);
      }
    }
  }

  /**
   * Set a dispatcher that handles matched routes.
   * Without one, call() returns a simple JSON response.
   */
  setDispatcher(dispatcher: Dispatcher): void {
    this.dispatcher = dispatcher;
  }

  /**
   * Recognize a request: find the first matching route.
   */
  recognize(method: string, path: string): MatchedRoute | null {
    for (const route of this.routes) {
      const m = route.match(method, path);
      if (m) return m;
    }
    return null;
  }

  /**
   * Generate a path for a named route.
   * Mirrors Rails' `posts_path(id: 1)`.
   */
  pathFor(
    routeName: string,
    params: Record<string, string | number> = {}
  ): string {
    const route = this.namedRoutes.get(routeName);
    if (!route) {
      throw new Error(`No route matches name "${routeName}"`);
    }
    return route.pathFor(params);
  }

  /**
   * Generate a full URL for a named route.
   */
  urlFor(
    routeName: string,
    params: Record<string, string | number> = {},
    options: { host?: string; onlyPath?: boolean } = {}
  ): string {
    const path = this.pathFor(routeName, params);
    if (options.onlyPath) return path;
    const host = options.host ?? this.defaultUrlOptions.host;
    if (!host) {
      throw new Error("Missing host to link to! Please provide the :host parameter or set default_url_options[:host]");
    }
    return `http://${host}${path}`;
  }

  /**
   * Set default URL options (like host) for urlFor.
   */
  setDefaultUrlOptions(options: { host?: string }): void {
    this.defaultUrlOptions = { ...this.defaultUrlOptions, ...options };
  }

  /**
   * Clear all routes (for redraw).
   */
  clear(): void {
    this.routes = [];
    this.namedRoutes.clear();
  }

  /**
   * Return all named routes as a map of name -> Route.
   */
  getNamedRoutes(): ReadonlyMap<string, Route> {
    return this.namedRoutes;
  }

  /**
   * Return all routes (for inspection / rake routes equivalent).
   */
  getRoutes(): readonly Route[] {
    return this.routes;
  }

  /**
   * Rack-compatible dispatch: match the request and call the dispatcher.
   */
  async call(env: RackEnv): Promise<RackResponse> {
    const method = (env["REQUEST_METHOD"] as string) || "GET";
    const path = (env["PATH_INFO"] as string) || "/";

    const matched = this.recognize(method, path);
    if (!matched) {
      return [
        404,
        { "content-type": "text/plain" },
        bodyFromString(`No route matches [${method}] "${path}"`),
      ];
    }

    const { route, params } = matched;

    // Handle redirect routes
    if (route.isRedirect) {
      const host = (env["HTTP_HOST"] as string) ?? "www.example.com";
      const { url, status } = route.resolveRedirect(params, {
        method,
        path,
        host,
      });
      return [
        status,
        { location: url, "content-type": "text/html" },
        bodyFromString(`<html><body>You are being <a href="${url}">redirected</a>.</body></html>`),
      ];
    }

    // Merge route params into the env (like Rails does with request.params)
    env["action_dispatch.request.path_parameters"] = {
      controller: route.controller,
      action: route.action,
      ...params,
    };

    if (this.dispatcher) {
      return this.dispatcher(route.controller, route.action, params, env);
    }

    // Default: return a simple JSON response showing the match
    const body = JSON.stringify({
      controller: route.controller,
      action: route.action,
      params,
    });
    return [
      200,
      { "content-type": "application/json" },
      bodyFromString(body),
    ];
  }
}
