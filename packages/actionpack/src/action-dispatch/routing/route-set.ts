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
  polymorphicMapping as polymorphicMappingFn,
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
import { RoutesProxy, type ScriptNamer } from "./routes-proxy.js";
import { Request as AdRequest } from "../http/request.js";
import { Routes as JourneyRoutes } from "../journey/routes.js";
import type { Formatter as JourneyFormatter } from "../journey/formatter.js";

const ROUTE_NAME_RE = /^[_a-z]\w*$/i;

/** @internal Mirrors Ruby `Hash#==` for shallow string-keyed hashes. */
function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  // Check key presence *and* value equality — bare value compare would
  // accept `{a: undefined}` vs `{b: undefined}` as equal (both lookups
  // yield `undefined`), incorrectly reusing a stale defaultEnv cache.
  for (const k of ka) if (!Object.hasOwn(b, k) || a[k] !== b[k]) return false;
  return true;
}

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

/** Rails: `RouteSet::Config = Struct.new(:relative_url_root, :api_only, :default_scope)`. */
export interface RouteSetConfig {
  relativeUrlRoot: string | null;
  apiOnly: boolean;
  defaultScope: Record<string, unknown> | null;
}

/** @internal Rails: `RouteSet::DEFAULT_CONFIG`. */
export const DEFAULT_CONFIG: RouteSetConfig = {
  relativeUrlRoot: null,
  apiOnly: false,
  defaultScope: null,
};

/**
 * Rails: `RouteSet::MountedHelpers` — bare module that engines extend, so
 * apps can `include MountedHelpers` to access engine route helpers. In
 * trails it's a plain class; {@link RouteSet.defineMountedHelper} attaches
 * named getters to its prototype.
 */
export class MountedHelpers {}

/**
 * @internal Rails: anonymous Module returned by `generate_url_helpers`.
 * Wraps a {@link RoutesProxy} so the singleton-level `url_for` /
 * `polymorphic_url` / etc. calls in the Rails source map onto methods on
 * an exported class — making them visible to `api:compare`.
 */
export class UrlHelpersModule {
  /** @internal Rails: `@_proxy = proxy_class.new(routes)`. */
  private readonly _proxy: RoutesProxy;
  /** @internal Whether `path` helpers are mixed in. */
  readonly _supportsPath: boolean;

  constructor(routes: RouteSet, supportsPath: boolean) {
    this._supportsPath = supportsPath;
    // Rails' proxy_class does `include UrlFor`; `_routes` on the proxy
    // points at the RouteSet's own `_routes` adapter (the one whose
    // `urlFor` has the Rails-shape `(options, routeName?)` signature).
    // Passing the bare RouteSet here would route through its legacy
    // positional `urlFor(routeName, params, options)` and break at runtime.
    const target = routes._routes;
    // Rails' proxy_class includes UrlFor; its `url_options` therefore
    // returns `default_url_options.dup` — so the proxy reads the
    // RouteSet's current defaults (host/protocol/port). Mirror that by
    // reading `routes.defaultUrlOptions` *dynamically* (later
    // `setDefaultUrlOptions()` calls must flow through). The singleton
    // `url_options; {}; end` (route_set.rb:591) is separate — that's
    // the singleton on the *module*, not the proxy.
    const scope: UrlForHost = {
      _routes: target,
      get defaultUrlOptions(): Record<string, unknown> {
        return routes.defaultUrlOptions;
      },
      urlOptions: () => ({ ...routes.defaultUrlOptions }),
    };
    this._proxy = new RoutesProxy(target, scope, {});
    // `withRoutesHelpers` (abstract-controller/trailties/routes-helpers.ts)
    // copies helper methods onto a controller's prototype via `for...in`,
    // which only sees *own enumerable* properties. Class methods live on
    // the prototype and are non-enumerable, so re-publish each as a bound
    // own property here. The prototype methods remain (so `api:compare`
    // extracts them); the own copies make them mountable.
    for (const name of [
      "urlFor",
      "fullUrlFor",
      "routeFor",
      "polymorphicUrl",
      "polymorphicPath",
      "polymorphicUrlForAction",
      "polymorphicPathForAction",
      "polymorphicMapping",
      "urlOptions",
    ] as const) {
      Object.defineProperty(this, name, {
        value: (this[name] as (...a: unknown[]) => unknown).bind(this),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
  }

  /** Rails singleton: `def url_for(options)`. */
  urlFor(options: UrlForOptions): string {
    return this._proxy.urlFor(options);
  }
  /** Rails singleton: `def full_url_for(options)`. */
  fullUrlFor(options: UrlForOptions): string {
    return this._proxy.fullUrlFor(options);
  }
  /** Rails singleton: `def route_for(name, *args)`. */
  routeFor(name: string, ...args: unknown[]): string {
    return this._proxy.routeFor(name, ...args);
  }
  /** Rails singleton: `def polymorphic_url(record_or_hash_or_array, options = {})`. */
  polymorphicUrl(record: PolymorphicArg, options: PolymorphicOptions = {}): string {
    return polymorphicUrlFn.call(this._proxy as unknown as PolymorphicHost, record, options);
  }
  /** Rails singleton: `def polymorphic_path(record_or_hash_or_array, options = {})`. */
  polymorphicPath(record: PolymorphicArg, options: PolymorphicOptions = {}): string {
    return polymorphicUrlFn.call(this._proxy as unknown as PolymorphicHost, record, {
      ...options,
      onlyPath: true,
    });
  }
  /** @internal Rails-private polymorphic helper exposed through the proxy. */
  polymorphicUrlForAction(
    record: PolymorphicArg,
    action: string,
    options: PolymorphicOptions = {},
  ): string {
    return this.polymorphicUrl(record, { ...options, action });
  }
  /** @internal Rails-private polymorphic helper exposed through the proxy. */
  polymorphicPathForAction(
    record: PolymorphicArg,
    action: string,
    options: PolymorphicOptions = {},
  ): string {
    return this.polymorphicPath(record, { ...options, action });
  }
  /**
   * @internal Rails-private polymorphic helper — delegates to the shared
   * `polymorphic-routes.ts` lookup so semantics stay aligned with the
   * `toModel()` / `modelName` resolution used by `polymorphicUrl` itself.
   */
  polymorphicMapping(record: unknown): PolymorphicMappingEntry | undefined {
    return polymorphicMappingFn(this._proxy as unknown as PolymorphicHost, record);
  }
  get _routes(): UrlForRoutes {
    return this._proxy._routes;
  }
  /** Rails singleton: `def url_options; {}; end`. */
  urlOptions(): Record<string, unknown> {
    return {};
  }
}

export class RouteSet {
  private routes: Route[] = [];
  private namedRoutes: Map<string, Route> = new Map();
  private dispatcher: DispatcherCallback | undefined;
  /** @internal Rails: `@config`. */
  private _config: RouteSetConfig;
  /** Rails: `attr_accessor :disable_clear_and_finalize`. */
  disableClearAndFinalize = false;
  /** Rails: `attr_accessor :resources_path_names`. */
  resourcesPathNames: Record<string, string> = { new: "new", edit: "edit" };
  /** Rails: `attr_accessor :draw_paths`. */
  drawPaths: string[] = [];
  /** Rails: `attr_reader :env_key`. Unique per RouteSet (Rails uses object_id). */
  readonly envKey: string = `ROUTES_${(RouteSet._envSeq = (RouteSet._envSeq ?? 0) + 1)}_SCRIPT_NAME`;
  private static _envSeq?: number;
  /**
   * Rails: `attr_accessor :set` — `Journey::Routes` container. Holds the
   * Journey-level route table; the higher-level routing Route objects
   * (`this.routes`) are bridged into it by Mapper. `clearBang` drops
   * both. Rails: `@set = Journey::Routes.new` (route_set.rb:402).
   */
  set: JourneyRoutes = new JourneyRoutes();
  /**
   * Rails: `attr_accessor :formatter` — `Journey::Formatter.new(self)`
   * (route_set.rb:404). Owns the generation-path cache. Wiring a real
   * {@link JourneyFormatter} requires bridging the higher-level routing
   * `Route` into `Journey::Route` (NamedRoutes-shape FormatterHost expects
   * the Journey type). That bridge is PR-c work; until then this exposes
   * just the `clear()` / `eagerLoadBang()` hooks the rest of RouteSet
   * actually invokes, satisfying the attr_accessor surface.
   */
  formatter: Pick<JourneyFormatter, "clear" | "eagerLoadBang"> = {
    clear() {},
    eagerLoadBang() {},
  };
  /** @internal Rails: `@url_helpers_with_paths`. */
  private _urlHelpersWithPaths?: UrlHelpersModule;
  /** @internal Rails: `@url_helpers_without_paths`. */
  private _urlHelpersWithoutPaths?: UrlHelpersModule;
  /** Public for parity with Rails `RouteSet#default_url_options`. */
  defaultUrlOptions: Record<string, unknown> = {};
  private readonly _append: Array<(mapper: Mapper) => void> = [];
  private readonly _prepend: Array<(mapper: Mapper) => void> = [];
  private _finalized = false;
  /**
   * @internal Helpers registered via {@link addUrlHelper}. Rails dispatches
   * these through NamedRouteCollection, which isn't ported yet. Renamed
   * from `urlHelpers` so the Rails-shape `urlHelpers(supportsPath)` method
   * can take that name.
   */
  readonly _customUrlHelpers: Map<string, CustomUrlHelper> = new Map();
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

  constructor(config: RouteSetConfig = { ...DEFAULT_CONFIG }) {
    // Rails: `def initialize(config = DEFAULT_CONFIG.dup)` — DEFAULT_CONFIG
    // is dup'd at the call site. Clone here too so a caller passing
    // `DEFAULT_CONFIG` (or any shared config struct) can't have later
    // `defaultScope=` mutations leak across instances.
    this._config = { ...config };
  }

  /** Rails: `def self.default_resources_path_names`. */
  static defaultResourcesPathNames(): Record<string, string> {
    return { new: "new", edit: "edit" };
  }

  /**
   * Rails: `def self.new_with_config(config)` — duplicates `DEFAULT_CONFIG`
   * then copies over `relative_url_root` / `api_only` / `default_scope` from
   * any source object that responds to them. Engines may omit
   * `relativeUrlRoot`, so we only copy keys that are present.
   */
  static newWithConfig(config: Partial<RouteSetConfig>): RouteSet {
    const merged: RouteSetConfig = { ...DEFAULT_CONFIG };
    if ("relativeUrlRoot" in config) merged.relativeUrlRoot = config.relativeUrlRoot ?? null;
    if ("apiOnly" in config) merged.apiOnly = config.apiOnly ?? false;
    if ("defaultScope" in config) merged.defaultScope = config.defaultScope ?? null;
    return new RouteSet(merged);
  }

  /** Rails: `attr_accessor :router`. Trails uses {@link journeyRouter} as the underlying lazy router. */
  get router(): JourneyRouter {
    return this.journeyRouter;
  }
  set router(value: JourneyRouter) {
    this._journeyRouter = value;
  }

  /** Rails: `def relative_url_root`. */
  get relativeUrlRoot(): string | null {
    return this._config.relativeUrlRoot;
  }
  /** Rails: `def api_only?`. */
  isApiOnly(): boolean {
    return this._config.apiOnly;
  }
  /** Rails: `def default_scope`. */
  get defaultScope(): Record<string, unknown> | null {
    return this._config.defaultScope;
  }
  /** Rails: `def default_scope=(new_default_scope)`. */
  set defaultScope(value: Record<string, unknown> | null) {
    this._config.defaultScope = value;
  }

  /** Rails: `def request_class` — returns `ActionDispatch::Request`. */
  requestClass(): typeof AdRequest {
    return AdRequest;
  }

  /** @internal Rails: `private def make_request(env)`. */
  makeRequest(env: RackEnv): AdRequest {
    return new (this.requestClass())(env);
  }

  /**
   * Rails: `def default_env` — synthesizes a Rack env from
   * {@link defaultUrlOptions} (host, port, scheme, script_name). Cached
   * until `defaultUrlOptions` changes. The Rails implementation routes
   * through `ActionDispatch::Http::URL.full_url_for` to validate options;
   * trails does the assembly inline pending the URL port.
   */
  defaultEnv(): RackEnv {
    // Rails caches by *value comparison* against the previously-stored
    // options snapshot: `if default_url_options != @default_env&.[](...)`.
    const cachedOpts = this._defaultEnv?.["action_dispatch.routes.default_url_options"] as
      | Record<string, unknown>
      | undefined;
    if (this._defaultEnv && cachedOpts && shallowEqual(cachedOpts, this.defaultUrlOptions)) {
      return this._defaultEnv;
    }
    const urlOptions = Object.freeze({ ...this.defaultUrlOptions });
    const host = typeof urlOptions["host"] === "string" ? urlOptions["host"] : "example.org";
    const protocol = typeof urlOptions["protocol"] === "string" ? urlOptions["protocol"] : "http";
    const scheme = protocol.replace(/:?\/*$/, "");
    const port = typeof urlOptions["port"] === "number" ? urlOptions["port"] : undefined;
    const defaultPort = scheme === "https" ? 443 : 80;
    const httpHost = port == null || port === defaultPort ? host : `${host}:${port}`;
    const scriptName =
      typeof urlOptions["script_name"] === "string" ? urlOptions["script_name"] : "";
    this._defaultEnv = Object.freeze({
      "action_dispatch.routes": this,
      "action_dispatch.routes.default_url_options": urlOptions,
      HTTPS: scheme === "https" ? "on" : "off",
      "rack.url_scheme": scheme,
      HTTP_HOST: httpHost,
      SCRIPT_NAME: scriptName.replace(/\/$/, ""),
      "rack.input": "",
    });
    return this._defaultEnv;
  }

  /**
   * Rails: `def from_requirements(requirements)` — lookup intended for
   * Language Server tooling. Matches the first route whose `defaults`
   * (Trails's analog of Rails's `route.requirements`) is shallow-equal
   * to the supplied hash — same shape Rails compares via `Hash#==`.
   */
  fromRequirements(requirements: Record<string, unknown>): Route | undefined {
    // Rails: `routes.find { |route| route.requirements == requirements }`.
    // Trails Route stores requirements as `defaults` (merged controller +
    // action + path constraints); the field name diverges but the semantic
    // is the same — the matching shape for `{ controller, action }` lookups.
    return this.routes.find((r) =>
      shallowEqual(r.defaults, requirements as Record<string, string>),
    );
  }

  /** Rails: `def url_helpers(supports_path = true)` — memoized per `supportsPath`. */
  urlHelpers(supportsPath = true): UrlHelpersModule {
    if (supportsPath) {
      return (this._urlHelpersWithPaths ??= this.generateUrlHelpers(true));
    }
    return (this._urlHelpersWithoutPaths ??= this.generateUrlHelpers(false));
  }

  /**
   * Rails: `def generate_url_helpers(supports_path)` — builds the anonymous
   * Module whose singleton dispatches `url_for` / `full_url_for` / etc.
   * through a `_proxy` over `_routes`. Trails returns an
   * {@link UrlHelpersModule} instance.
   */
  generateUrlHelpers(supportsPath: boolean): UrlHelpersModule {
    return new UrlHelpersModule(this, supportsPath);
  }

  /** Rails: `def mounted_helpers` — module engines extend. */
  mountedHelpers(): typeof MountedHelpers {
    return MountedHelpers;
  }

  /**
   * Rails: `def define_mounted_helper(name, script_namer = nil)` — defines
   * `name` and `_#{name}` methods on {@link MountedHelpers} that lazily
   * build a {@link RoutesProxy} into this RouteSet.
   */
  defineMountedHelper(name: string, scriptNamer: ScriptNamer | null = null): void {
    const proto = MountedHelpers.prototype as Record<string, unknown>;
    // Rails: `return if MountedHelpers.method_defined?(name)` — Rails
    // mutates the shared MountedHelpers module (one per app); the early
    // return is intentional, callers must clear the module to redefine.
    if (Object.hasOwn(proto, name)) return;
    const cacheKey = `_${name}` as const;
    const buildProxy = (ctx: Record<string, unknown>): RoutesProxy => {
      const scope =
        (ctx as unknown as UrlForHost & { _routesContext?: () => UrlForHost })._routesContext?.() ??
        (ctx as unknown as UrlForHost);
      // Resolve `helpers` *lazily* so `clearBang()` (which drops the
      // memoized url-helpers module) doesn't leave mounted proxies bound
      // to a stale helpers reference. Pass the `_routes` adapter, not
      // the RouteSet itself — RoutesProxy dispatches `urlFor` against
      // the Rails-shape signature exposed by the adapter.
      return new RoutesProxy(
        this._routes,
        scope,
        this.urlHelpers() as unknown as Record<string, unknown>,
        scriptNamer,
      );
    };
    proto[cacheKey] = function (this: Record<string, unknown>): RoutesProxy {
      return buildProxy(this);
    };
    Object.defineProperty(proto, name, {
      configurable: true,
      get(this: Record<string, unknown>): RoutesProxy {
        const memo = `@_${name}` as const;
        const existing = this[memo] as RoutesProxy | undefined;
        if (existing) return existing;
        const built = (this[cacheKey] as () => RoutesProxy).call(this);
        this[memo] = built;
        return built;
      },
    });
  }

  /** @internal Cached {@link defaultEnv} value. */
  private _defaultEnv?: Readonly<RackEnv>;

  /**
   * Draw routes using the Mapper DSL. Rails' `draw` clears + finalizes
   * around `eval_block` unless `disableClearAndFinalize` is set; trails
   * adopts that gating only when {@link prepend}/{@link append} blocks
   * are registered, otherwise it stays append-only (legacy back-compat).
   * Callers wanting strict Rails semantics in every case should use
   * {@link clearBang} + {@link evalBlock} + {@link finalizeBang} directly.
   */
  draw(callback: DrawCallback): void {
    // Rails: `clear! unless @disable_clear_and_finalize; eval_block(block); finalize! unless @disable_clear_and_finalize`.
    // Trails has historically kept `draw` append-only for back-compat; we
    // only adopt the Rails clear+finalize semantics when the caller has
    // *not* set `disableClearAndFinalize` AND has registered at least one
    // `prepend`/`append` block (otherwise old call sites that rely on
    // append-only would silently lose routes). The flag controls the
    // clear/finalize gate exactly as in Rails when those blocks are wired.
    const railsSemantics = this._prepend.length > 0 || this._append.length > 0;
    if (railsSemantics && !this.disableClearAndFinalize) this.clearBang();
    this.evalBlock(callback);
    if (railsSemantics && !this.disableClearAndFinalize) this.finalizeBang();
  }

  /** @internal Rails: `private def eval_block(block)`. */
  evalBlock(block: DrawCallback): void {
    const mapper = new Mapper(this);
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

  /**
   * Rails: `def clear!` (route_set.rb:490):
   * `@finalized = false; named_routes.clear; set.clear; formatter.clear;
   *  @polymorphic_mappings.clear; @prepend.each { |blk| eval_block(blk) }`.
   * Trails additionally resets the memoized url_helpers and default_env
   * (Rails relies on `@url_helpers_with_paths` etc. being reset via fresh
   * Module construction in `generate_url_helpers`; clearing them here is
   * the equivalent invalidation step).
   */
  clearBang(): void {
    this._finalized = false;
    this.routes = [];
    this.namedRoutes.clear();
    this.set.clear();
    this.formatter.clear();
    this.polymorphicMappings.clear();
    this.dispatcherRegistry.clear();
    this._customUrlHelpers.clear();
    this._urlHelpersWithPaths = undefined;
    this._urlHelpersWithoutPaths = undefined;
    this._defaultEnv = undefined;
    this._journeyRouter = null;
    for (const blk of this._prepend) this.evalBlock(blk);
  }

  /**
   * Rails: `def eager_load!` — `router.eager_load!; routes.each(&:eager_load!); formatter.eager_load!; nil`.
   * Trails warms the router and the formatter; the per-route warmup is
   * skipped because the higher-level `routing::Route` has no Journey
   * Path/AST cache to populate (Rails warms `route.path.ast` via
   * `Journey::Route#eager_load!`, which is a no-op for trails Routes
   * until the routing→Journey bridge lands in PR-c).
   */
  eagerLoadBang(): void {
    const router = this.journeyRouter as JourneyRouter & { eagerLoadBang?(): void };
    router.eagerLoadBang?.();
    this.formatter.eagerLoadBang();
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
   * Rails: `NamedRouteCollection#add_url_helper(name, defaults, &block)`.
   * Stored in {@link _customUrlHelpers} (a private map) until
   * NamedRouteCollection lands; once ported, these will be folded into
   * the generated url-helpers module so `${name}Path` / `${name}Url`
   * become callable on `urlHelpers()`.
   */
  addUrlHelper(
    name: string,
    options: Record<string, unknown>,
    block: (this: PolymorphicHost, ...args: unknown[]) => Record<string, unknown> | string,
  ): void {
    this._customUrlHelpers.set(name, new CustomUrlHelper(name, options, block));
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
    this.set.clear();
    this.formatter.clear();
    this.polymorphicMappings.clear();
    this.dispatcherRegistry.clear();
    this._customUrlHelpers.clear();
    this._urlHelpersWithPaths = undefined;
    this._urlHelpersWithoutPaths = undefined;
    this._defaultEnv = undefined;
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
