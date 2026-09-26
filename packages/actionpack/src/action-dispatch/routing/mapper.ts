import {
  Route,
  type RouteOptions,
  type RouteConstraints,
  type ResourceAction,
  type RedirectFunction,
  type RedirectOptions,
  type MountableApp,
} from "./route.js";
import { Redirect, redirect as redirectFactory } from "./redirection.js";
import { Endpoint } from "./endpoint.js";
import { Dispatcher, StaticDispatcher } from "./route-set.js";
import type { DispatchableControllerClass } from "./dispatcher.js";
import type { Request } from "../http/request.js";
import { X_CASCADE } from "../constants.js";
import { Scope, type ScopeFrameHash, type ScopeLevel } from "./scope.js";
import { Parser } from "../journey/parser.js";
import { Ast, type Node } from "../journey/nodes/node.js";
import {
  isBlank,
  isPlainObject,
  isPresent,
  kernelArray,
  stringifyKeys,
  underscore,
} from "@blazetrails/activesupport";
import {
  getFs,
  getPath,
  RFC2396_PARSER,
  rbInspect,
  rbObjRespondTo,
  stringSplit,
} from "@blazetrails/ruby-compat";
import { ArgumentError } from "@blazetrails/activemodel";
import { fetch, hashDelete, isSymbol, symbolToS } from "@blazetrails/ruby-compat";
import { deprecator } from "../deprecator.js";

type MapperCallback = (mapper: Mapper) => void;
type ConcernCallback = (mapper: Mapper) => void;

/** @internal */
interface ResourceLike {
  memberName?: string;
  collectionName?: string;
  nestedParam?: string;
  param?: string;
  path: string;
  resourceScope?: string;
  actions?: ResourceAction[];
  shallow: () => boolean;
  singleton: () => boolean;
  collectionScope: string;
  memberScope: string;
  nestedScope: string;
  newScope(newPath: string): string;
}

const RESOURCE_OPTIONS: ReadonlySet<string> = new Set([
  "as",
  "controller",
  "path",
  "only",
  "except",
  "param",
  "concerns",
]);

/** @internal */
interface RouteSetLike {
  namedRoutes: { get(name: string): unknown };
  addRoute(mapping: Mapping, name?: string | null | false): unknown;
  resourcesPathNames: Record<string, string>;
  drawPaths: string[];
  defaultUrlOptions: Record<string, unknown>;
}

/** @internal */
export class Constraints extends Endpoint {
  override app(): unknown {
    return this._app;
  }
  readonly constraints: readonly unknown[];

  static readonly SERVE: ConstraintsStrategy = (app, req) =>
    (app as { serve(req: ConstraintsRequest): unknown }).serve(req);
  static readonly CALL: ConstraintsStrategy = (app, req) => callableOf(app).call(app, req.env);

  private readonly _strategy: ConstraintsStrategy;
  private readonly _app: unknown;

  constructor(app: unknown, constraints: readonly unknown[], strategy: ConstraintsStrategy) {
    super();
    if (app instanceof Constraints) {
      constraints = [...constraints, ...app.constraints];
      app = app.app();
    }

    this._strategy = strategy;

    this._app = app;
    this.constraints = constraints;
  }

  override dispatcher(): boolean {
    return this._strategy === Constraints.SERVE;
  }

  override matches(req: Request): boolean {
    return this.constraints.every((constraint) => {
      const c = constraint as ConstraintLike;
      if (rbObjRespondTo(c, "matches")) {
        const matched = c.matches!(req);
        if (matched != null && matched !== false) return true;
      }
      if (rbObjRespondTo(c, "call")) {
        const called = callableOf(c).apply(c, this.constraintArgs(c, req));
        if (called != null && called !== false) return true;
      }
      return false;
    });
  }

  /** @missingRailsCall call — PERMANENT */
  serve(req: ConstraintsRequest): unknown {
    if (!this.matches(req as unknown as Request)) {
      return [404, { [X_CASCADE]: "pass" }, []];
    }

    return this._strategy(this._app, req);
  }

  /** @internal */
  private constraintArgs(constraint: ConstraintLike, request: Request): unknown[] {
    const arity = rbObjRespondTo(constraint, "arity")
      ? constraint.arity!
      : callableOf(constraint).length;

    if (arity < 1) {
      return [];
    } else if (arity === 1) {
      return [request];
    } else {
      return [request.pathParameters, request];
    }
  }
}

/** @internal */
interface ConstraintLike {
  arity?: number;
  matches?: (req: Request) => unknown;
  call?: (...args: unknown[]) => unknown;
}

/** @noRailsEquivalent PERMANENT */
function callableOf(target: unknown): (...args: unknown[]) => unknown {
  return typeof target === "function" &&
    Object.getOwnPropertyDescriptor(target, "prototype")?.writable !== false
    ? (target as (...args: unknown[]) => unknown)
    : (target as { call: (...args: unknown[]) => unknown }).call;
}

/** @internal */
export type ConstraintsStrategy = (app: unknown, req: ConstraintsRequest) => unknown;

/** @internal */
export interface ConstraintsRequest {
  env: Record<string, unknown>;
}

/** @internal */
interface MappingScopeParams {
  blocks: readonly unknown[];
  constraints: RouteConstraints;
  defaults: Record<string, unknown>;
  module: string | undefined;
  options: Record<string, unknown>;
}

/** @internal */
class Mapping {
  static readonly OPTIONAL_FORMAT_REGEX = /(?:\(\.:format\)+|\.:format|\/)(?=\n?$)/;

  readonly defaults: Record<string, unknown>;
  readonly to: unknown;
  readonly defaultController: string | RegExp | undefined;
  readonly defaultAction: string | undefined;
  readonly ast: Ast;
  readonly scopeOptions: Record<string, unknown>;
  private readonly _blocks: readonly unknown[];
  private readonly _anchor: boolean;
  private readonly _via: readonly string[];
  private readonly _formatted: boolean | undefined;
  private readonly _internal: boolean | undefined;
  private readonly _constraints: RouteConstraints;

  static build(
    scope: Scope,
    set: RouteSetLike | undefined,
    ast: Node,
    controller: string | RegExp | undefined,
    defaultAction: string | undefined,
    to: unknown,
    via: readonly string[],
    formatted: boolean | undefined,
    optionsConstraints: unknown,
    anchor: boolean,
    options: Record<string, unknown>,
  ): Mapping {
    const scopeParams: MappingScopeParams = {
      blocks: (scope.get("blocks") as unknown[] | undefined) ?? [],
      constraints: (scope.get("constraints") as RouteConstraints | undefined) ?? {},
      defaults: { ...((scope.get("defaults") as Record<string, unknown> | undefined) ?? {}) },
      module: scope.get("module") as string | undefined,
      options: (scope.get("options") as Record<string, unknown> | undefined) ?? {},
    };

    return new Mapping({
      set,
      ast,
      controller,
      defaultAction,
      to,
      formatted,
      via,
      optionsConstraints,
      anchor,
      scopeParams,
      options: { ...scopeParams.options, ...options },
    });
  }

  static checkVia<T>(via: T[]): T[] {
    if (via.length === 0) {
      const msg =
        "You should not use the `match` method in your router without specifying an HTTP method.\n" +
        "If you want to expose your action to both GET and POST, add `via: [:get, :post]` option.\n" +
        "If you want to expose your action to GET, use `get` in the router:\n" +
        '  Instead of: match "controller#action"\n' +
        '  Do: get "controller#action"';
      throw new ArgumentError(msg);
    }
    return via;
  }

  static normalizePath(path: string, format: boolean | undefined): string {
    path = Mapper.normalizePath(path);

    if (format === true) {
      return `${path}.:format`;
    } else if (Mapping.optionalFormat(path, format)) {
      return `${path}(.:format)`;
    } else {
      return path;
    }
  }

  static optionalFormat(path: string, format: boolean | undefined): boolean {
    return format !== false && !Mapping.OPTIONAL_FORMAT_REGEX.test(path);
  }

  constructor({
    ast,
    controller,
    defaultAction,
    to,
    formatted,
    via,
    optionsConstraints,
    anchor,
    scopeParams,
    options,
  }: {
    set: RouteSetLike | undefined;
    ast: Node;
    controller: string | RegExp | undefined;
    defaultAction: string | undefined;
    to: unknown;
    formatted: boolean | undefined;
    via: readonly string[];
    optionsConstraints: unknown;
    anchor: boolean;
    scopeParams: MappingScopeParams;
    options: Record<string, unknown>;
  }) {
    let defaults = scopeParams.defaults;
    this.to = to;
    this.defaultController = controller;
    this.defaultAction = defaultAction;
    this._anchor = anchor;
    this._via = via;
    this._formatted = formatted;
    this._internal = options.internal as boolean | undefined;
    delete options.internal;
    this.scopeOptions = scopeParams.options;
    this.ast = new Ast(ast, formatted);

    options = { ...this.ast.wildcardOptions, ...options };

    options = this.normalizeOptionsBang(options, this.ast.pathParams, scopeParams.module);

    const constraints: RouteConstraints = {
      ...scopeParams.constraints,
      ...(Object.fromEntries(
        Object.entries(options).filter(([, option]) => option instanceof RegExp),
      ) as RouteConstraints),
    };

    if (isPlainObject(optionsConstraints)) {
      defaults = {
        ...Object.fromEntries(
          Object.entries(optionsConstraints).filter(
            ([key, default_]) =>
              Mapper.URL_OPTIONS.includes(key) &&
              (typeof default_ === "string" || Number.isInteger(default_)),
          ),
        ),
        ...defaults,
      };
      this._blocks = scopeParams.blocks;
      Object.assign(constraints, optionsConstraints);
    } else {
      this._blocks = this.blocks(optionsConstraints);
    }
    this._constraints = constraints;

    this.defaults = { ...defaults, ...this.normalizeDefaults(options) };

    if (this.ast.pathParams.includes("action") && !Object.hasOwn(constraints, "action")) {
      if (this.defaults.action == null || this.defaults.action === false) {
        this.defaults.action = "index";
      }
    }
  }

  makeRoute(name: string | null | false | undefined, _precedence: number): Route {
    const route = new Route(
      this._via,
      this.ast.tree.toString(),
      (this.defaults.controller as string | undefined) ?? "",
      (this.defaults.action as string | undefined) ?? "",
      {
        name,
        redirectEndpoint: this.to instanceof Redirect ? this.to : undefined,
        constraints: Object.keys(this._constraints).length > 0 ? this._constraints : undefined,
        defaults: this.defaults as Record<string, string | null>,
        anchor: this._anchor,
        format: this._formatted,
        internal: this._internal,
        scopeOptions: this.scopeOptions,
      },
    );
    route.app = this.application();
    return route;
  }

  application(): Endpoint {
    return this.app(this._blocks);
  }

  /** @internal */
  private normalizeOptionsBang(
    options: Record<string, unknown>,
    pathParams: readonly string[],
    modyoule: string | undefined,
  ): Record<string, unknown> {
    if (pathParams.includes("controller")) {
      if (modyoule) {
        throw new ArgumentError(":controller segment is not allowed within a namespace block");
      }

      if (options.controller == null || options.controller === false) {
        options.controller = /.+?/;
      }
    }

    if (rbObjRespondTo(this.to, "action") || rbObjRespondTo(this.to, "call")) {
      return options;
    } else {
      let controller: string | RegExp | undefined;
      let action: string | undefined;
      if (this.to == null) {
        controller = this.defaultController;
        action = this.defaultAction;
      } else if (typeof this.to === "string") {
        if (this.to.includes("#")) {
          const toEndpoint = stringSplit(this.to, "#");
          controller = toEndpoint[0];
          action = toEndpoint[1];
        } else {
          controller = this.defaultController;
          action = this.to;
        }
      } else {
        throw new ArgumentError(
          ":to must respond to `action` or `call`, or it must be a String that includes '#', or the controller should be implicit",
        );
      }

      controller = this.addControllerModule(controller, modyoule);

      return Object.assign(options, this.checkControllerAndAction(pathParams, controller, action));
    }
  }

  /** @internal */
  private normalizeDefaults(options: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(options).filter(([, default_]) => !(default_ instanceof RegExp)),
    );
  }

  /** @internal */
  private app(blocks: readonly unknown[]): Endpoint {
    if (rbObjRespondTo(this.to, "action")) {
      return new StaticDispatcher(this.to as DispatchableControllerClass);
    } else if (rbObjRespondTo(this.to, "call")) {
      return new Constraints(this.to, blocks, Constraints.CALL);
    } else if (blocks.length > 0) {
      return new Constraints(
        this.dispatcher(Object.hasOwn(this.defaults, "controller")),
        blocks,
        Constraints.SERVE,
      );
    } else {
      return this.dispatcher(Object.hasOwn(this.defaults, "controller"));
    }
  }

  /** @internal */
  private checkControllerAndAction(
    pathParams: readonly string[],
    controller: string | RegExp | undefined,
    action: string | RegExp | undefined,
  ): Record<string, unknown> {
    const hash = this.checkPart("controller", controller, pathParams, {}, (part) =>
      this.translateController(part, () => {
        let message = `'${part}' is not a supported controller name. This can lead to potential routing problems.`;
        message +=
          " See https://guides.rubyonrails.org/routing.html#specifying-a-controller-to-use";

        throw new ArgumentError(message);
      }),
    );

    return this.checkPart("action", action, pathParams, hash, (part) =>
      part instanceof RegExp ? part : String(part),
    );
  }

  /** @internal */
  private checkPart(
    name: string,
    part: string | RegExp | undefined,
    pathParams: readonly string[],
    hash: Record<string, unknown>,
    block: (part: string | RegExp) => unknown,
  ): Record<string, unknown> {
    if (part != null) {
      hash[name] = block(part);
    } else {
      if (!pathParams.includes(name)) {
        const message = `Missing :${name} key on routes definition, please check your routes.`;
        throw new ArgumentError(message);
      }
    }
    return hash;
  }

  /** @internal */
  private addControllerModule(
    controller: string | RegExp | undefined,
    modyoule: string | undefined,
  ): string | RegExp | undefined {
    if (modyoule && !(controller instanceof RegExp)) {
      if (controller?.startsWith("/")) {
        return controller.slice(1);
      } else {
        return [modyoule, controller].filter((part) => part != null).join("/");
      }
    } else {
      return controller;
    }
  }

  /** @internal */
  private translateController(controller: string | RegExp, block: () => never): string | RegExp {
    if (controller instanceof RegExp) return controller;
    if (/^[a-z_0-9][a-z_0-9/]*$/.test(controller)) return controller;

    return block();
  }

  /** @internal */
  private blocks(callableConstraint: unknown): unknown[] {
    if (
      !(rbObjRespondTo(callableConstraint, "call") || rbObjRespondTo(callableConstraint, "matches"))
    ) {
      throw new ArgumentError(
        `Invalid constraint: ${rbInspect(callableConstraint)} must respond to :call or :matches?`,
      );
    }
    return [callableConstraint];
  }

  /** @internal */
  private dispatcher(raiseOnNameError: boolean): Dispatcher {
    return new Dispatcher(raiseOnNameError);
  }
}

export class Mapper {
  static readonly URL_OPTIONS: readonly string[] = [
    "protocol",
    "subdomain",
    "domain",
    "host",
    "port",
  ];

  private concerns: Map<string, ConcernCallback> = new Map();
  /** @internal */
  _set: RouteSetLike;
  /** @internal */
  _drawPaths: string[];
  /** @internal */
  _scope: Scope;
  /** @internal */
  _apiOnly = false;

  constructor(set: RouteSetLike) {
    this._set = set;
    this._drawPaths = set.drawPaths;
    this._scope = new Scope({ pathNames: this._set.resourcesPathNames });
  }

  set defaultUrlOptions(options: Record<string, unknown>) {
    this._set.defaultUrlOptions = options;
  }

  get defaultUrlOptions(): Record<string, unknown> {
    return this._set.defaultUrlOptions;
  }

  get(path: string, optionsOrEndpoint: RouteOptions | string = {}): void {
    this.mapMethod("GET", path, normalizeOptions(optionsOrEndpoint));
  }

  post(path: string, optionsOrEndpoint: RouteOptions | string = {}): void {
    this.mapMethod("POST", path, normalizeOptions(optionsOrEndpoint));
  }

  put(path: string, optionsOrEndpoint: RouteOptions | string = {}): void {
    this.mapMethod("PUT", path, normalizeOptions(optionsOrEndpoint));
  }

  patch(path: string, optionsOrEndpoint: RouteOptions | string = {}): void {
    this.mapMethod("PATCH", path, normalizeOptions(optionsOrEndpoint));
  }

  delete(path: string, optionsOrEndpoint: RouteOptions | string = {}): void {
    this.mapMethod("DELETE", path, normalizeOptions(optionsOrEndpoint));
  }

  root(path: string | RouteOptions, options: RouteOptions = {}): void {
    if (typeof path === "string") {
      options.to = path;
    } else if (isPlainObject(path) && Object.keys(options).length === 0) {
      options = path;
    } else {
      throw new ArgumentError("must be called with a path and/or options");
    }

    if (this._scope.isResources()) {
      this.withScopeLevel("root", () => {
        this.pathScope(this.parentResource()!.path, () => {
          this.matchRootRoute(options);
        });
      });
    } else {
      this.matchRootRoute(options);
    }
  }

  resources(
    name: string,
    optionsOrCallback?: RouteOptions | MapperCallback,
    callback?: MapperCallback,
  ): void {
    let options: RouteOptions = {};
    let cb: MapperCallback | undefined;

    if (typeof optionsOrCallback === "function") {
      cb = optionsOrCallback;
    } else if (optionsOrCallback) {
      options = optionsOrCallback;
      cb = callback;
    }

    if (this.applyCommonBehaviorFor("resources", [name], options, cb)) return;
    options = this.applyActionOptions("resources", options);

    const shallow = this._scope.get("shallow") === true;
    const controller = name;
    const prefix = (this._scope.get("path") as string | undefined) ?? "";
    const basePath = `${prefix}/${name}`;
    const singular = singularize(name);
    const namePrefix = this._scope.get("as") as string | undefined;
    const routeName = (suffix: string) => (namePrefix ? `${namePrefix}_${suffix}` : suffix);

    const shallowPath = shallow
      ? `${(this._scope.get("shallowPath") as string | undefined) ?? ""}/${name}`
      : basePath;
    const outerNamePrefix = shallow
      ? (this._scope.get("shallowPrefix") as string | undefined)
      : undefined;
    const shallowRouteName = (suffix: string) =>
      outerNamePrefix ? `${outerNamePrefix}_${suffix}` : suffix;
    const shallowName = (suffix: string) =>
      shallow ? shallowRouteName(suffix) : routeName(suffix);

    const allowed = allowedActions(options, [
      "index",
      "show",
      "new",
      "create",
      "edit",
      "update",
      "destroy",
    ]);
    const merged = {
      ...((this._scope.get("constraints") as RouteConstraints | undefined) ?? {}),
      ...((options.constraints as RouteConstraints | undefined) ?? {}),
    };
    const constraints = Object.keys(merged).length > 0 ? merged : undefined;
    const newPath = this.actionPath("new");
    const editPath = this.actionPath("edit");

    if (cb) {
      const resource: ResourceLike = {
        memberName: singular,
        collectionName: name,
        nestedParam: `${singular}_id`,
        param: "id",
        path: String((options as { path?: string }).path ?? name),
        resourceScope: controller,
        actions: Array.from(allowed),
        shallow: () => shallow,
        singleton: () => false,
        collectionScope: name,
        memberScope: `${name}/:id`,
        nestedScope: `${name}/:${singular}_id`,
        newScope: (newPath) => `${name}/${newPath}`,
      };
      this.withScopeLevel("resources", () => this.resourceScope(resource, () => cb(this)));
    }

    if (allowed.has("index")) {
      const as = routeName(name);
      this.addRouteToSet(
        new Route("GET", basePath, controller, "index", {
          name: as,
          constraints,
        }),
        as,
      );
    }

    if (allowed.has("create")) {
      this.addRouteToSet(new Route("POST", basePath, controller, "create", { constraints }));
    }

    if (allowed.has("new")) {
      const as = routeName(`new_${singular}`);
      this.addRouteToSet(
        new Route("GET", `${basePath}/${newPath}`, controller, "new", {
          name: as,
          constraints,
        }),
        as,
      );
    }

    if (allowed.has("edit")) {
      const as = shallowName(`edit_${singular}`);
      this.addRouteToSet(
        new Route("GET", `${shallowPath}/:id/${editPath}`, controller, "edit", {
          name: as,
          constraints,
        }),
        as,
      );
    }

    if (allowed.has("show")) {
      const as = singular !== name ? shallowName(singular) : undefined;
      this.addRouteToSet(
        new Route("GET", `${shallowPath}/:id`, controller, "show", {
          name: as,
          constraints,
        }),
        as,
      );
    }

    if (allowed.has("update")) {
      this.addRouteToSet(
        new Route("PATCH", `${shallowPath}/:id`, controller, "update", { constraints }),
      );
      this.addRouteToSet(
        new Route("PUT", `${shallowPath}/:id`, controller, "update", { constraints }),
      );
    }

    if (allowed.has("destroy")) {
      this.addRouteToSet(
        new Route("DELETE", `${shallowPath}/:id`, controller, "destroy", { constraints }),
      );
    }
  }

  resource(
    name: string,
    optionsOrCallback?: RouteOptions | MapperCallback,
    callback?: MapperCallback,
  ): void {
    let options: RouteOptions = {};
    let cb: MapperCallback | undefined;

    if (typeof optionsOrCallback === "function") {
      cb = optionsOrCallback;
    } else if (optionsOrCallback) {
      options = optionsOrCallback;
      cb = callback;
    }

    if (this.applyCommonBehaviorFor("resource", [name], options, cb)) return;
    options = this.applyActionOptions("resource", options);

    const controller = pluralize(name);
    const prefix = (this._scope.get("path") as string | undefined) ?? "";
    const basePath = `${prefix}/${name}`;
    const namePrefix = this._scope.get("as") as string | undefined;
    const routeName = (suffix: string) => (namePrefix ? `${namePrefix}_${suffix}` : suffix);

    const shallow = this._scope.get("shallow") === true;
    const allowed = allowedActions(options, ["show", "new", "create", "edit", "update", "destroy"]);
    const newPath = this.actionPath("new");
    const editPath = this.actionPath("edit");

    if (cb) {
      const resource: ResourceLike = {
        memberName: name,
        collectionName: name,
        nestedParam: `${name}_id`,
        param: "id",
        path: String((options as { path?: string }).path ?? name),
        resourceScope: controller,
        actions: Array.from(allowed),
        shallow: () => shallow,
        singleton: () => true,
        collectionScope: name,
        memberScope: name,
        nestedScope: name,
        newScope: (newPath) => `${name}/${newPath}`,
      };
      this.withScopeLevel("resource", () => this.resourceScope(resource, () => cb(this)));
    }

    if (allowed.has("new")) {
      const as = routeName(`new_${name}`);
      this.addRouteToSet(
        new Route("GET", `${basePath}/${newPath}`, controller, "new", {
          name: as,
        }),
        as,
      );
    }

    if (allowed.has("create")) {
      this.addRouteToSet(new Route("POST", basePath, controller, "create"));
    }

    if (allowed.has("show")) {
      const as = routeName(name);
      this.addRouteToSet(
        new Route("GET", basePath, controller, "show", {
          name: as,
        }),
        as,
      );
    }

    if (allowed.has("edit")) {
      const as = routeName(`edit_${name}`);
      this.addRouteToSet(
        new Route("GET", `${basePath}/${editPath}`, controller, "edit", {
          name: as,
        }),
        as,
      );
    }

    if (allowed.has("update")) {
      this.addRouteToSet(new Route("PATCH", basePath, controller, "update"));
      this.addRouteToSet(new Route("PUT", basePath, controller, "update"));
    }

    if (allowed.has("destroy")) {
      this.addRouteToSet(new Route("DELETE", basePath, controller, "destroy"));
    }
  }

  namespace(
    path: string,
    options: (ScopeOptions & { path?: string }) | MapperCallback = {},
    block?: MapperCallback,
  ): void {
    const opts: ScopeOptions & Record<string, unknown> =
      typeof options === "function" ? {} : { ...options };
    const cb = typeof options === "function" ? options : block;
    if (!cb) throw new Error("no block given (yield)");
    if (this._scope.isResourceScope()) {
      this.nested(() => this.namespace(path, opts, cb));
      return;
    }
    path = String(path);

    const defaults: ScopeOptions & Record<string, unknown> = {
      module: path,
      as: fetch(opts, "as", path),
      shallowPath: fetch(opts, "path", path),
      shallowPrefix: fetch(opts, "as", path),
    };

    this.pathScope(deleteWithDefault(opts, "path", path), () => {
      this.scope(Object.assign(defaults, opts), cb);
    });
  }

  scope(
    pathOrOptions: string | ScopeOptions,
    callbackOrOptions?: MapperCallback | ScopeOptions,
    callback?: MapperCallback,
  ): void {
    let path: string | undefined;
    let options: ScopeOptions = {};
    let cb: MapperCallback;

    if (typeof pathOrOptions === "string") {
      path = pathOrOptions;
      if (typeof callbackOrOptions === "function") {
        cb = callbackOrOptions;
      } else {
        options = callbackOrOptions ?? {};
        cb = callback!;
      }
    } else {
      options = pathOrOptions;
      cb = callbackOrOptions as MapperCallback;
    }

    options = { ...options };
    const scope: ScopeFrameHash = {};

    if (path !== undefined) options.path = path;
    options.constraints ??= {};

    if (!this.isNestedScope()) {
      if ("path" in options) options.shallowPath ??= options.path as string;
      if ("as" in options) options.shallowPrefix ??= options.as;
    }

    let block: unknown;
    if (isPlainObject(options.constraints)) {
      const defaults = Object.fromEntries(
        Object.entries(options.constraints).filter(
          ([k, v]) =>
            Mapper.URL_OPTIONS.includes(k) && (typeof v === "string" || Number.isInteger(v)),
        ),
      );

      options.defaults = { ...defaults, ...((options.defaults as object | undefined) ?? {}) };
    } else {
      block = options.constraints;
      options.constraints = {};
    }

    if ("only" in options || "except" in options) {
      scope.actionOptions = { only: options.only, except: options.except };
      delete options.only;
      delete options.except;
    }

    if ("anchor" in options) {
      throw new ArgumentError("anchor is ignored unless passed to `match`");
    }

    const merges = this as unknown as Record<string, (parent: unknown, child: unknown) => unknown>;
    for (const option of this._scope.options()) {
      let value: unknown = POISON;
      if (option === "blocks") {
        value = block;
      } else if (option === "options") {
        value = options;
      } else if (option in options) {
        value = options[option];
        delete options[option];
      }

      if (value !== POISON) {
        const merge = `merge${option[0].toUpperCase()}${option.slice(1)}Scope`;
        scope[option] = merges[merge](this._scope.get(option), value);
      }
    }

    const previous = this._scope;
    this._scope = this._scope.newChild(scope);
    try {
      cb(this);
    } finally {
      this._scope = previous;
    }
  }

  member(callback: MapperCallback): void {
    if (!this.isResourceScope()) {
      throw new ArgumentError("can't use member outside resource(s) scope");
    }

    this.withScopeLevel("member", () => {
      if (this.isShallow()) {
        this.shallowScope(() => {
          this.pathScope(this.parentResource()!.memberScope, () => callback(this));
        });
      } else {
        this.pathScope(this.parentResource()!.memberScope, () => callback(this));
      }
    });
  }

  collection(callback: MapperCallback): void {
    if (!this.isResourceScope()) {
      throw new ArgumentError("can't use collection outside resource(s) scope");
    }

    this.withScopeLevel("collection", () => {
      this.pathScope(this.parentResource()!.collectionScope, () => callback(this));
    });
  }

  nested(callback: MapperCallback): void {
    if (!this.isResourceScope()) {
      throw new ArgumentError("can't use nested outside resource(s) scope");
    }

    this.withScopeLevel("nested", () => {
      if (this.isShallow() && this.shallowNestingDepth() >= 1) {
        this.shallowScope(() => {
          this.pathScope(this.parentResource()!.nestedScope, () => {
            this.scope(this.nestedOptions(), callback);
          });
        });
      } else {
        this.pathScope(this.parentResource()!.nestedScope, () => {
          this.scope(this.nestedOptions(), callback);
        });
      }
    });
  }

  new(callback: MapperCallback): void {
    if (!this.isResourceScope()) {
      throw new ArgumentError("can't use new outside resource(s) scope");
    }

    this.withScopeLevel("new", () => {
      this.pathScope(this.parentResource()!.newScope(this.actionPath("new")), () => callback(this));
    });
  }

  shallow(callback: MapperCallback): void {
    const previous = this._scope;
    this._scope = this._scope.newChild({ shallow: true });
    try {
      callback(this);
    } finally {
      this._scope = previous;
    }
  }

  async draw(name: string): Promise<void> {
    const fs = getFs();
    const p = getPath();
    let path: string | undefined;
    for (const _path of this._drawPaths) {
      if (await fs.exists(`${_path}/${name}.ts`)) {
        path = _path;
        break;
      }
    }

    if (!path) {
      let msg =
        `Your router tried to #draw the external file ${name}.ts,\n` +
        "but the file was not found in:\n\n";
      msg += this._drawPaths.map((_path) => ` * ${_path}`).join("\n");
      throw new ArgumentError(msg);
    }

    const routePath = `${path}/${name}.ts`;
    const mod = (await import(p.pathToFileURL!(routePath).href)) as {
      drawRoutes?: (mapper: Mapper) => void;
    };
    mod.drawRoutes?.(this);
  }

  /** @internal */
  setMemberMappingsForResource(): void {
    const parent = this.parentResource();
    if (!parent) return;
    const actions = parent.actions ?? [];
    this.member(() => {
      const memberPath = this._scope.get("path") as string;
      const controller = parent.resourceScope ?? "";
      const editPath = this.actionPath("edit");
      if (actions.includes("edit")) {
        this.addRouteToSet(new Route("GET", `${memberPath}/${editPath}`, controller, "edit"));
      }
      if (actions.includes("show")) {
        this.addRouteToSet(new Route("GET", memberPath, controller, "show"));
      }
      if (actions.includes("update")) {
        this.addRouteToSet(new Route("PATCH", memberPath, controller, "update"));
        this.addRouteToSet(new Route("PUT", memberPath, controller, "update"));
      }
      if (actions.includes("destroy")) {
        this.addRouteToSet(new Route("DELETE", memberPath, controller, "destroy"));
      }
    });
  }

  constraints(
    constraints: RouteOptions["constraints"] | MapperCallback = {},
    block?: MapperCallback,
  ): void {
    if (block === undefined) {
      block = constraints as MapperCallback;
      constraints = {};
    }
    this.scope({ constraints }, block);
  }

  concern(name: string, callable: ConcernCallback): void {
    this.concerns.set(name, callable);
  }

  useConcerns(...names: string[]): void {
    for (const name of names) {
      const cb = this.concerns.get(name);
      if (cb) cb(this);
    }
  }

  redirect(args: string | RedirectOptions | RedirectFunction): Redirect {
    let endpoint: Redirect;
    if (typeof args === "string") {
      endpoint = redirectFactory(args);
    } else if (typeof args === "function") {
      endpoint = redirectFactory(args);
    } else {
      const { status, ...opts } = args;
      endpoint = redirectFactory({ ...opts, status });
    }
    return endpoint;
  }

  match(
    path: string | Record<string, unknown>,
    ...rest: (string | (RouteOptions & { via?: string | string[] }))[]
  ): void {
    let options: RouteOptions & { via?: string | string[] };
    let paths: string[];
    if (rest.length === 0 && isPlainObject(path)) {
      const hash: Record<string, unknown> = path;
      let to: unknown;
      [path, to] = (Object.entries(hash).find(([name, _value]) => !isSymbol(name)) ?? []) as [
        string,
        unknown,
      ];

      if (path == null) throw new ArgumentError("Route path not specified");

      if (isSymbol(to)) {
        hash[":action"] = symbolToS(to);
      } else if (typeof to === "string") {
        if (to.includes("#")) {
          hash[":to"] = to;
        } else {
          hash[":controller"] = to;
        }
      } else {
        hash[":to"] = to;
      }

      hashDelete(hash, path);
      options = stringifyKeys(hash);
      paths = [path];
    } else {
      options = (rest.pop() as RouteOptions & { via?: string | string[] }) ?? {};
      paths = [path as string, ...(rest as string[])];
    }

    if ("defaults" in options) {
      const defaults = options.defaults as Record<string, string>;
      delete options.defaults;
      this.defaults(defaults, () => this.mapMatch(paths, options));
    } else {
      this.mapMatch(paths, options);
    }
  }

  options(path: string, optionsOrEndpoint: RouteOptions | string = {}): void {
    this.mapMethod("OPTIONS", path, normalizeOptions(optionsOrEndpoint));
  }

  connect(path: string, optionsOrEndpoint: RouteOptions | string = {}): void {
    this.match(path, { ...normalizeOptions(optionsOrEndpoint), via: ["GET", "CONNECT"] });
  }

  /** @internal */
  mapMethod(method: string, path: string, options: RouteOptions): void {
    this.match(path, { ...options, via: method });
  }

  controller(controller: string, callback: MapperCallback): void {
    const previous = this._scope;
    this._scope = this._scope.newChild({ controller });
    try {
      callback(this);
    } finally {
      this._scope = previous;
    }
  }

  defaults(defaults: Record<string, string>, callback: MapperCallback): void {
    const previous = this._scope;
    const merged = this.mergeDefaultsScope(
      this._scope.get("defaults") as Record<string, string> | undefined,
      defaults,
    );
    this._scope = this._scope.newChild({ defaults: merged });
    try {
      callback(this);
    } finally {
      this._scope = previous;
    }
  }

  mount(app: MountableApp, options: MountOptions = {}): void {
    const path = options.at;
    if (typeof app !== "function" && typeof (app as { call?: unknown })?.call !== "function") {
      throw new Error("A rack application must be specified");
    }
    if (!path) {
      throw new Error('Must be called with mount point\n\n  mount SomeRackApp, at: "some_route"');
    }
    const railsApp = this.isRailsApp(app);
    const asName = options.as ?? this.appName(app, railsApp);
    const matchOpts: RouteOptions & { via?: string | string[]; at?: string } = {
      anchor: false,
      format: false,
      ...options,
      via: options.via ?? ":all",
      to: app,
    };
    if (asName) matchOpts.as = asName;
    delete matchOpts.at;
    this.match(path, matchOpts);
    if (asName) this._mountedApps.set(asName, { app, path });
    if (railsApp && asName) this.defineGeneratePrefix(app, asName, path);
  }

  /** @internal */
  _mountedApps: Map<string, { app: MountableApp; path: string }> = new Map();

  /** @internal */
  isRailsApp(app: MountableApp): boolean {
    return typeof app === "function" && Boolean((app as { railtieName?: unknown }).railtieName);
  }

  /** @internal */
  appName(app: MountableApp, railsApp: boolean): string | undefined {
    if (railsApp) {
      return (app as { railtieName?: string }).railtieName;
    } else if (
      typeof app === "function" &&
      Object.getOwnPropertyDescriptor(app, "prototype")?.writable === false
    ) {
      const className = app.name;
      return underscore(className).replace(/\//g, "_");
    }
    return undefined;
  }

  /** @internal */
  defineGeneratePrefix(app: MountableApp, name: string, mountPath: string): void {
    const scriptNamer = (options: Record<string, unknown>): string => {
      if (options.originalScriptName) return mountPath;
      const sn = options.scriptName;
      return typeof sn === "string" && sn.length > 0 ? sn : mountPath;
    };
    this._mountedScriptNamers.set(name, { app, scriptNamer });
  }

  /** @internal */
  _mountedScriptNamers: Map<
    string,
    { app: MountableApp; scriptNamer: (options: Record<string, unknown>) => string }
  > = new Map();

  /** @internal */
  mapMatch(
    paths: string[],
    options: RouteOptions & {
      via?: string | string[];
      on?: string;
      format?: boolean;
      anchor?: boolean;
      path?: string;
    },
  ): void {
    if (paths.length > 1) {
      deprecator().warn(
        "Mapping a route with multiple paths is deprecated and will be removed in Rails 8.1. Please use multiple method calls instead.",
      );
    }

    if (options.on !== undefined) assertValidOnOption(options.on);

    const scopeTo = this._scope.get("to") as string | undefined;
    if (scopeTo) options.to ??= scopeTo;
    const scopeController = this._scope.get("controller") as string | undefined;
    const scopeAction = this._scope.get("action") as string | undefined;
    if (scopeController && scopeAction) {
      options.to ??= `${scopeController}#${scopeAction}`;
    }

    const controller = options.controller ?? scopeController;
    delete options.controller;
    const optionPath = options.path;
    delete options.path;
    let to = options.to;
    delete options.to;
    const via = Mapping.checkVia(
      kernelArray(
        "via" in options ? options.via : (this._scope.get("via") as string | string[] | undefined),
      ),
    );
    delete options.via;
    const formatted = options.format ?? (this._scope.get("format") as boolean | undefined);
    delete options.format;
    const anchor = options.anchor ?? true;
    delete options.anchor;
    const optionsConstraints = options.constraints ?? {};
    delete options.constraints;

    for (const p of paths) {
      const routeOptions = { ...options };
      if (p && optionPath) {
        throw new Error(
          "Ambiguous route definition. Both :path and the route path were specified as strings.",
        );
      }
      to =
        typeof to === "string" || to === undefined
          ? this.getToFromPath(p, to, routeOptions.action)
          : to;
      this.decomposedMatch(
        p,
        controller,
        routeOptions,
        p,
        to,
        via,
        formatted,
        anchor,
        optionsConstraints,
      );
    }
  }

  /** @internal */
  getToFromPath(
    path: string,
    to: string | undefined,
    action: string | undefined,
  ): string | undefined {
    if (to || action) return to;
    const stripped = path.replace(/\(\.:format\)$/, "");
    if (this.isUsingMatchShorthand(stripped)) {
      return stripped
        .replace(/^\//, "")
        .replace(/\/([^/]*)$/, "#$1")
        .replace(/-/g, "_");
    }
    return undefined;
  }

  /** @internal */
  isUsingMatchShorthand(path: string): boolean {
    return /^\/?[-\w]+\/[-\w/]+$/.test(path);
  }

  /** @internal */
  decomposedMatch(
    path: string,
    controller: string | RegExp | undefined,
    options: RouteOptions & { on?: string },
    _path: string | undefined,
    to: string | MountableApp | Redirect | undefined,
    via: string | string[],
    formatted: boolean | undefined,
    anchor: boolean,
    optionsConstraints: RouteOptions["constraints"],
  ): void {
    const recurse = () =>
      this.decomposedMatch(
        path,
        controller,
        options,
        _path,
        to,
        via,
        formatted,
        anchor,
        optionsConstraints,
      );
    const on = options.on;
    if (on) {
      delete options.on;
      const dispatch = (this as unknown as Record<string, unknown>)[on];
      if (typeof dispatch === "function")
        (dispatch as (cb: MapperCallback) => void).call(this, recurse);
      return;
    }
    if (this._scope.scopeLevel === "resources") return this.nested(recurse);
    if (this._scope.scopeLevel === "resource") return this.member(recurse);
    this.addRoute(path, controller, options, _path, to, via, formatted, anchor, optionsConstraints);
  }

  /** @internal */
  matchRootRoute(options: RouteOptions & { via?: string | string[] } = {}): void {
    this.match("/", { as: "root", via: "GET", ...options });
  }

  direct(
    name: string,
    options: Record<string, unknown> | ((...a: unknown[]) => unknown) = {},
    block?: (...args: unknown[]) => unknown,
  ): void {
    if (!this._scope.isRoot()) {
      throw new Error("The direct method can't be used inside a routes scope block");
    }
    if (typeof options === "function") {
      block = options;
      options = {};
    }
    this._directHelpers.set(name, { options, block });
  }

  resolve(...args: unknown[]): void {
    if (!this._scope.isRoot()) {
      throw new Error("The resolve method can't be used inside a routes scope block");
    }
    let block: ((...args: unknown[]) => unknown) | undefined;
    if (typeof args[args.length - 1] === "function") {
      block = args.pop() as (...a: unknown[]) => unknown;
    }
    let options: Record<string, unknown> = {};
    const tail = args[args.length - 1];
    if (tail && typeof tail === "object" && !Array.isArray(tail)) {
      options = args.pop() as Record<string, unknown>;
    }
    for (const klass of args.flat()) {
      const typed = klass as { modelName?: { name?: string }; name?: string };
      const key =
        klass != null && (typeof klass === "object" || typeof klass === "function")
          ? typed.modelName?.name || typed.name || String(klass)
          : String(klass);
      this._polymorphicMappings.set(key, { options, block });
    }
  }

  /** @internal */
  _directHelpers: Map<
    string,
    { options: Record<string, unknown>; block?: (...args: unknown[]) => unknown }
  > = new Map();
  /** @internal */
  _polymorphicMappings: Map<
    string,
    { options: Record<string, unknown>; block?: (...args: unknown[]) => unknown }
  > = new Map();

  private addRoute(
    action: string | undefined,
    controller: string | RegExp | undefined,
    options: RouteOptions,
    _path: string | undefined,
    to: string | MountableApp | Redirect | undefined,
    via: string | string[],
    formatted: boolean | undefined,
    anchor: boolean,
    optionsConstraints: RouteOptions["constraints"],
  ): void {
    let path = this.pathForAction(action!, _path);
    if (isBlank(path)) throw new ArgumentError("path is required");

    action = String(action);

    let defaultAction: string | undefined =
      options.action != null && (options.action as unknown) !== false
        ? options.action
        : (this._scope.get("action") as string | undefined);
    delete options.action;

    if (/^[\w\-/]+$/.test(action)) {
      if (
        !action.includes("/") &&
        (defaultAction == null || (defaultAction as unknown) === false)
      ) {
        defaultAction = action.replace(/-/g, "_");
      }
    } else {
      action = undefined;
    }

    let as: string | null | false | undefined;
    const asOption = fetch<unknown>(options as Record<string, unknown>, "as", true);
    if (asOption == null || asOption === false) {
      as = options.as;
      delete options.as;
    } else {
      const given = options.as as string | undefined;
      delete options.as;
      as = this.nameForAction(given, action);
    }

    path = Mapping.normalizePath(RFC2396_PARSER.escape(path), formatted);
    const ast = Parser.parse(path)!;

    const mapping = Mapping.build(
      this._scope,
      this._set,
      ast,
      controller,
      defaultAction,
      to,
      kernelArray(via),
      formatted,
      optionsConstraints,
      anchor,
      options as Record<string, unknown>,
    );
    this._set.addRoute(mapping, as);
  }

  /** @internal */
  private addRouteToSet(route: Route, name?: string | null): void {
    const mapping = Mapping.build(
      this._scope,
      this._set,
      Parser.parse(route.path)!,
      route.controller,
      route.action,
      undefined,
      route.verb.split("|"),
      route.formatted,
      route.constraints,
      route.anchor,
      { ...route.defaults },
    );
    this._set.addRoute(mapping, name);
  }

  private isShallow(): boolean {
    return !this.parentResource()!.singleton() && this._scope.get("shallow") === true;
  }

  /** @internal */
  static normalizePath(path: string): string {
    let result = "/" + path.replace(/\/+/g, "/").replace(/^\/+|\/+$/g, "");
    result = result.replace(/\/(\(+)\/?/g, "$1/");
    if (/^(\(+[^)]+\))(\(+\/:[^)]+\))*$/.test(result)) {
      result = result.replace(/^(\(+)\//, "/$1");
    }
    return result;
  }

  /** @internal */
  static normalizeName(name: string): string {
    return Mapper.normalizePath(name).slice(1).replace(/\//g, "_");
  }

  /** @internal */
  mergePathScope(parent: string | undefined, child: string): string {
    return Mapper.normalizePath(`${parent ?? ""}/${child}`);
  }

  /** @internal */
  mergeShallowPathScope(parent: string | undefined, child: string): string {
    return Mapper.normalizePath(`${parent ?? ""}/${child}`);
  }

  /** @internal */
  mergeAsScope(parent: string | undefined, child: string): string {
    return parent ? `${parent}_${child}` : child;
  }

  /** @internal */
  mergeShallowPrefixScope(parent: string | undefined, child: string): string {
    return parent ? `${parent}_${child}` : child;
  }

  /** @internal */
  mergeModuleScope(parent: string | undefined, child: string): string {
    return parent ? `${parent}/${child}` : child;
  }

  /** @internal */
  mergeControllerScope(_parent: string | undefined, child: string): string {
    return child;
  }

  /** @internal */
  mergeActionScope(_parent: string | undefined, child: string): string {
    return child;
  }

  /** @internal */
  mergeViaScope(_parent: unknown, child: string | string[]): string | string[] {
    return child;
  }

  /** @internal */
  mergeFormatScope(_parent: unknown, child: unknown): unknown {
    return child;
  }

  /** @internal */
  mergePathNamesScope(
    parent: Record<string, string> | undefined,
    child: Record<string, string>,
  ): Record<string, string> {
    return this.mergeOptionsScope(parent, child);
  }

  /** @internal */
  mergeConstraintsScope(
    parent: RouteConstraints | undefined,
    child: RouteConstraints,
  ): RouteConstraints {
    return this.mergeOptionsScope(parent, child);
  }

  /** @internal */
  mergeDefaultsScope<T extends Record<string, unknown>>(parent: T | undefined, child: T): T {
    return this.mergeOptionsScope(parent, child);
  }

  /** @internal */
  mergeBlocksScope(parent: unknown[] | undefined, child: unknown): unknown[] {
    const merged = parent ? [...parent] : [];
    if (child) merged.push(child);
    return merged;
  }

  /** @internal */
  mergeOptionsScope<T extends Record<string, unknown>>(parent: T | undefined, child: T): T {
    return { ...(parent ?? ({} as T)), ...child };
  }

  /** @internal */
  mergeShallowScope(_parent: unknown, child: unknown): boolean {
    return child ? true : false;
  }

  /** @internal */
  mergeToScope(_parent: unknown, child: unknown): unknown {
    return child;
  }

  /** @internal */
  isActionOptions(options: RouteOptions): boolean {
    return Boolean(options.only || options.except);
  }

  /** @internal */
  applicableActionsFor(method: "resource" | "resources"): ResourceAction[] {
    if (method === "resources")
      return ["index", "create", "new", "show", "update", "destroy", "edit"];
    if (method === "resource") return ["create", "new", "show", "update", "destroy", "edit"];
    return [];
  }

  /** @internal */
  isResourceScope(): boolean {
    return this._scope.isResourceScope();
  }

  /** @internal */
  isNestedScope(): boolean {
    return this._scope.isNested();
  }

  /** @internal */
  canonicalAction(action: string): boolean {
    return CANONICAL_ACTIONS.includes(action);
  }

  /** @internal */
  isParamConstraint(): boolean {
    const constraints = this._scope.get("constraints") as RouteConstraints | undefined;
    return constraints?.[this.parentResource()!.param!] instanceof RegExp;
  }

  /** @internal */
  paramConstraint(): RouteConstraints[string] {
    return (this._scope.get("constraints") as RouteConstraints)[this.parentResource()!.param!];
  }

  /** @internal */
  shallowNestingDepth(): number {
    return [...this._scope]
      .filter((node) => node.frame?.scopeLevelResource)
      .filter((node) => (node.frame!.scopeLevelResource as ResourceLike).shallow()).length;
  }

  /** @internal */
  pathForAction(action: string, path: string | undefined): string {
    const prefix = (this._scope.get("path") as string | undefined) ?? "";
    if (path != null) return `${prefix}/${path}`;
    if (this.canonicalAction(action)) {
      return prefix;
    } else {
      return `${prefix}/${this.actionPath(action)}`;
    }
  }

  /** @internal */
  prefixNameForAction(as: string | undefined, action: string | undefined): string | undefined {
    let prefix: string | undefined;
    if (as !== undefined && as !== null) prefix = as;
    else if (action && !this.canonicalAction(action)) prefix = action;
    if (prefix && prefix !== "/" && prefix.length > 0) {
      return Mapper.normalizeName(prefix.replace(/-/g, "_"));
    }
    return undefined;
  }

  /** @internal */
  nameForAction(as: string | undefined, action: string | undefined): string | undefined {
    const prefix = this.prefixNameForAction(as, action);
    const namePrefix = this._scope.get("as") as string | undefined;
    let collectionName: string | undefined;
    let memberName: string | undefined;

    if (this.parentResource()) {
      if (as == null && action == null) return undefined;

      collectionName = this.parentResource()!.collectionName;
      memberName = this.parentResource()!.memberName;
    }

    const actionName = this._scope.actionName(namePrefix, prefix, collectionName, memberName);
    const candidate = actionName.filter((p): p is string => isPresent(p)).join("_");
    if (!candidate) return undefined;
    if (as == null) {
      if (!/^[_a-z]/i.test(candidate) || this.hasNamedRoute(candidate)) return undefined;
    }
    return candidate;
  }

  /** @internal */
  hasNamedRoute(name: string): boolean {
    return this._set.namedRoutes.get(name) !== undefined;
  }

  /** @internal */
  withScopeLevel<T>(kind: ScopeLevel, fn: () => T): T {
    const previous = this._scope;
    this._scope = this._scope.newLevel(kind);
    try {
      return fn();
    } finally {
      this._scope = previous;
    }
  }

  /** @internal */
  pathScope<T>(path: string, fn: () => T): T {
    const previous = this._scope;
    const merged = this.mergePathScope(this._scope.get("path") as string | undefined, path);
    this._scope = this._scope.newChild({ path: merged });
    try {
      return fn();
    } finally {
      this._scope = previous;
    }
  }

  /** @internal */
  resourceScope<T>(resource: ResourceLike, fn: () => T): T {
    const before = this._scope;
    this._scope = this._scope.newChild({ scopeLevelResource: resource });
    if (resource.resourceScope !== undefined) {
      this._scope = this._scope.newChild({ controller: resource.resourceScope });
    }
    try {
      return fn();
    } finally {
      this._scope = before;
    }
  }

  /** @internal */
  shallowScope<T>(fn: () => T): T {
    const previous = this._scope;
    this._scope = this._scope.newChild({
      as: this._scope.get("shallowPrefix"),
      path: this._scope.get("shallowPath"),
    });
    try {
      return fn();
    } finally {
      this._scope = previous;
    }
  }

  /** @internal */
  withDefaultScope(scope: ScopeOptions, callback: MapperCallback): void {
    this.scope(scope, callback);
  }

  /** @internal */
  parentResource(): ResourceLike | undefined {
    return this._scope.get("scopeLevelResource") as ResourceLike | undefined;
  }

  /** @internal */
  isResourceMethodScope(): boolean {
    return this._scope.isResourceMethodScope();
  }

  /** @internal */
  isNestedScopeLevel(): boolean {
    return this._scope.isNested();
  }

  /** @internal */
  isApiOnly(): boolean {
    return this._apiOnly;
  }

  /** @internal */
  resourcesPathNames(options: Record<string, string>): Record<string, string> {
    const current = (this._scope.get("pathNames") as Record<string, string> | undefined) ?? {};
    Object.assign(current, options);
    return current;
  }

  /** @internal */
  actionPath(name: string): string {
    const pathNames = (this._scope.get("pathNames") as Record<string, string> | undefined) ?? {};
    return pathNames[name] ?? name;
  }

  /** @internal */
  nestedOptions(): ScopeOptions {
    const options: ScopeOptions = { as: this.parentResource()!.memberName };
    if (this.isParamConstraint()) {
      options.constraints = {
        [this.parentResource()!.nestedParam!]: this.paramConstraint(),
      };
    }

    return options;
  }

  /** @internal */
  scopeActionOptions(method: "resource" | "resources"): RouteOptions {
    const stored = this._scope.get("actionOptions") as RouteOptions | undefined;
    if (!stored) return {};
    const actions = this.applicableActionsFor(method);
    const result: RouteOptions = { ...stored };
    if (stored.only) {
      const only = Array.isArray(stored.only) ? stored.only : [stored.only];
      result.only = only.filter((a) => actions.includes(a));
    }
    if (stored.except) {
      const except = Array.isArray(stored.except) ? stored.except : [stored.except];
      result.except = except.filter((a) => actions.includes(a));
    }
    return result;
  }

  /** @internal */
  applyActionOptions(method: "resource" | "resources", options: RouteOptions): RouteOptions {
    if (options.only || options.except) return options;
    return { ...options, ...this.scopeActionOptions(method) };
  }

  /** @internal */
  applyCommonBehaviorFor(
    method: "resource" | "resources",
    resources: string[],
    options: RouteOptions,
    block: MapperCallback | undefined,
  ): boolean {
    const dispatch = (...args: unknown[]) =>
      (this as unknown as Record<string, (...a: unknown[]) => unknown>)[method](...args);

    if (resources.length > 1) {
      for (const r of resources) dispatch(r, options, block);
      return true;
    }
    if (options.shallow) {
      delete options.shallow;
      this.shallow(() => dispatch(resources.pop()!, options, block));
      return true;
    }
    if (this.isResourceScope()) {
      this.nested(() => dispatch(resources.pop()!, options, block));
      return true;
    }

    const constraints = (options.constraints ?? {}) as RouteConstraints;
    let pulledAny = false;
    for (const k of Object.keys(options) as Array<keyof RouteOptions>) {
      const v = options[k];
      if (v instanceof RegExp) {
        constraints[k as string] = v;
        delete options[k];
        pulledAny = true;
      }
    }
    if (pulledAny) options.constraints = constraints;

    const scopeOptions: ScopeOptions & Record<string, unknown> = {};
    let hasScopeOption = false;
    for (const k of Object.keys(options) as Array<keyof RouteOptions>) {
      if (!RESOURCE_OPTIONS.has(k as string)) {
        (scopeOptions as Record<string, unknown>)[k as string] = options[k];
        delete options[k];
        hasScopeOption = true;
      }
    }
    if (hasScopeOption) {
      this.scope(scopeOptions, () => dispatch(resources.pop()!, options, block));
      return true;
    }
    return false;
  }
}

const CANONICAL_ACTIONS = ["index", "create", "new", "show", "update", "destroy"];

const POISON = {};

const VALID_ON_OPTIONS: ReadonlySet<string> = new Set(["new", "collection", "member"]);

/** @internal */
function assertValidOnOption(on: string): void {
  if (!VALID_ON_OPTIONS.has(on)) throw new Error(`Unknown scope :${on} given to :on`);
}

/** @noRailsEquivalent PERMANENT */
function deleteWithDefault<T>(hash: Record<string, unknown>, key: string, defaultValue: T): T {
  if (!(key in hash)) return defaultValue;
  const value = hash[key] as T;
  delete hash[key];
  return value;
}

interface ScopeOptions {
  as?: string;
  module?: string;
  shallowPath?: string;
  shallowPrefix?: string;
  [key: string]: unknown;
}

interface MountOptions extends RouteOptions {
  at?: string;
  via?: string | string[];
}

function allowedActions(options: RouteOptions, all: ResourceAction[]): Set<ResourceAction> {
  if (options.only) {
    const only = Array.isArray(options.only) ? options.only : [options.only];
    return new Set(only);
  }
  if (options.except) {
    const except = Array.isArray(options.except) ? options.except : [options.except];
    return new Set(all.filter((a) => !except.includes(a)));
  }
  return new Set(all);
}

function normalizeOptions(optionsOrEndpoint: RouteOptions | string): RouteOptions {
  if (typeof optionsOrEndpoint === "string") {
    return { to: optionsOrEndpoint };
  }
  return optionsOrEndpoint;
}

function singularize(word: string): string {
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.endsWith("ses") || word.endsWith("xes") || word.endsWith("zes"))
    return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function pluralize(word: string): string {
  if (word.endsWith("y") && !/[aeiou]y$/.test(word)) return word.slice(0, -1) + "ies";
  if (word.endsWith("s") || word.endsWith("x") || word.endsWith("z")) return word + "es";
  return word + "s";
}
