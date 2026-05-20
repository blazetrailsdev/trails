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
import {
  polymorphicUrl as polymorphicUrlFn,
  symbolToString,
  type PolymorphicArg,
  type PolymorphicHost,
  type PolymorphicMappingEntry,
  type PolymorphicOptions,
} from "./polymorphic-routes.js";
import {
  fullUrlFor as fullUrlForFn,
  routeFor as routeForFn,
  urlOptions as urlOptionsFn,
  _routesContext as routesContextFn,
  _withRoutes as withRoutesFn,
  type UrlForHost,
  type UrlForOptions,
  type UrlForRoutes,
} from "./url-for.js";
import { Endpoint } from "./endpoint.js";
import { X_CASCADE } from "../constants.js";
import { DispatcherRegistry, type DispatchHandler } from "./dispatcher.js";
import { RoutingError, UrlGenerationError } from "../../action-controller/metal/exceptions.js";

const ROUTE_NAME_RE = /^[_a-z]\w*$/i;

/** @internal Rails: `RouteSet::CustomUrlHelper` — captured `direct(...)` block. */
export class CustomUrlHelper implements PolymorphicMappingEntry {
  readonly name: string;
  readonly defaults: Record<string, unknown>;
  readonly block: (this: PolymorphicHost, ...args: unknown[]) => Record<string, unknown> | string;

  constructor(
    name: string,
    defaults: Record<string, unknown>,
    block: (this: PolymorphicHost, ...args: unknown[]) => Record<string, unknown> | string,
  ) {
    this.name = name;
    this.defaults = defaults;
    this.block = block;
  }

  call(t: PolymorphicHost, args: unknown[], onlyPath = false): string {
    // Rails: `options = args.extract_options!` — only strip a trailing
    // *plain* Hash. Model instances, Dates, class instances all stay in
    // the positional args. Work on a copy so the caller's array is
    // unchanged.
    const rest = args.slice();
    const last = rest[rest.length - 1];
    const isPlainHash =
      last != null &&
      typeof last === "object" &&
      !Array.isArray(last) &&
      (Object.getPrototypeOf(last) === Object.prototype || Object.getPrototypeOf(last) === null);
    const options = isPlainHash ? (rest.pop() as Record<string, unknown>) : {};
    const merged = { ...this.defaults, ...options };
    const result = this.block.apply(t, [...rest, merged]);
    const url =
      typeof result === "string"
        ? result
        : ((t as unknown as { fullUrlFor: (o: unknown) => string }).fullUrlFor?.(result) ??
          String(result));
    if (!onlyPath) return url;
    // Rails: strip scheme+host, keep from first single-slash on.
    const m = url.match(/(?<!\/)\/(?!\/)(.*)$/);
    return m ? "/" + m[1] : url;
  }
}

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
  /** Public for parity with Rails `RouteSet#default_url_options`. */
  defaultUrlOptions: Record<string, unknown> = {};
  private readonly _append: Array<(mapper: Mapper) => void> = [];
  private readonly _prepend: Array<(mapper: Mapper) => void> = [];
  private _finalized = false;
  /**
   * Helpers registered via {@link addUrlHelper}. Rails dispatches these
   * through NamedRouteCollection, which isn't ported yet.
   */
  readonly urlHelpers: Map<string, CustomUrlHelper> = new Map();
  /**
   * Registry consulted by `polymorphicUrl` / `polymorphicPath` before falling
   * back to the standard RESTful helper. In Rails this is populated by the
   * `direct(:name) { ... }` DSL on `Mapper`; the lookup/entry side lives in
   * `polymorphic-routes.ts`, but the `direct` registration DSL is not yet
   * ported, so this map is currently empty in practice. Mirrors
   * `RouteSet#polymorphic_mappings`.
   */
  readonly polymorphicMappings: Map<string, PolymorphicMappingEntry> = new Map();
  /**
   * @internal Rails-private `_routes`. Points at an adapter that exposes
   * {@link polymorphicMappings} so {@link polymorphicUrl} works, but whose
   * `urlFor` raises until trails' legacy `urlFor(routeName, params,
   * options)` is replaced by the Rails-shape `urlFor(options, routeName?)`
   * (PR b). Wiring `this` directly would route {@link fullUrlFor} into
   * the wrong-shape `urlFor` at runtime.
   */
  _routes: UrlForRoutes = {
    urlFor: () => {
      throw new Error(
        "RouteSet#urlFor needs the Rails-shape (options, routeName?) signature before fullUrlFor can be wired through _routes — see PR b.",
      );
    },
    polymorphicMappings: this.polymorphicMappings,
  };
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
    // Rails' `draw` calls `clear!` first; trails keeps it append-only for
    // back-compat until callers opt into the Rails semantics via
    // {@link clearBang} + {@link evalBlock} + {@link finalizeBang}.
    this.evalBlock(callback);
  }

  /** @internal Rails: `private def eval_block(block)`. */
  evalBlock(block: DrawCallback): void {
    const mapper = new Mapper();
    block(mapper);
    for (const route of mapper.routes) {
      this.addRoute(route, route.name);
    }
    this._journeyRouter = null;
  }

  /** Rails: `append(&block)`. */
  append(block: DrawCallback): void {
    this._append.push(block);
  }

  /** Rails: `prepend(&block)`. */
  prepend(block: DrawCallback): void {
    this._prepend.push(block);
  }

  /** Rails: `finalize!` — flush queued {@link append} blocks. */
  finalizeBang(): void {
    if (this._finalized) return;
    for (const blk of this._append) this.evalBlock(blk);
    this._finalized = true;
  }

  /** Rails: `clear!` — drop routes and replay {@link prepend} blocks. */
  clearBang(): void {
    this._finalized = false;
    this.routes = [];
    this.namedRoutes.clear();
    this.polymorphicMappings.clear();
    this.dispatcherRegistry.clear();
    this.urlHelpers.clear();
    this._journeyRouter = null;
    for (const blk of this._prepend) this.evalBlock(blk);
  }

  /** Rails: `eager_load!`. Forces the Journey router build. */
  eagerLoadBang(): void {
    void this.journeyRouter;
  }

  /** Rails: `empty?`. */
  isEmpty(): boolean {
    return this.routes.length === 0;
  }

  /**
   * Rails: `add_route(mapping, name)`. Trails' Mapper builds {@link Route}
   * instances directly, so the first argument here is a Route.
   */
  addRoute(route: Route, name?: string | null): Route {
    if (name && !ROUTE_NAME_RE.test(name)) {
      throw new Error(`Invalid route name: '${name}'`);
    }
    // Rails raises on duplicate names; trails' Mapper currently emits the
    // singular form for both `index` and `show` on `resources`, so we
    // tolerate the collision until Mapper catches up.
    this.routes.push(route);
    if (name) this.namedRoutes.set(name, route);
    this._journeyRouter = null;
    return route;
  }

  /** Rails: `add_polymorphic_mapping(klass, options, &block)`. */
  addPolymorphicMapping(
    klass: string | { name: string },
    options: Record<string, unknown>,
    block: (this: PolymorphicHost, ...args: unknown[]) => Record<string, unknown> | string,
  ): void {
    const key = typeof klass === "string" ? klass : klass.name;
    this.polymorphicMappings.set(key, new CustomUrlHelper(key, options, block));
  }

  /**
   * Rails: `add_url_helper(name, options, &block)`. Stored in
   * {@link urlHelpers} until NamedRouteCollection lands.
   */
  addUrlHelper(
    name: string,
    options: Record<string, unknown>,
    block: (this: PolymorphicHost, ...args: unknown[]) => Record<string, unknown> | string,
  ): void {
    this.urlHelpers.set(name, new CustomUrlHelper(name, options, block));
  }

  /** Rails: `extra_keys(options, recall = {})`. */
  extraKeys(options: Record<string, unknown>, recall: Record<string, unknown> = {}): string[] {
    return this.generateExtras(options, recall)[1];
  }

  /** @internal Rails: `private def generate(...)` — returns the path string. */
  generate(
    routeName: string | null | undefined,
    options: Record<string, unknown>,
    recall: Record<string, unknown> = {},
    _methodName?: string | null,
  ): string {
    const opts: Record<string, unknown> = { ...options };
    // Rails Generator#normalize_controller_action_id! pulls
    // controller/action/id from `recall` when missing from options (and
    // stops at the first key it can't supply). Approximate that here so
    // callers passing only a recall hash still resolve a route.
    for (const key of ["controller", "action", "id"] as const) {
      if (opts[key] == null && recall[key] != null) opts[key] = recall[key];
      else if (opts[key] == null) break;
    }
    let route: Route | undefined;
    if (routeName) route = this.namedRoutes.get(routeName);
    route ??= this.routes.find(
      (r) => r.controller === opts["controller"] && r.action === opts["action"],
    );
    if (!route) {
      throw new UrlGenerationError(`No route matches ${JSON.stringify(options)}`);
    }
    const captureParams: Record<string, unknown> = Object.create(null);
    for (const name of route.pathParamNames) {
      const v = opts[name];
      if (v != null) captureParams[name] = v;
    }
    return route.pathFor(captureParams as Record<string, string | number>);
  }

  /** Rails: `optimize_routes_generation?`. */
  isOptimizeRoutesGeneration(): boolean {
    return Object.keys(this.defaultUrlOptions).length === 0;
  }

  /** Rails: `find_script_name(options)`. */
  findScriptName(options: Record<string, unknown>): string {
    if (Object.hasOwn(options, "script_name")) {
      const v = options["script_name"];
      delete options["script_name"];
      if (typeof v === "string") return v;
    }
    return "";
  }

  urlOptions(): Record<string, unknown> {
    return urlOptionsFn.call(this as unknown as UrlForHost);
  }

  fullUrlFor(options?: UrlForOptions): string {
    return fullUrlForFn.call(this as unknown as UrlForHost, options);
  }

  routeFor(name: string, ...args: unknown[]): string {
    return routeForFn.call(this as unknown as UrlForHost, name, ...args);
  }

  polymorphicUrl(record: PolymorphicArg, options: PolymorphicOptions = {}): string {
    return polymorphicUrlFn.call(this as unknown as PolymorphicHost, record, options);
  }

  /** @internal Rails: `private def _with_routes(routes)`. Sync only. */
  _withRoutes<T>(
    routes: UrlForRoutes,
    block: () => Exclude<T, Promise<unknown>>,
  ): Exclude<T, Promise<unknown>> {
    return withRoutesFn.call(this as unknown as UrlForHost, routes, block) as Exclude<
      T,
      Promise<unknown>
    >;
  }

  /** @internal Rails: `private def _routes_context`. */
  _routesContext(): RouteSet {
    return routesContextFn.call(this as unknown as UrlForHost) as RouteSet;
  }

  /** Rails: `recognize_path_with_request(...)` — engine recursion deferred. */
  recognizePathWithRequest(
    req: { requestMethod?: string; method?: string },
    path: string,
    extras: Record<string, unknown> = {},
    options: { raiseOnMissing?: boolean } = {},
  ): Record<string, unknown> | undefined {
    const method = String(req.requestMethod ?? req.method ?? "GET").toUpperCase();
    const matched = this.recognize(method, path);
    if (matched) {
      return {
        ...matched.route.defaults,
        controller: matched.route.controller,
        action: matched.route.action,
        ...matched.params,
        ...extras,
      };
    }
    if (options.raiseOnMissing !== false) {
      throw new RoutingError(`No route matches ${JSON.stringify(path)}`);
    }
    return undefined;
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

  /** Mirrors Rails' `RouteSet#recognize_path` shape for `assert_recognizes`. */
  recognizePath(
    path: string,
    options: { method?: string | null; extras?: Record<string, unknown> } = {},
  ): Record<string, unknown> {
    const method = String(options.method ?? "GET").toUpperCase();
    const matched = this.recognize(method, path);
    if (!matched) {
      throw new RoutingError(`No route matches [${method}] ${JSON.stringify(path)}`);
    }
    // Mirrors Rails: recognize_path returns route defaults merged with the
    // matched captures (Journey hands defaults back as path_parameters).
    return {
      ...matched.route.defaults,
      controller: matched.route.controller,
      action: matched.route.action,
      ...matched.params,
      ...(options.extras ?? {}),
    };
  }

  /**
   * Inverse of `recognizePath`. Returns `[path, extraKeys]` where extraKeys
   * are option keys not consumed by the route. The caller-supplied
   * `defaults` hash and the route's own defaults suppress matching keys
   * from `extras` when the supplied value equals the default (Rails
   * threads `defaults` through `generate` as the recall hash).
   */
  generateExtras(
    options: Record<string, unknown>,
    defaults: Record<string, unknown> = {},
  ): [string, string[]] {
    // Rails: `route_key = options.delete :use_route` — when present, look
    // the route up by its named-route key, mirroring `RouteSet#generate`.
    // Rails route names are Symbols; we accept both strings and JS symbols
    // (symbols carry their name in `.description` via `symbolToString`).
    let route: Route | undefined;
    const useRoute = options["use_route"];
    if (typeof useRoute === "string" || typeof useRoute === "symbol") {
      delete options["use_route"];
      route = this.namedRoutes.get(
        typeof useRoute === "symbol" ? symbolToString(useRoute) : useRoute,
      );
    }
    const { controller, action } = options;
    route ??= this.routes.find((r) => r.controller === controller && r.action === action);
    if (!route) {
      throw new UrlGenerationError(`No route matches ${JSON.stringify(options)}`);
    }
    const captureNames = new Set<string>(route.pathParamNames);
    // Null-prototype map so a capture named `__proto__` becomes an own
    // property — Route#pathFor preserves the value when fed a null-proto
    // hash (route.test.ts:175-184); a plain object would silently hit the
    // inherited setter instead.
    const captureParams: Record<string, unknown> = Object.create(null);
    for (const name of captureNames) {
      const v = options[name];
      if (v != null) captureParams[name] = v;
    }
    const path = route.pathFor(captureParams as Record<string, string | number>);
    // Mirrors Rails' `generate_extras`: extras are the keys of `options`
    // not consumed by the route. Keys present in the route's `defaults`
    // (and the caller-supplied `defaults`/recall hash) are consumed too,
    // so callers can pass e.g. `format: "json"` without it surfacing as a
    // query-string extra when the route already pins it.
    const routeDefaults = route.defaults as Record<string, unknown>;
    const extras: string[] = [];
    for (const k of Object.keys(options)) {
      if (k === "controller" || k === "action" || captureNames.has(k)) continue;
      // Only suppress the key when the supplied value matches the default
      // — a caller passing `format: "html"` against a route defaulting
      // `format: "json"` still surfaces as an extra, since the generated
      // path can't represent the conflicting value.
      const v = options[k];
      if (Object.hasOwn(routeDefaults, k) && routeDefaults[k] === v) continue;
      if (Object.hasOwn(defaults, k) && defaults[k] === v) continue;
      extras.push(k);
    }
    return [path, extras];
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
    const rawHost = options.host ?? this.defaultUrlOptions["host"];
    const host = typeof rawHost === "string" ? rawHost : undefined;
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
   * Clear all routes (for redraw). Kept for back-compat; new callers should
   * use {@link clearBang}, which mirrors Rails `clear!` (also replays the
   * `@prepend` blocks).
   */
  clear(): void {
    this._finalized = false;
    this.routes = [];
    this.namedRoutes.clear();
    this.polymorphicMappings.clear();
    this.dispatcherRegistry.clear();
    this.urlHelpers.clear();
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

    // Handle redirect routes by dispatching through the Redirect endpoint
    // (PathRedirect / OptionRedirect / Redirect). Path captures are surfaced
    // to the endpoint via `path_parameters` on the env, matching how Rails'
    // routing layer hands captures to ActionDispatch::Routing::Redirect.
    const redirectEndpoint = route.redirectEndpoint;
    if (redirectEndpoint) {
      env["action_dispatch.request.path_parameters"] = {
        controller: route.controller,
        action: route.action,
        ...params,
      };
      const [status, headers, bodyArr] = redirectEndpoint.call(env);
      const lowerHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(headers)) lowerHeaders[k.toLowerCase()] = v;
      return [status, lowerHeaders, bodyFromString((bodyArr as string[]).join(""))];
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
