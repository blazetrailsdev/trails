/**
 * ActionDispatch::Routing::RouteSet
 *
 * The central route collection. Supports:
 * - draw() with the Mapper DSL
 * - recognize() to match a request
 * - pathFor() / urlFor() to generate URLs from named routes
 * - Rack-compatible call() for dispatching
 */

import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { bodyFromString } from "@blazetrails/rack";
import { Mapper } from "./mapper.js";
import type { MatchedRoute } from "./route.js";
import { Route } from "./route.js";
import {
  buildJourneyRouter,
  journeyRecognize as recognizeViaJourney,
  type JourneyMatch,
} from "./journey-bridge.js";
import type { Router as JourneyRouter, RackishResponse, RouterRequest } from "../journey/router.js";
import type { PolymorphicMappingEntry } from "./polymorphic-routes.js";
import { Endpoint } from "./endpoint.js";
import { X_CASCADE } from "../constants.js";
import { DispatcherRegistry, type DispatchHandler } from "./dispatcher.js";

export type DrawCallback = (mapper: Mapper) => void;

/** Legacy {@link RouteSet.setDispatcher} callback (kept for back-compat). */
export type DispatcherCallback = (
  controller: string,
  action: string,
  params: Record<string, string>,
  env: RackEnv,
) => Promise<RackResponse>;

/**
 * Port of `ActionDispatch::Routing::RouteSet::Dispatcher`. Attached as
 * each Journey route's `app`; on serve, reads `path_parameters[:controller]`
 * and dispatches via {@link DispatcherRegistry}. Rails resolves a
 * controller class through `req.controller_class`; trails has no
 * ActionController port yet, so the registry holds string-keyed handlers.
 */
export class Dispatcher extends Endpoint {
  private readonly _raiseOnNameError: boolean;
  // Optional, mirroring the Rails Dispatcher whose only ivar is
  // `@raise_on_name_error` — controller resolution flows through
  // `req.controller_class`. Trails has no AC port, so the general-purpose
  // resolver consults a {@link DispatcherRegistry}; subclasses that bind
  // a handler directly (e.g. {@link StaticDispatcher}) leave it undefined.
  private readonly _registry: DispatcherRegistry | undefined;

  constructor(raiseOnNameError: boolean, registry?: DispatcherRegistry) {
    super();
    this._raiseOnNameError = raiseOnNameError;
    this._registry = registry;
  }

  dispatcher(): boolean {
    return true;
  }

  serve(req: RouterRequest): RackishResponse {
    const params = req.pathParameters as Record<string, unknown>;
    const action = typeof params["action"] === "string" ? params["action"] : "";
    const handler = this._controller(req);
    if (!handler) {
      if (this._raiseOnNameError) {
        const name = typeof params["controller"] === "string" ? params["controller"] : "";
        throw new Error(`uninitialized constant ${name || "<missing>"}`);
      }
      return [404, { [X_CASCADE]: "pass" }, []] as unknown as RackishResponse;
    }
    return this._dispatch(handler, action, req);
  }

  /** @internal */
  protected _controller(req: RouterRequest): DispatchHandler | undefined {
    if (!this._registry) return undefined;
    const params = req.pathParameters as Record<string, unknown>;
    const controller = typeof params["controller"] === "string" ? params["controller"] : "";
    return this._registry.resolve(controller);
  }

  /** @internal */
  protected _dispatch(
    handler: DispatchHandler,
    action: string,
    req: RouterRequest,
  ): RackishResponse {
    return handler(action, req);
  }
}

/**
 * Port of `ActionDispatch::Routing::RouteSet::StaticDispatcher`. Binds a
 * handler at construction (Rails binds a controller class); `_controller`
 * ignores `path_parameters[:controller]`. `raise_on_name_error` is always
 * false (no class-resolution path to fail) — mapper.rb:297.
 */
export class StaticDispatcher extends Dispatcher {
  private readonly _handler: DispatchHandler;

  constructor(handler: DispatchHandler) {
    // raise_on_name_error always false (mapper.rb:297); no registry —
    // `_controller` returns the bound handler directly.
    super(false);
    this._handler = handler;
  }

  /** @internal */
  protected override _controller(_req: RouterRequest): DispatchHandler {
    return this._handler;
  }
}

export class RouteSet {
  private routes: Route[] = [];
  private namedRoutes: Map<string, Route> = new Map();
  private dispatcher: DispatcherCallback | undefined;
  private defaultUrlOptions: { host?: string } = {};
  /**
   * Registry consulted by `polymorphicUrl` / `polymorphicPath` before falling
   * back to the standard RESTful helper. Populated by `direct(:name) { ... }`
   * (not yet ported). Mirrors `RouteSet#polymorphic_mappings`.
   */
  readonly polymorphicMappings: Map<string, PolymorphicMappingEntry> = new Map();
  /** Controller name → handler registry consulted by {@link Dispatcher}. */
  readonly dispatcherRegistry: DispatcherRegistry = new DispatcherRegistry();
  /** @internal */
  private _journeyRouter: JourneyRouter | null = null;
  /** @internal */
  private readonly _routeDispatcher: Dispatcher = new Dispatcher(false, this.dispatcherRegistry);

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
    this._journeyRouter = null;
  }

  /**
   * Lazily-built `Journey::Router` mirroring the current route table.
   * Wave 7 wire-up seam — exercises Journey end-to-end while keeping
   * the legacy matcher as the default for `recognize()`.
   */
  get journeyRouter(): JourneyRouter {
    if (!this._journeyRouter) {
      this._journeyRouter = buildJourneyRouter(this.routes, { app: this._routeDispatcher });
    }
    return this._journeyRouter;
  }

  /** Route lookup via the Journey-backed router. */
  journeyRecognize(method: string, path: string): JourneyMatch | null {
    return recognizeViaJourney(this.journeyRouter, method, path);
  }

  /** Register a handler invoked by {@link serve} when `controller` matches. */
  registerController(controller: string, handler: DispatchHandler): void {
    this.dispatcherRegistry.register(controller, handler);
  }

  /** End-to-end `Router.serve` using registered handlers. */
  serve(req: RouterRequest): RackishResponse {
    return this.journeyRouter.serve(req);
  }

  /**
   * Set a dispatcher that handles matched routes.
   * Without one, call() returns a simple JSON response.
   */
  setDispatcher(dispatcher: DispatcherCallback): void {
    this.dispatcher = dispatcher;
  }

  /**
   * Recognize a request: find the first matching route. Delegates to the
   * Journey-backed router; the legacy `Route#match` engine remains in place
   * for direct test callers but is no longer used by RouteSet.
   */
  recognize(method: string, path: string): MatchedRoute | null {
    return recognizeViaJourney(this.journeyRouter, method, path);
  }

  /**
   * Generate a path for a named route.
   * Mirrors Rails' `posts_path(id: 1)`.
   */
  pathFor(routeName: string, params: Record<string, string | number> = {}): string {
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
    options: { host?: string; onlyPath?: boolean } = {},
  ): string {
    const path = this.pathFor(routeName, params);
    if (options.onlyPath) return path;
    const host = options.host ?? this.defaultUrlOptions.host;
    if (!host) {
      throw new Error(
        "Missing host to link to! Please provide the :host parameter or set default_url_options[:host]",
      );
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
    this.polymorphicMappings.clear();
    this.dispatcherRegistry.clear();
    this._journeyRouter = null;
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
    return [200, { "content-type": "application/json" }, bodyFromString(body)];
  }
}
