import { isPlainObject, isPresent, symbolizeKeys, toParam } from "@blazetrails/activesupport";
import { MockRequest, type RackEnv, type RackResponse } from "@blazetrails/rack";
import {
  extend,
  InvalidURIError,
  Module,
  rbInspect,
  RFC2396_PARSER,
} from "@blazetrails/ruby-compat";
import { Mapper } from "./mapper.js";
import type { MatchedRoute } from "./route.js";
import { Route } from "./route.js";
import {
  buildJourneyRouter,
  journeyRecognize as recognizeViaJourney,
  type JourneyMatch,
} from "./journey-bridge.js";
import type {
  Router as JourneyRouter,
  RackishResponse,
  RoutableApp,
  RouterRequest,
} from "../journey/router.js";
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
import type { DispatchableControllerClass } from "./dispatcher.js";
import type { Response as AdResponse } from "../http/response.js";
import { RoutingError, UrlGenerationError } from "../../action-controller/metal/exceptions.js";
import { RoutesProxy, type ScriptNamer } from "./routes-proxy.js";
import { Request as AdRequest } from "../http/request.js";
import { camelize, NameError } from "@blazetrails/activesupport";
import { ArgumentError } from "@blazetrails/activemodel";
import { normalizePath } from "../journey/router/utils.js";
import { URL, type UrlOptions } from "../http/url.js";
import { Routes as JourneyRoutes } from "../journey/routes.js";
import type { Formatter as JourneyFormatter, RouteWithParams } from "../journey/formatter.js";

const ROUTE_NAME_RE = /^[_a-z]\w*$/i;

/** @internal */
function toS(v: unknown): string {
  return v == null ? "" : String(v);
}

function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) if (!Object.hasOwn(b, k) || a[k] !== b[k]) return false;
  return true;
}

/** @internal */
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
    const m = url.match(/(?<!\/)\/(?!\/)(.*)$/);
    return m ? "/" + m[1] : url;
  }
}

export type DrawCallback = (mapper: Mapper) => void;

export class Dispatcher extends Endpoint {
  private readonly _raiseOnNameError: boolean;

  constructor(raiseOnNameError: boolean) {
    super();
    this._raiseOnNameError = raiseOnNameError;
  }

  dispatcher(): boolean {
    return true;
  }

  async serve(req: RouterRequest): Promise<RackishResponse> {
    try {
      const params = req.pathParameters;
      const controller = this._controller(req);
      const res = controller.makeResponseBang(req as unknown as AdRequest);
      return await this._dispatch(controller, params["action"] as string, req, res);
    } catch (error) {
      if (error instanceof RoutingError) {
        if (this._raiseOnNameError) throw error;
        return [404, { [X_CASCADE]: "pass" }, []] as unknown as RackishResponse;
      }
      throw error;
    }
  }

  /** @internal */
  protected _controller(req: RouterRequest): DispatchableControllerClass {
    try {
      return (req as unknown as AdRequest).controllerClass() as DispatchableControllerClass;
    } catch (e) {
      if (e instanceof NameError) throw new RoutingError(e.message);
      throw e;
    }
  }

  /** @internal */
  protected async _dispatch(
    controller: DispatchableControllerClass,
    action: string,
    req: RouterRequest,
    res: AdResponse,
  ): Promise<RackishResponse> {
    return (await controller.dispatch(
      action,
      req as unknown as AdRequest,
      res,
    )) as unknown as RackishResponse;
  }
}

export class StaticDispatcher extends Dispatcher {
  private readonly _controllerClass: DispatchableControllerClass;

  constructor(controllerClass: DispatchableControllerClass) {
    super(false);
    this._controllerClass = controllerClass;
  }

  /** @internal */
  protected override _controller(_req: RouterRequest): DispatchableControllerClass {
    return this._controllerClass;
  }
}

export interface RouteSetConfig {
  relativeUrlRoot: string | null;
  apiOnly: boolean;
  defaultScope: Record<string, unknown> | null;
}

/** @internal */
export const DEFAULT_CONFIG: RouteSetConfig = {
  relativeUrlRoot: null,
  apiOnly: false,
  defaultScope: null,
};

export class MountedHelpers {}

/** @internal */
class UrlHelper {
  static create(route: Route, options: Record<string, unknown>, routeName: string): UrlHelper {
    if (this.isOptimizeHelper(route)) {
      return new OptimizedUrlHelper(route, options, routeName);
    } else {
      return new this(route, options, routeName);
    }
  }

  static isOptimizeHelper(route: Route): boolean {
    return Object.keys(route.pathConstraints).length === 0 && !route.isGlob();
  }

  readonly routeName: string;
  /** @internal */
  protected readonly options: Record<string, unknown>;
  /** @internal */
  private readonly segmentKeys: readonly string[];
  /** @internal */
  protected readonly route: Route;

  constructor(route: Route, options: Record<string, unknown>, routeName: string) {
    this.options = options;
    this.segmentKeys = [...new Set(route.pathParamNames)];
    this.route = route;
    this.routeName = routeName;
  }

  call(
    t: UrlHelperContext,
    methodName: string,
    args: unknown[],
    innerOptions: Record<string, unknown> | undefined,
    urlStrategy: UrlStrategy,
  ): string {
    const controllerOptions = t.urlOptions?.() ?? {};
    const options: Record<string, unknown> = { ...controllerOptions, ...this.options };
    const hash = this.handlePositionalArgs(controllerOptions, innerOptions ?? {}, args, options, [
      ...this.segmentKeys,
    ]);
    return t._routes.urlFor(hash, this.routeName, urlStrategy, methodName);
  }

  handlePositionalArgs(
    controllerOptions: Record<string, unknown>,
    innerOptions: Record<string, unknown>,
    args: unknown[],
    result: Record<string, unknown>,
    pathParams: string[],
  ): Record<string, unknown> {
    if (args.length > 0) {
      const pathParamsSize = pathParams.includes("format")
        ? pathParams.length - 1
        : pathParams.length;

      if (args.length < pathParamsSize) {
        const supplied = {
          ...((result["path_params"] as Record<string, unknown> | undefined) ?? {}),
          ...result,
        };
        pathParams = pathParams.filter(
          (k) => !Object.hasOwn(controllerOptions, k) && !Object.hasOwn(supplied, k),
        );
      }
      for (const key of Object.keys(innerOptions)) {
        const at = pathParams.indexOf(key);
        if (at !== -1) pathParams.splice(at, 1);
      }

      args.forEach((arg, index) => {
        const param = pathParams[index];
        if (param) result[param] = arg;
      });
    }

    return Object.assign(result, innerOptions);
  }
}

/** @internal */
class OptimizedUrlHelper extends UrlHelper {
  readonly argSize: number;
  /** @internal */
  private readonly requiredParts: readonly string[];

  constructor(route: Route, options: Record<string, unknown>, routeName: string) {
    super(route, options, routeName);
    this.requiredParts = this.route.requiredParts;
    this.argSize = this.requiredParts.length;
  }

  override call(
    t: UrlHelperContext,
    methodName: string,
    args: unknown[],
    innerOptions: Record<string, unknown> | undefined,
    urlStrategy: UrlStrategy,
  ): string {
    if (args.length === this.argSize && !innerOptions && this.optimizeRoutesGeneration(t)) {
      const options: Record<string, unknown> = { ...(t.urlOptions?.() ?? {}), ...this.options };
      let path = this.optimizedHelper(args);
      const trailingSlash = options["trailingSlash"];
      if (trailingSlash != null && trailingSlash !== false && !path.endsWith("/")) path += "/";
      options["path"] = path;

      const originalScriptName = options["originalScriptName"] as string | null | undefined;
      delete options["originalScriptName"];
      let scriptName = t._routes.findScriptName(options);

      if (originalScriptName != null && (originalScriptName as unknown) !== false) {
        scriptName = originalScriptName + scriptName;
      }

      options["scriptName"] = scriptName;

      return urlStrategy(options as UrlOptions);
    } else {
      return super.call(t, methodName, args, innerOptions, urlStrategy);
    }
  }

  /** @internal */
  private optimizedHelper(args: unknown[]): string {
    const params = this.parameterizeArgs(args, () => {
      this.raiseGenerationError(args);
    });

    return this.route.format(params);
  }

  /** @internal */
  private optimizeRoutesGeneration(t: UrlHelperContext): boolean {
    return t.optimizeRoutesGeneration();
  }

  /** @internal */
  private parameterizeArgs(args: unknown[], block: (key: string) => void): Record<string, unknown> {
    const params: Record<string, unknown> = {};
    for (let i = 0; i < this.argSize; i++) {
      const key = this.requiredParts[i];
      const value = toParam(args[i]);
      if (value == null || value === "") block(key);
      params[key] = value;
    }
    return params;
  }

  /** @internal */
  private raiseGenerationError(args: unknown[]): never {
    const missingKeys: string[] = [];
    const params = this.parameterizeArgs(args, (missingKey) => {
      missingKeys.push(missingKey);
    });
    const merged: Record<string, unknown> = { ...this.route.requirements, ...params };
    const constraints = Object.fromEntries(
      Object.entries(merged).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    );
    let message = `No route matches ${rbInspect(symbolizeKeys(constraints))}`;
    message += `, missing required keys: ${rbInspect(missingKeys.sort().map((k) => `:${k}`))}`;

    throw new UrlGenerationError(message);
  }
}

type UrlStrategy = (options: UrlOptions) => string;

const PATH: UrlStrategy = (options) => URL.pathFor(options);

const UNKNOWN: UrlStrategy = (options) => URL.urlFor(options);

export const RESERVED_OPTIONS: readonly string[] = [
  "host",
  "protocol",
  "port",
  "subdomain",
  "domain",
  "tldLength",
  "trailingSlash",
  "anchor",
  "params",
  "onlyPath",
  "scriptName",
  "originalScriptName",
];

export interface UrlHelperContext {
  _routes: RouteSet;
  urlOptions?(): Record<string, unknown>;
  optimizeRoutesGeneration(): boolean;
}

export type NamedRouteHelper = (this: UrlHelperContext, ...args: unknown[]) => string;

export class NamedRouteCollection {
  /** @internal */
  private readonly _routes: Map<string, Route> = new Map();
  readonly pathHelpersModule: Module = new Module();
  readonly urlHelpersModule: Module = new Module();
  /** @internal */
  private readonly pathHelpers: Set<string> = new Set();
  /** @internal */
  private readonly urlHelpers: Set<string> = new Set();

  /** @internal */
  get routes(): ReadonlyMap<string, Route> {
    return this._routes;
  }

  isRouteDefined(name: string): boolean {
    return this.pathHelpers.has(name) || this.urlHelpers.has(name);
  }

  helperNames(): string[] {
    return [...this.pathHelpers, ...this.urlHelpers];
  }

  clearBang(): void {
    for (const helper of this.pathHelpers) {
      this.pathHelpersModule.removeMethod(helper);
    }

    for (const helper of this.urlHelpers) {
      this.urlHelpersModule.removeMethod(helper);
    }

    this._routes.clear();
    this.pathHelpers.clear();
    this.urlHelpers.clear();
  }

  add(name: string, route: Route): void {
    const pathName = camelize(`${name}_path`, "lower");
    const urlName = camelize(`${name}_url`, "lower");

    if (this._routes.has(name)) {
      this.pathHelpersModule.undefMethod(pathName);
      this.urlHelpersModule.undefMethod(urlName);
    }
    this._routes.set(name, route);

    const helper = UrlHelper.create(route, route.defaults, name);
    this.defineUrlHelper(this.pathHelpersModule, pathName, helper, PATH);
    this.defineUrlHelper(this.urlHelpersModule, urlName, helper, UNKNOWN);

    this.pathHelpers.add(pathName);
    this.urlHelpers.add(urlName);
  }

  get(name: string): Route | undefined {
    return this._routes.get(name);
  }

  isKey(name: string | null | undefined): boolean {
    if (name == null) return false;
    return this._routes.has(name);
  }

  names(): string[] {
    return [...this._routes.keys()];
  }

  length(): number {
    return this._routes.size;
  }

  addUrlHelper(
    name: string,
    defaults: Record<string, unknown>,
    block: (this: PolymorphicHost, ...args: unknown[]) => Record<string, unknown> | string,
  ): this {
    const helper = new CustomUrlHelper(name, defaults, block);
    const pathName = camelize(`${name}_path`, "lower");
    const urlName = camelize(`${name}_url`, "lower");

    this.pathHelpersModule.moduleEval((mod) => {
      mod[pathName] = function (this: UrlHelperContext, ...args: unknown[]): string {
        return helper.call(this as unknown as PolymorphicHost, args, true);
      };
    });

    this.urlHelpersModule.moduleEval((mod) => {
      mod[urlName] = function (this: UrlHelperContext, ...args: unknown[]): string {
        return helper.call(this as unknown as PolymorphicHost, args, false);
      };
    });

    this.pathHelpers.add(pathName);
    this.urlHelpers.add(urlName);

    return this;
  }

  private defineUrlHelper(
    mod: Module,
    name: string,
    helper: UrlHelper,
    urlStrategy: UrlStrategy,
  ): void {
    mod.defineMethod(name, function (this: UrlHelperContext, ...args: unknown[]): string {
      const last = args[args.length - 1];
      const options =
        (last as object | null)?.constructor === Object
          ? (args.pop() as Record<string, unknown>)
          : undefined;
      return helper.call(this, name, args, options, urlStrategy);
    });
  }
}

export class UrlHelpersModule {
  /** @internal */
  private readonly _proxy: RoutesProxy;
  /** @internal */
  readonly _supportsPath: boolean;
  declare readonly _routes: RouteSet;

  constructor(routes: RouteSet, supportsPath: boolean) {
    this._supportsPath = supportsPath;
    Object.defineProperty(this, "_routes", {
      get: () => routes,
      enumerable: true,
      configurable: true,
    });
    const target = routes._routes;
    const scope: UrlForHost = {
      _routes: target,
      get defaultUrlOptions(): Record<string, unknown> {
        return routes.defaultUrlOptions;
      },
      urlOptions: () => ({ ...routes.defaultUrlOptions }),
    };
    this._proxy = new RoutesProxy(target, scope, {});
    const urlHelpers = routes.namedRoutes.urlHelpersModule;

    extend(this, urlHelpers);

    if (supportsPath) {
      const pathHelpers = routes.namedRoutes.pathHelpersModule;

      extend(this, pathHelpers);
    }

    for (const name of [
      "urlFor",
      "fullUrlFor",
      "routeFor",
      "optimizeRoutesGeneration",
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

  urlFor(options: UrlForOptions): string {
    return this._proxy.urlFor(options);
  }
  fullUrlFor(options: UrlForOptions): string {
    return this._proxy.fullUrlFor(options);
  }
  routeFor(name: string, ...args: unknown[]): string {
    return this._proxy.routeFor(name, ...args);
  }
  optimizeRoutesGeneration(): boolean {
    return this._proxy.optimizeRoutesGeneration();
  }
  polymorphicUrl(recordOrHashOrArray: PolymorphicArg, options: PolymorphicOptions = {}): string {
    return polymorphicUrlFn.call(
      this._proxy as unknown as PolymorphicHost,
      recordOrHashOrArray,
      options,
    );
  }
  polymorphicPath(recordOrHashOrArray: PolymorphicArg, options: PolymorphicOptions = {}): string {
    return polymorphicUrlFn.call(this._proxy as unknown as PolymorphicHost, recordOrHashOrArray, {
      ...options,
      onlyPath: true,
    });
  }
  /** @internal */
  polymorphicUrlForAction(
    action: string,
    recordOrHash: PolymorphicArg,
    options: PolymorphicOptions = {},
  ): string {
    return this.polymorphicUrl(recordOrHash, { ...options, action });
  }
  /** @internal */
  polymorphicPathForAction(
    action: string,
    recordOrHash: PolymorphicArg,
    options: PolymorphicOptions = {},
  ): string {
    return this.polymorphicPath(recordOrHash, { ...options, action });
  }
  /** @internal */
  polymorphicMapping(record: unknown): PolymorphicMappingEntry | undefined {
    return polymorphicMappingFn(this._proxy as unknown as PolymorphicHost, record);
  }
  urlOptions(): Record<string, unknown> {
    return {};
  }
}

export class RouteSet {
  private routes: Route[] = [];
  namedRoutes: NamedRouteCollection = new NamedRouteCollection();
  /** @internal */
  private _config: RouteSetConfig;
  disableClearAndFinalize = false;
  resourcesPathNames: Record<string, string> = { new: "new", edit: "edit" };
  drawPaths: string[] = [];
  readonly envKey: string = `ROUTES_${(RouteSet._envSeq = (RouteSet._envSeq ?? 0) + 1)}_SCRIPT_NAME`;
  private static _envSeq?: number;
  set: JourneyRoutes = new JourneyRoutes();
  formatter: Pick<JourneyFormatter, "clear" | "eagerLoadBang"> = {
    clear() {},
    eagerLoadBang() {},
  };
  /** @internal */
  private _urlHelpersWithPaths?: UrlHelpersModule;
  /** @internal */
  private _urlHelpersWithoutPaths?: UrlHelpersModule;
  defaultUrlOptions: Record<string, unknown> = {};
  private readonly _append: Array<(mapper: Mapper) => void> = [];
  private readonly _prepend: Array<(mapper: Mapper) => void> = [];
  private _finalized = false;
  readonly polymorphicMappings: Map<string, PolymorphicMappingEntry> = new Map();
  /** @internal */
  _routes: UrlForRoutes = this;
  /** @internal */
  private _journeyRouter: JourneyRouter | null = null;
  /** @internal */

  constructor(config: RouteSetConfig = { ...DEFAULT_CONFIG }) {
    this._config = { ...config };
  }

  static defaultResourcesPathNames(): Record<string, string> {
    return { new: "new", edit: "edit" };
  }

  static newWithConfig(
    this: new (config?: RouteSetConfig) => RouteSet,
    config: Partial<RouteSetConfig>,
  ): RouteSet {
    const merged: RouteSetConfig = { ...DEFAULT_CONFIG };
    if ("relativeUrlRoot" in config) merged.relativeUrlRoot = config.relativeUrlRoot ?? null;
    if ("apiOnly" in config) merged.apiOnly = config.apiOnly ?? false;
    if ("defaultScope" in config) merged.defaultScope = config.defaultScope ?? null;
    return new this(merged);
  }

  get router(): JourneyRouter {
    return this.journeyRouter;
  }
  set router(value: JourneyRouter) {
    this._journeyRouter = value;
  }

  get relativeUrlRoot(): string | null {
    return this._config.relativeUrlRoot;
  }
  isApiOnly(): boolean {
    return this._config.apiOnly;
  }
  get defaultScope(): Record<string, unknown> | null {
    return this._config.defaultScope;
  }
  set defaultScope(value: Record<string, unknown> | null) {
    this._config.defaultScope = value;
  }

  requestClass(): typeof AdRequest {
    return AdRequest;
  }

  /** @internal */
  makeRequest(env: RackEnv): AdRequest {
    return new (this.requestClass())(env);
  }

  defaultEnv(): RackEnv {
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

  fromRequirements(requirements: Record<string, unknown>): Route | undefined {
    return this.routes.find((r) =>
      shallowEqual(r.requirements, requirements as Record<string, string | RegExp>),
    );
  }

  urlHelpers(supportsPath = true): UrlHelpersModule {
    if (supportsPath) {
      return (this._urlHelpersWithPaths ??= this.generateUrlHelpers(true));
    }
    return (this._urlHelpersWithoutPaths ??= this.generateUrlHelpers(false));
  }

  generateUrlHelpers(supportsPath: boolean): UrlHelpersModule {
    return new UrlHelpersModule(this, supportsPath);
  }

  mountedHelpers(): typeof MountedHelpers {
    return MountedHelpers;
  }

  defineMountedHelper(name: string, scriptNamer: ScriptNamer | null = null): void {
    const proto = MountedHelpers.prototype as Record<string, unknown>;
    if (Object.hasOwn(proto, name)) return;
    const cacheKey = `_${name}` as const;
    const buildProxy = (ctx: Record<string, unknown>): RoutesProxy => {
      const scope =
        (ctx as unknown as UrlForHost & { _routesContext?: () => UrlForHost })._routesContext?.() ??
        (ctx as unknown as UrlForHost);
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

  /** @internal */
  private _defaultEnv?: Readonly<RackEnv>;

  draw(callback: DrawCallback): void {
    const railsSemantics = this._prepend.length > 0 || this._append.length > 0;
    if (railsSemantics && !this.disableClearAndFinalize) this.clearBang();
    this.evalBlock(callback);
    if (railsSemantics && !this.disableClearAndFinalize) this.finalizeBang();
  }

  /** @internal */
  evalBlock(block: DrawCallback): void {
    const mapper = new Mapper(this);
    block(mapper);
    this._journeyRouter = null;
  }

  append(block: DrawCallback): void {
    this._append.push(block);
  }

  prepend(block: DrawCallback): void {
    this._prepend.push(block);
  }

  finalizeBang(): void {
    if (this._finalized) return;
    for (const blk of this._append) this.evalBlock(blk);
    this._finalized = true;
  }

  clearBang(): void {
    this._finalized = false;
    this.routes = [];
    this.namedRoutes.clearBang();
    this.set.clear();
    this.formatter.clear();
    this.polymorphicMappings.clear();
    this._defaultEnv = undefined;
    this._journeyRouter = null;
    for (const blk of this._prepend) this.evalBlock(blk);
  }

  eagerLoadBang(): void {
    const router = this.journeyRouter as JourneyRouter & { eagerLoadBang?(): void };
    router.eagerLoadBang?.();
    this.formatter.eagerLoadBang();
  }

  isEmpty(): boolean {
    return this.routes.length === 0;
  }

  addRoute(
    mapping: { makeRoute(name: string | null | false | undefined, precedence: number): Route },
    name?: string | null | false,
  ): Route {
    if (name && !ROUTE_NAME_RE.test(name)) {
      throw new ArgumentError(`Invalid route name: '${name}'`);
    }

    if (name && this.namedRoutes.get(name)) {
      throw new ArgumentError(
        `Invalid route name, already in use: '${name}' \n` +
          "You may have defined two routes with the same name using the `:as` option, or " +
          "you may be overriding a route already defined by a resource with the same naming. " +
          "For the latter, you can restrict the routes created with `resources` as explained here: \n" +
          "https://guides.rubyonrails.org/routing.html#restricting-the-routes-created",
      );
    }
    const route = mapping.makeRoute(name, this.routes.length);
    this.routes.push(route);
    if (name) this.namedRoutes.add(name, route);
    this._journeyRouter = null;
    return route;
  }

  addPolymorphicMapping(
    klass: string | { name: string },
    options: Record<string, unknown>,
    block: (this: PolymorphicHost, ...args: unknown[]) => Record<string, unknown> | string,
  ): void {
    const key = typeof klass === "string" ? klass : klass.name;
    this.polymorphicMappings.set(key, new CustomUrlHelper(key, options, block));
  }

  extraKeys(options: Record<string, unknown>, recall: Record<string, unknown> = {}): string[] {
    return this.generateExtras(options, recall)[1];
  }

  /** @internal */
  generate(
    routeName: string | null | undefined,
    options: Record<string, unknown>,
    recall: Record<string, unknown> = {},
    _methodName?: string | null,
  ): Pick<RouteWithParams, "path" | "params"> {
    const opts: Record<string, unknown> = { ...options };
    if (opts["controller"] != null) opts["action"] ??= "index";
    for (const key of ["controller", "action", "id"] as const) {
      if (opts[key] == null && recall[key] != null) opts[key] = recall[key];
      else if (opts[key] == null) break;
    }
    let route: Route | undefined;
    if (routeName) route = this.namedRoutes.get(routeName);
    route ??= this.routes.find((r) => {
      const parts = new Set<string>(r.pathParamNames);
      if (!parts.has("controller") && r.controller !== opts["controller"]) return false;
      if (!parts.has("action") && r.action !== opts["action"]) return false;
      return true;
    });
    if (!route) {
      throw new UrlGenerationError(`No route matches ${JSON.stringify(options)}`);
    }
    const parameterizedParts = this.extractParameterizedParts(route, opts, recall);
    const params: Record<string, unknown> = { ...options };
    for (const key of Object.keys(params)) {
      if (Object.hasOwn(parameterizedParts, key) || Object.hasOwn(route.defaults, key)) {
        delete params[key];
      }
    }

    const defaults = route.defaults;
    const requiredParts = route.requiredParts;
    const parts = [...route.pathParamNames];

    for (let i = parts.length - 1; i >= 0; i--) {
      const key = parts[i];
      const partVal = parameterizedParts[key];
      if (defaults[key] == null && isPresent(partVal)) break;
      if (toS(partVal) !== toS(defaults[key])) continue;
      if (requiredParts.includes(key)) break;
      delete parameterizedParts[key];
    }

    const path = route.pathFor(parameterizedParts as Record<string, string | number>);
    return { path: () => path, params };
  }

  /** @internal */
  private extractParameterizedParts(
    route: Route,
    options: Record<string, unknown>,
    recall: Record<string, unknown>,
  ): Record<string, unknown> {
    const parameterizedParts: Record<string, unknown> = { ...recall, ...options };

    const parts = route.pathParamNames;
    let kept = parts.length;
    while (kept > 0) {
      const part = parts[kept - 1];
      if (
        (Object.hasOwn(options, part) || Object.hasOwn(route.scopeOptions, part)) &&
        (options[part] ?? recall[part]) != null
      )
        break;
      kept--;
    }
    const keysToKeep = new Set<string>([...parts.slice(0, kept), ...route.requiredParts]);

    for (const badKey of Object.keys(parameterizedParts)) {
      if (!keysToKeep.has(badKey)) delete parameterizedParts[badKey];
    }
    for (const k of Object.keys(parameterizedParts)) {
      if (parameterizedParts[k] == null) delete parameterizedParts[k];
    }
    return parameterizedParts;
  }

  isOptimizeRoutesGeneration(): boolean {
    return Object.keys(this.defaultUrlOptions).length === 0;
  }

  findScriptName(options: Record<string, unknown>): string {
    const scriptName = options["scriptName"];
    delete options["scriptName"];
    if (scriptName != null && scriptName !== false) return scriptName as string;
    return this.relativeUrlRoot ?? "";
  }

  pathFor(
    options: Record<string, unknown>,
    routeName: string | null = null,
    reserved: readonly string[] = RESERVED_OPTIONS,
  ): string {
    return this.urlFor(options, routeName, PATH, null, reserved);
  }

  urlFor(
    options: Record<string, unknown>,
    routeName: string | null = null,
    urlStrategy: UrlStrategy = UNKNOWN,
    methodName: string | null = null,
    reserved: readonly string[] = RESERVED_OPTIONS,
  ): string {
    options = { ...this.defaultUrlOptions, ...options };

    let user: unknown = null;
    let password: unknown = null;

    if (
      options["user"] != null &&
      options["user"] !== false &&
      options["password"] != null &&
      options["password"] !== false
    ) {
      user = options["user"];
      delete options["user"];
      password = options["password"];
      delete options["password"];
    }

    const recall = (Object.hasOwn(options, "_recall") ? options["_recall"] : {}) as Record<
      string,
      unknown
    >;
    delete options["_recall"];

    const originalScriptName = options["originalScriptName"] as string | null | undefined;
    delete options["originalScriptName"];
    let scriptName = this.findScriptName(options);

    if (originalScriptName != null && (originalScriptName as unknown) !== false) {
      scriptName = originalScriptName + scriptName;
    }

    const pathOptions = { ...options };
    for (const ro of reserved) delete pathOptions[ro];

    const routeWithParams = this.generate(routeName, pathOptions, recall);
    let path = routeWithParams.path(methodName ?? undefined);

    const trailingSlash = options["trailingSlash"];
    const format = options["format"];
    if (
      trailingSlash != null &&
      trailingSlash !== false &&
      (format == null || format === false) &&
      !path.endsWith("/")
    ) {
      path += "/";
    }

    const params = routeWithParams.params;

    if (Object.hasOwn(options, "params")) {
      const optParams = options["params"];
      if (isPlainObject(optParams)) {
        Object.assign(params, optParams);
      } else {
        params["params"] = optParams;
      }
    }

    options["path"] = path;
    options["scriptName"] = scriptName;
    options["params"] = params;
    options["user"] = user;
    options["password"] = password;

    return urlStrategy(options as UrlOptions);
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

  polymorphicUrl(recordOrHashOrArray: PolymorphicArg, options: PolymorphicOptions = {}): string {
    return polymorphicUrlFn.call(this as unknown as PolymorphicHost, recordOrHashOrArray, options);
  }

  /** @internal */
  _withRoutes<T>(
    routes: UrlForRoutes,
    block: () => Exclude<T, Promise<unknown>>,
  ): Exclude<T, Promise<unknown>> {
    return withRoutesFn.call(this as unknown as UrlForHost, routes, block) as Exclude<
      T,
      Promise<unknown>
    >;
  }

  /** @internal */
  _routesContext(): RouteSet {
    return routesContextFn.call(this as unknown as UrlForHost) as RouteSet;
  }

  recognizePathWithRequest(
    req: AdRequest,
    path: string,
    extras: Record<string, unknown>,
    { raiseOnMissing = true }: { raiseOnMissing?: boolean } = {},
  ): Record<string, unknown> | undefined {
    let pathParameters: Record<string, unknown> | undefined;
    this.router.recognize(req as unknown as RouterRequest, (route, params) => {
      Object.assign(params, extras);
      for (const [key, value] of Object.entries(params)) {
        if (typeof value === "string") {
          params[key] = RFC2396_PARSER.unescape(value);
        }
      }
      req.pathParameters = params;
      const app = route.app as Endpoint;
      if (app.matches(req) && app.dispatcher()) {
        try {
          req.controllerClass();
        } catch (e) {
          if (!(e instanceof NameError)) throw e;
          throw new RoutingError(
            `A route matches ${rbInspect(path)}, but references missing controller: ${camelize(
              String(params["controller"]),
            )}Controller`,
          );
        }

        pathParameters = req.pathParameters;
        return true;
      } else if (app.matches(req) && app.engine()) {
        const engineParameters = (
          app.rackApp() as { routes: RouteSet }
        ).routes.recognizePathWithRequest(req, path, extras, { raiseOnMissing: false });
        if (engineParameters) {
          pathParameters = engineParameters;
          return true;
        }
      }
    });
    if (pathParameters !== undefined) return pathParameters;

    if (raiseOnMissing) {
      throw new RoutingError(`No route matches ${rbInspect(path)}`);
    }
    return undefined;
  }

  get journeyRouter(): JourneyRouter {
    if (!this._journeyRouter) {
      this._journeyRouter = buildJourneyRouter(this.routes, {
        app: (r) => r.app as unknown as RoutableApp,
      });
    }
    return this._journeyRouter;
  }

  journeyRecognize(method: string, path: string): JourneyMatch | null {
    return recognizeViaJourney(this.journeyRouter, method, path);
  }

  serve(req: RouterRequest): Promise<RackishResponse> {
    return this.journeyRouter.serve(req);
  }

  recognizePath(
    path: string,
    environment: { method?: string | null; extras?: Record<string, unknown> } = {},
  ): Record<string, unknown> {
    const method = String(environment.method ?? "GET").toUpperCase();
    if (!(path != null && path.includes("://"))) path = normalizePath(path);
    const extras = environment.extras ?? {};

    let env: RackEnv;
    try {
      env = MockRequest.envFor(path, { ":method": method }) as RackEnv;
    } catch (e) {
      if (!(e instanceof InvalidURIError)) throw e;
      throw new RoutingError(e.message);
    }

    const req = this.makeRequest(env);
    return this.recognizePathWithRequest(req, path, extras)!;
  }

  generateExtras(
    options: Record<string, unknown>,
    recall: Record<string, unknown> = {},
  ): [string, string[]] {
    let route: Route | undefined;
    const useRoute = options["useRoute"];
    if (typeof useRoute === "string" || typeof useRoute === "symbol") {
      delete options["useRoute"];
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
    const captureParams: Record<string, unknown> = Object.create(null);
    for (const name of captureNames) {
      const v = options[name];
      if (v != null) captureParams[name] = v;
    }
    const path = route.pathFor(captureParams as Record<string, string | number>);
    const routeDefaults = route.defaults as Record<string, unknown>;
    const extras: string[] = [];
    for (const k of Object.keys(options)) {
      if (k === "controller" || k === "action" || captureNames.has(k)) continue;
      const v = options[k];
      if (Object.hasOwn(routeDefaults, k) && routeDefaults[k] === v) continue;
      if (Object.hasOwn(recall, k) && recall[k] === v) continue;
      extras.push(k);
    }
    return [path, extras];
  }

  recognize(method: string, path: string): MatchedRoute | null {
    return recognizeViaJourney(this.journeyRouter, method, path);
  }

  setDefaultUrlOptions(options: { host?: string }): void {
    this.defaultUrlOptions = { ...this.defaultUrlOptions, ...options };
  }

  clear(): void {
    this._finalized = false;
    this.routes = [];
    this.namedRoutes.clearBang();
    this.set.clear();
    this.formatter.clear();
    this.polymorphicMappings.clear();
    this._defaultEnv = undefined;
    this._journeyRouter = null;
  }

  getNamedRoutes(): ReadonlyMap<string, Route> {
    return this.namedRoutes.routes;
  }

  getRoutes(): readonly Route[] {
    return this.routes;
  }

  async call(env: RackEnv): Promise<RackResponse> {
    const req = this.makeRequest(env);
    req.pathInfo = normalizePath(req.pathInfo);
    return (await this.router.serve(req as unknown as RouterRequest)) as unknown as RackResponse;
  }
}
