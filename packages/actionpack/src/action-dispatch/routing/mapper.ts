import { Redirect, Redirection } from "./redirection.js";
import { Endpoint } from "./endpoint.js";
import { Dispatcher, StaticDispatcher, type DrawCallback, type RouteSet } from "./route-set.js";
import type { DispatchableControllerClass } from "./dispatcher.js";
import type { Request } from "../http/request.js";
import { X_CASCADE } from "../constants.js";
import { Parser } from "../journey/parser.js";
import { Ast, type Node } from "../journey/nodes/node.js";
import { Pattern } from "../journey/path/pattern.js";
import { Route as JourneyRoute, type VerbMatcher } from "../journey/route.js";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import {
  BacktraceCleaner as ActiveSupportBacktraceCleaner,
  camelize,
  callerLocations,
  cattrAccessor,
  extractOptionsBang,
  isBlank,
  isPlainObject,
  isPresent,
  kernelArray,
  pluralize,
  reverseMergeBang,
  singularize,
  TopLevel,
  transformKeys,
  underscore,
} from "@blazetrails/activesupport";
import {
  Enumerable,
  extend,
  getFs,
  getPath,
  hashAref,
  hashAset,
  include,
  Module,
  RFC2396_PARSER,
  rbInspect,
  RuntimeError,
  rbFPublicSend,
  rbFSend,
  slice,
  rbModPublicMethodDefined,
  rbObjRespondTo,
  rtest,
  stringSplit,
} from "@blazetrails/ruby-compat";
import { ArgumentError } from "@blazetrails/activemodel";
import {
  dup,
  fetch,
  File,
  groupBy,
  hashDelete,
  isSymbol,
  keepIf,
  merge,
  symbolToS,
} from "@blazetrails/ruby-compat";
import { deprecator } from "../deprecator.js";

export interface RouteConstraints {
  [key: string]: string | RegExp | number | boolean;
}

export type MountableApp =
  | ((env: RackEnv) => RackResponse | Promise<RackResponse>)
  | { call: (env: RackEnv) => RackResponse | Promise<RackResponse> };

type RailsApp = MountableApp & { railtieName(): string; routes(): RouteSet };

export type CallableConstraint =
  | ((...args: never[]) => unknown)
  | { matches(req: Request): unknown }
  | { call(...args: never[]): unknown };

export interface RouteOptions {
  name?: string | null | false;
  constraints?: RouteConstraints | CallableConstraint;
  defaults?: Record<string, string | null>;
  format?: boolean;
  as?: string | null | false;
  to?: string | MountableApp | Redirect;
  controller?: string | RegExp;
  action?: string;
  only?: ResourceAction | ResourceAction[];
  except?: ResourceAction | ResourceAction[];
  ip?: string | RegExp;
  redirect?: string | RedirectOptions | RedirectFunction;
  pathNames?: { new?: string; edit?: string };
  anchor?: boolean;
  shallow?: boolean;
  internal?: boolean;
  on?: string;
  concerns?: string | string[];
  [key: string]: unknown;
}

export type ResourceAction = "index" | "show" | "new" | "create" | "edit" | "update" | "destroy";

export type RedirectFunction = (params: Record<string, string>, request: Request) => string;

export interface RedirectOptions {
  path?: string;
  host?: string;
  subdomain?: string;
  domain?: string;
  status?: number;
}

type MapperCallback = (this: Mapper) => void;
type ConcernBlock = (this: Mapper, options: Record<string, unknown>) => void;
type ConcernCallback = (mapper: Mapper, options: Record<string, unknown>) => void;
type ConcernCallable =
  | ConcernCallback
  | { call(mapper: Mapper, options: Record<string, unknown>): void };
type MapMethodArgs = (string | RouteOptions | Record<string, unknown>)[];

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
export class Resource {
  static defaultActions(apiOnly: boolean): ResourceAction[] {
    if (apiOnly) {
      return ["index", "create", "show", "update", "destroy"];
    } else {
      return ["index", "create", "new", "show", "update", "destroy", "edit"];
    }
  }

  controller: string;
  path: string;
  param: string;
  protected _name: string;
  protected _as: string | null | false | undefined;
  protected _options: RouteOptions;
  protected _shallow: boolean;
  protected _apiOnly: boolean;
  protected _only: ResourceAction | ResourceAction[] | null;
  protected _except: ResourceAction | ResourceAction[] | null;
  protected _plural: string | undefined;
  protected _singular: string | undefined;

  constructor(entities: string, apiOnly: boolean, shallow: boolean, options: RouteOptions = {}) {
    if (String(options.param ?? "").includes(":")) {
      throw new ArgumentError(":param option can't contain colons");
    }

    const validActions = (this.constructor as typeof Resource).defaultActions(false);
    const invalidActions = this.invalidOnlyExceptOptions(options, validActions);
    if (isPresent(invalidActions)) {
      const errorPrefix = `Route \`resource${this.isSingleton() ? "" : "s"} :${entities}\``;
      throw new ArgumentError(
        `${errorPrefix} - :only and :except must include only [${validActions.map((a) => `:${a}`).join(", ")}], but also included [${invalidActions.map((a) => `:${a}`).join(", ")}]`,
      );
    }

    this._name = String(entities);
    this.path = String(rtest(options.path) ? options.path : this._name);
    this.controller = String(rtest(options.controller) ? options.controller : this._name);
    this._as = options.as;
    this.param = String(rtest(options.param) ? options.param : "id");
    this._options = options;
    this._shallow = shallow;
    this._apiOnly = apiOnly;
    this._only = hashDelete(options as Record<string, never>, "only");
    this._except = hashDelete(options as Record<string, never>, "except");
  }

  defaultActions(): ResourceAction[] {
    return (this.constructor as typeof Resource).defaultActions(this._apiOnly);
  }

  actions(): ResourceAction[] {
    if (this._except != null) {
      const except = kernelArray(this._except);
      return this.availableActions().filter((a) => !except.includes(a));
    } else {
      return this.availableActions();
    }
  }

  availableActions(): ResourceAction[] {
    if (this._only != null) {
      return kernelArray(this._only);
    } else {
      return this.defaultActions();
    }
  }

  name(): string {
    return rtest(this._as) ? this._as : this._name;
  }

  plural(): string {
    return (this._plural ??= String(this.name()));
  }

  singular(): string {
    return (this._singular ??= singularize(String(this.name())));
  }

  memberName(): string {
    return this.singular();
  }

  collectionName(): string {
    return this.singular() === this.plural() ? `${this.plural()}_index` : this.plural();
  }

  resourceScope(): string {
    return this.controller;
  }

  collectionScope(): string {
    return this.path;
  }

  memberScope(): string {
    return `${this.path}/:${this.param}`;
  }

  shallowScope(): string {
    return this.memberScope();
  }

  newScope(newPath: string): string {
    return `${this.path}/${newPath}`;
  }

  nestedParam(): string {
    return `${this.singular()}_${this.param}`;
  }

  nestedScope(): string {
    return `${this.path}/:${this.nestedParam()}`;
  }

  isShallow(): boolean {
    return this._shallow;
  }

  isSingleton(): boolean {
    return false;
  }

  private invalidOnlyExceptOptions(
    options: RouteOptions,
    validActions: ResourceAction[],
  ): ResourceAction[] {
    const values = [options.only, options.except].flat().filter((v) => v != null);
    return [...new Set(values)].filter((a) => !validActions.includes(a));
  }
}

/** @internal */
export class SingletonResource extends Resource {
  static override defaultActions(apiOnly: boolean): ResourceAction[] {
    if (apiOnly) {
      return ["show", "create", "update", "destroy"];
    } else {
      return ["show", "create", "update", "destroy", "new", "edit"];
    }
  }

  constructor(entities: string, apiOnly: boolean, shallow: boolean, options: RouteOptions) {
    super(entities, apiOnly, shallow, options);
    this._as = null;
    this.controller = String(rtest(options.controller) ? options.controller : this.plural());
    this._as = options.as;
  }

  override defaultActions(): ResourceAction[] {
    return (this.constructor as typeof SingletonResource).defaultActions(this._apiOnly);
  }

  override plural(): string {
    return (this._plural ??= pluralize(String(this.name())));
  }

  override singular(): string {
    return (this._singular ??= String(this.name()));
  }

  override memberName(): string {
    return this.singular();
  }

  override collectionName(): string {
    return this.singular();
  }

  override memberScope(): string {
    return this.path;
  }

  override nestedScope(): string {
    return this.path;
  }

  override isSingleton(): boolean {
    return true;
  }
}

/** @internal */
interface RouteSetLike {
  namedRoutes: { get(name: string): unknown };
  urlHelpers(): object;
  addRoute(mapping: Mapping, name?: string | null | false): unknown;
  resourcesPathNames: Record<string, string>;
  drawPaths: string[];
  defaultUrlOptions: Record<string, unknown>;
  requestClass(): { prototype: object };
  addUrlHelper: RouteSet["addUrlHelper"];
  addPolymorphicMapping: RouteSet["addPolymorphicMapping"];
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

const SEPARATORS = ["/", ".", "?"];

/** @internal */
export class Mapping {
  static readonly ANCHOR_CHARACTERS_REGEX = /^(\\A|\^)|(\\Z|\\z|\$)(?=\n?$)/;
  static readonly OPTIONAL_FORMAT_REGEX = /(?:\(\.:format\)+|\.:format|\/)(?=\n?$)/;

  readonly path: Pattern;
  readonly requirements: Record<string, unknown>;
  readonly defaults: Record<string, unknown>;
  readonly to: unknown;
  readonly defaultController: string | RegExp | undefined;
  readonly defaultAction: string | undefined;
  readonly requiredDefaults: string[];
  readonly ast: Ast;
  readonly scopeOptions: Record<string, unknown>;
  private readonly _set: RouteSetLike | undefined;
  private readonly _blocks: readonly unknown[];
  private readonly _anchor: boolean;
  private readonly _via: readonly string[];
  private readonly _formatted: boolean | undefined;
  private readonly _internal: boolean | undefined;
  private readonly _conditions: Record<string, unknown>;

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
    this._set = set;
    this.to = this.intern(to);
    this.defaultController = this.intern(controller);
    this.defaultAction = this.intern(defaultAction);
    this._anchor = anchor;
    this._via = via;
    this._formatted = formatted;
    this._internal = options.internal as boolean | undefined;
    delete options.internal;
    this.scopeOptions = scopeParams.options;
    this.ast = new Ast(ast, formatted);

    options = Object.assign(this.ast.wildcardOptions, options);

    options = this.normalizeOptionsBang(options, this.ast.pathParams, scopeParams.module);

    const splitOptions = this.constraints(options, this.ast.pathParams);

    const constraints: Record<string, unknown> = {
      ...scopeParams.constraints,
      ...Object.fromEntries(splitOptions.constraints ?? []),
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

    const [requirements, conditions] = this.splitConstraints(this.ast.pathParams, constraints);
    this.verifyRegexpRequirements(requirements, this.ast.wildcardOptions);

    const formats = this.normalizeFormat(formatted);

    this.requirements = { ...formats.requirements, ...Object.fromEntries(requirements) };
    this._conditions = Object.fromEntries(conditions);
    this.defaults = { ...formats.defaults, ...defaults, ...this.normalizeDefaults(options) };

    if (this.ast.pathParams.includes("action") && !("action" in this.requirements)) {
      if (this.defaults.action == null || this.defaults.action === false) {
        this.defaults.action = "index";
      }
    }

    this.requiredDefaults = (splitOptions.requiredDefaults ?? []).map(([key]) => key);

    this.ast.requirements = this.requirements as Record<string, RegExp>;
    this.path = new Pattern(
      this.ast,
      this.requirements as Record<string, RegExp>,
      Mapping.JOINED_SEPARATORS,
      this._anchor,
    );
  }

  static readonly JOINED_SEPARATORS = SEPARATORS.join("");

  makeRoute(name: string | null, precedence: number): JourneyRoute {
    return new JourneyRoute({
      name,
      app: this.application(),
      path: this.path,
      constraints: this.conditions(),
      requiredDefaults: this.requiredDefaults,
      defaults: this.defaults,
      requestMethodMatch: this.requestMethod(),
      precedence,
      scopeOptions: this.scopeOptions,
      internal: this._internal,
      sourceLocation: this.routeSourceLocation(),
    });
  }

  application(): Endpoint {
    return this.app(this._blocks);
  }

  conditions(): Record<string, unknown> {
    return this.buildConditions(this._conditions, this._set!.requestClass());
  }

  /** @internal */
  private buildConditions(
    currentConditions: Record<string, unknown>,
    requestClass: { prototype: object },
  ): Record<string, unknown> {
    const conditions = dup(currentConditions);

    return keepIf(conditions, (k) => rbModPublicMethodDefined(requestClass, k));
  }

  /** @internal */
  private requestMethod(): VerbMatcher[] {
    return this._via.map((x) => JourneyRoute.verbMatcher(x));
  }

  /** @internal */
  private intern<T>(object: T): T {
    return typeof object === "string" ? object : object;
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
      } else if (typeof this.to === "string" && !SYMBOL.test(this.to)) {
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
  private splitConstraints(
    pathParams: readonly string[],
    constraints: Record<string, unknown>,
  ): [[string, unknown][], [string, unknown][]] {
    const requirements: [string, unknown][] = [];
    const conditions: [string, unknown][] = [];
    for (const [key, requirement] of Object.entries(constraints)) {
      if (pathParams.includes(key) || key === "controller") {
        requirements.push([key, requirement]);
      } else {
        conditions.push([key, requirement]);
      }
    }
    return [requirements, conditions];
  }

  /** @internal */
  private normalizeFormat(formatted: unknown): {
    requirements: Record<string, RegExp>;
    defaults: Record<string, unknown>;
  } {
    if (formatted === true) {
      return { requirements: { format: /.+/ }, defaults: {} };
    } else if (formatted instanceof RegExp) {
      return { requirements: { format: formatted }, defaults: { format: null } };
    } else if (typeof formatted === "string") {
      return { requirements: { format: new RegExp(formatted) }, defaults: { format: formatted } };
    } else {
      return { requirements: {}, defaults: {} };
    }
  }

  /** @internal */
  private verifyRegexpRequirements(
    requirements: [string, unknown][],
    wildcardOptions: Record<string, RegExp>,
  ): void {
    for (const [requirement, regex] of requirements) {
      if (!(regex instanceof RegExp)) continue;

      if (Mapping.ANCHOR_CHARACTERS_REGEX.test(regex.source)) {
        throw new ArgumentError(
          `Regexp anchor characters are not allowed in routing requirements: ${rbInspect(`:${requirement}`)}`,
        );
      }

      if (regex.dotAll) {
        if (Object.hasOwn(wildcardOptions, requirement)) continue;

        throw new ArgumentError(
          `Regexp multiline option is not allowed in routing requirements: ${rbInspect(regex)}`,
        );
      }
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
        this.dispatcher("controller" in this.defaults),
        blocks,
        Constraints.SERVE,
      );
    } else {
      return this.dispatcher("controller" in this.defaults);
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
  private constraints(
    options: Record<string, unknown>,
    pathParams: readonly string[],
  ): Record<string, [string, unknown][]> {
    const groups: Record<string, [string, unknown][]> = {};
    for (const [key, option] of Object.entries(options)) {
      let group: string;
      if (option instanceof RegExp) {
        group = "constraints";
      } else {
        if (pathParams.includes(key)) {
          group = "pathParams";
        } else {
          group = "requiredDefaults";
        }
      }
      (groups[group] ??= []).push([key, option]);
    }
    return groups;
  }

  /** @internal */
  private dispatcher(raiseOnNameError: boolean): Dispatcher {
    return new Dispatcher(raiseOnNameError);
  }

  /** @internal */
  private routeSourceLocation(): string | null | undefined {
    if (Mapper.routeSourceLocations) {
      const actionDispatchDir = File.dirname(File.dirname(callerLocations(0, 1)[0].path));
      for (const location of callerLocations(1)) {
        if (location.path.startsWith(actionDispatchDir)) continue;

        const cleanedPath = Mapper.backtraceCleaner.cleanFrame(location.path);
        if (cleanedPath == null) continue;

        return `${cleanedPath}:${location.lineno}`;
      }
      return null;
    }
  }
}

export type ScopeLevel =
  | "resource"
  | "resources"
  | "collection"
  | "member"
  | "new"
  | "nested"
  | "root"
  | null;

export type ScopeFrameHash = Record<string, unknown>;

export class Scope {
  static readonly OPTIONS: readonly string[] = [
    "path",
    "shallowPath",
    "as",
    "shallowPrefix",
    "module",
    "controller",
    "action",
    "pathNames",
    "constraints",
    "shallow",
    "blocks",
    "defaults",
    "via",
    "format",
    "options",
    "to",
  ];

  static readonly RESOURCE_SCOPES: readonly ScopeLevel[] = ["resource", "resources"];
  static readonly RESOURCE_METHOD_SCOPES: readonly ScopeLevel[] = ["collection", "member", "new"];

  readonly parent: Scope | null;
  readonly scopeLevel: ScopeLevel;
  private readonly hash: ScopeFrameHash;

  constructor(
    hash: ScopeFrameHash,
    parent: Scope | null = Scope.ROOT,
    scopeLevel: ScopeLevel = null,
  ) {
    this.parent = parent;
    this.hash = parent ? { ...parent.frame, ...hash } : hash;
    this.scopeLevel = scopeLevel;
  }

  isNested(): boolean {
    return this.scopeLevel === "nested";
  }

  isNull(): boolean {
    return this.hash == null && this.parent == null;
  }

  isRoot(): boolean {
    return this.parent === Scope.ROOT;
  }

  isResources(): boolean {
    return this.scopeLevel === "resources";
  }

  isResourceMethodScope(): boolean {
    return Scope.RESOURCE_METHOD_SCOPES.includes(this.scopeLevel);
  }

  actionName(
    namePrefix: string | undefined,
    prefix: string | undefined,
    collectionName: string | undefined,
    memberName: string | undefined,
  ): Array<string | undefined> {
    switch (this.scopeLevel) {
      case "nested":
        return [namePrefix, prefix];
      case "collection":
        return [prefix, namePrefix, collectionName];
      case "new":
        return [prefix, "new", namePrefix, memberName];
      case "member":
        return [prefix, namePrefix, memberName];
      case "root":
        return [namePrefix, collectionName, prefix];
      default:
        return [namePrefix, memberName, prefix];
    }
  }

  isResourceScope(): boolean {
    return Scope.RESOURCE_SCOPES.includes(this.scopeLevel);
  }

  options(): readonly string[] {
    return Scope.OPTIONS;
  }

  new(hash: ScopeFrameHash): Scope {
    return new (this.constructor as typeof Scope)(hash, this, this.scopeLevel);
  }

  newLevel(level: ScopeLevel): Scope {
    return new (this.constructor as typeof Scope)(this.frame, this, level);
  }

  get(key: string): unknown {
    return this.frame[key];
  }

  get frame(): ScopeFrameHash {
    return this.hash;
  }

  declare findAll: (block: (node: Scope) => unknown) => Scope[];

  each(block: (node: Scope) => void): void {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let node: Scope = this;
    while (node !== Scope.ROOT) {
      block(node);
      node = node.parent!;
    }
  }

  static readonly ROOT: Scope = new Scope({}, null);
}

include(Scope, Enumerable);

export class Mapper {
  static BacktraceCleaner: typeof ActiveSupportBacktraceCleaner = class BacktraceCleaner extends ActiveSupportBacktraceCleaner {
    constructor() {
      super();
      this.removeSilencers();
      this.addCoreSilencer();
      this.addStdlibSilencer();
    }
  };

  static readonly URL_OPTIONS: readonly string[] = [
    "protocol",
    "subdomain",
    "domain",
    "host",
    "port",
  ];

  declare static routeSourceLocations: boolean;
  declare static backtraceCleaner: ActiveSupportBacktraceCleaner;

  static {
    cattrAccessor.call(this, "routeSourceLocations", { instanceAccessor: false, default: false });
    cattrAccessor.call(this, "backtraceCleaner", {
      instanceAccessor: false,
      default: new this.BacktraceCleaner(),
    });
  }

  static Scope = Scope;

  /** @internal */
  _concerns: Map<string, ConcernCallable> = new Map();
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

  get(...args: MapMethodArgs): this {
    return this.mapMethod("GET", args);
  }

  post(...args: MapMethodArgs): this {
    return this.mapMethod("POST", args);
  }

  put(...args: MapMethodArgs): this {
    return this.mapMethod("PUT", args);
  }

  patch(...args: MapMethodArgs): this {
    return this.mapMethod("PATCH", args);
  }

  delete(...args: MapMethodArgs): this {
    return this.mapMethod("DELETE", args);
  }

  root(path: string | RouteOptions | null, options: RouteOptions = {}): void {
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

  resources(...resources: Array<string | RouteOptions | MapperCallback>): this {
    const block = (typeof resources.at(-1) === "function" ? resources.pop() : undefined) as
      | MapperCallback
      | undefined;
    let options: RouteOptions = dup(extractOptionsBang(resources));

    if (this.applyCommonBehaviorFor("resources", resources as string[], options, block)) {
      return this;
    }

    this.withScopeLevel("resources", () => {
      options = this.applyActionOptions("resources", options);
      this.resourceScope(
        new Resource(
          resources.pop() as string,
          this.isApiOnly(),
          this._scope.get("shallow") as boolean,
          options,
        ),
        () => {
          if (block) block.call(this);

          if (options.concerns) this.concerns(options.concerns);

          this.collection(() => {
            if (this.parentResource()!.actions().includes("index")) this.get(":index");
            if (this.parentResource()!.actions().includes("create")) this.post(":create");
          });

          if (this.parentResource()!.actions().includes("new")) {
            this.new(() => {
              this.get(":new");
            });
          }

          this.setMemberMappingsForResource();
        },
      );
    });

    return this;
  }

  resource(...resources: Array<string | RouteOptions | MapperCallback>): this {
    const block = (typeof resources.at(-1) === "function" ? resources.pop() : undefined) as
      | MapperCallback
      | undefined;
    let options: RouteOptions = dup(extractOptionsBang(resources));

    if (this.applyCommonBehaviorFor("resource", resources as string[], options, block)) {
      return this;
    }

    this.withScopeLevel("resource", () => {
      options = this.applyActionOptions("resource", options);
      this.resourceScope(
        new SingletonResource(
          resources.pop() as string,
          this.isApiOnly(),
          this._scope.get("shallow") as boolean,
          options,
        ),
        () => {
          if (block) block.call(this);

          if (options.concerns) this.concerns(options.concerns);

          if (this.parentResource()!.actions().includes("new")) {
            this.new(() => {
              this.get(":new");
            });
          }

          this.setMemberMappingsForResource();

          if (this.parentResource()!.actions().includes("create")) {
            this.collection(() => {
              this.post(":create");
            });
          }
        },
      );
    });

    return this;
  }

  namespace(
    path: string,
    options: (ScopeOptions & { path?: string | null }) | MapperCallback = {},
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
    this._scope = this._scope.new(scope);
    try {
      cb.call(this);
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
          this.pathScope(this.parentResource()!.memberScope(), () => callback.call(this));
        });
      } else {
        this.pathScope(this.parentResource()!.memberScope(), () => callback.call(this));
      }
    });
  }

  collection(callback: MapperCallback): void {
    if (!this.isResourceScope()) {
      throw new ArgumentError("can't use collection outside resource(s) scope");
    }

    this.withScopeLevel("collection", () => {
      this.pathScope(this.parentResource()!.collectionScope(), () => callback.call(this));
    });
  }

  nested(callback: MapperCallback): void {
    if (!this.isResourceScope()) {
      throw new ArgumentError("can't use nested outside resource(s) scope");
    }

    this.withScopeLevel("nested", () => {
      if (this.isShallow() && this.shallowNestingDepth() >= 1) {
        this.shallowScope(() => {
          this.pathScope(this.parentResource()!.nestedScope(), () => {
            this.scope(this.nestedOptions(), callback);
          });
        });
      } else {
        this.pathScope(this.parentResource()!.nestedScope(), () => {
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
      this.pathScope(this.parentResource()!.newScope(this.actionPath("new")), () =>
        callback.call(this),
      );
    });
  }

  shallow(callback: MapperCallback): void {
    const previous = this._scope;
    this._scope = this._scope.new({ shallow: true });
    try {
      callback.call(this);
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

    if (path == null) {
      let msg =
        `Your router tried to #draw the external file ${name}.ts,\n` +
        "but the file was not found in:\n\n";
      msg += this._drawPaths.map((_path) => ` * ${_path}`).join("\n");
      throw new ArgumentError(msg);
    }

    const routePath = `${path}/${name}.ts`;
    const mod = (await import(p.pathToFileURL!(routePath).href)) as {
      drawRoutes?: DrawCallback;
    };
    mod.drawRoutes?.call(this);
  }

  /** @internal */
  setMemberMappingsForResource(): void {
    this.member(() => {
      if (this.parentResource()!.actions().includes("edit")) this.get(":edit");
      if (this.parentResource()!.actions().includes("show")) this.get(":show");
      if (this.parentResource()!.actions().includes("update")) {
        this.patch(":update");
        this.put(":update");
      }
      if (this.parentResource()!.actions().includes("destroy")) this.delete(":destroy");
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

  concern(name: string, callable: ConcernCallable | null = null, block?: ConcernBlock): void {
    callable ??= (mapper, options) => block!.call(mapper, options);
    this._concerns.set(name, callable);
  }

  concerns(...args: Array<string | string[] | Record<string, unknown>>): void {
    const options = extractOptionsBang(args);
    for (const name of args.flat(Infinity) as string[]) {
      const concern = this._concerns.get(name);
      if (concern != null) {
        callableOf(concern).call(concern, this, options);
      } else {
        throw new ArgumentError(`No concern named ${name} was found!`);
      }
    }
  }

  declare redirect: typeof Redirection.redirect;

  match(
    path: string | Record<string, unknown>,
    ...rest: (string | (RouteOptions & { via?: string | string[] }))[]
  ): void {
    let options: Record<string, unknown>;
    let paths: string[];
    if (rest.length === 0 && isPlainObject(path)) {
      options = path;
      let to: unknown;
      [path, to] = (Object.entries(options).find(([name, _value]) => !isSymbol(name)) ?? []) as [
        string,
        unknown,
      ];

      if (path == null) throw new ArgumentError("Route path not specified");

      if (isSymbol(to)) {
        options[":action"] = symbolToS(to);
      } else if (typeof to === "string") {
        if (to.includes("#")) {
          options[":to"] = to;
        } else {
          options[":controller"] = to;
        }
      } else {
        options[":to"] = to;
      }

      delete options[path];
      options = transformKeys(options, (name) =>
        isSymbol(name) ? camelize(symbolToS(name), false) : name,
      );
      paths = [path];
    } else {
      options = (rest.pop() as Record<string, unknown> | undefined) ?? {};
      paths = [path as string, ...(rest as string[])];
    }

    if ("defaults" in options) {
      const defaults = options.defaults as Record<string, string>;
      delete options.defaults;
      this.defaults(defaults, () => this.mapMatch(paths, options as RouteOptions));
    } else {
      this.mapMatch(paths, options as RouteOptions);
    }
  }

  options(...args: MapMethodArgs): this {
    return this.mapMethod("OPTIONS", args);
  }

  connect(...args: MapMethodArgs): this {
    return this.mapMethod(["GET", "CONNECT"], args);
  }

  /** @internal */
  mapMethod(method: string | string[], args: MapMethodArgs): this {
    const options = extractOptionsBang(args);
    options[args.length === 0 ? ":via" : "via"] = method;
    this.match(...(args as [string]), options as RouteOptions);
    return this;
  }

  controller(controller: string, callback: MapperCallback): void {
    const previous = this._scope;
    this._scope = this._scope.new({ controller });
    try {
      callback.call(this);
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
    this._scope = this._scope.new({ defaults: merged });
    try {
      callback.call(this);
    } finally {
      this._scope = previous;
    }
  }

  mount(app: MountableApp, options?: MountOptions | null): this;
  mount(app: Map<unknown, unknown>): this;
  mount(
    app: MountableApp | Map<unknown, unknown>,
    options: MountOptions | Map<unknown, unknown> | null = null,
  ): this {
    let path: string | null | undefined;
    if (options) {
      path = hashDelete(options, "at") as string | null;
    } else if (app instanceof Map) {
      options = app;
      [app, path] = ([...options].find(([k, _]) => rbObjRespondTo(k, "call")) ?? []) as [
        MountableApp,
        string,
      ];
      if (app) options.delete(app);
    }

    if (!rbObjRespondTo(app, "call")) {
      throw new ArgumentError("A rack application must be specified");
    }
    if (path == null) {
      throw new ArgumentError(
        "Must be called with mount point\n\n" +
          '  mount SomeRackApp, at: "some_route"\n' +
          "  or\n" +
          '  mount(SomeRackApp => "some_route")\n',
      );
    }

    const railsApp = this.isRailsApp(app);
    if (!rtest(hashAref(options!, "as"))) hashAset(options!, "as", this.appName(app, railsApp));

    const targetAs = this.nameForAction(hashAref(options!, "as") as string | null, path);
    if (!rtest(hashAref(options!, "via"))) hashAset(options!, "via", ":all");

    this.match(
      path,
      merge({ to: app as MountableApp, anchor: false, format: false }, options as RouteOptions),
    );

    if (railsApp) this.defineGeneratePrefix(app as RailsApp, targetAs!);
    return this;
  }

  /** @internal */
  isRailsApp(app: unknown): app is RailsApp {
    return (
      typeof app === "function" &&
      Object.getOwnPropertyDescriptor(app, "prototype")?.writable === false &&
      app.prototype instanceof TopLevel.Trails!.Trailtie
    );
  }

  /** @internal */
  appName(app: unknown, railsApp: boolean): string | undefined {
    if (railsApp) {
      return (app as RailsApp).railtieName();
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
  defineGeneratePrefix(app: RailsApp, name: string): void {
    const _route = this._set.namedRoutes.get(name) as JourneyRoute;
    const _routes = this._set;
    const _urlHelpers = this._set.urlHelpers();

    const scriptNamer = (options: Record<string, unknown>): string => {
      const prefixOptions = slice(options, ..._route.segmentKeys);
      if (options.originalScriptName != null && options.originalScriptName !== false) {
        prefixOptions.scriptName = "";
      }

      if (options._recall != null && options._recall !== false) {
        reverseMergeBang(
          prefixOptions,
          slice(options._recall as Record<string, unknown>, ..._route.segmentKeys),
        );
      }

      _route.segmentKeys.forEach((k) => delete options[k]);
      return rbFPublicSend(_urlHelpers, camelize(`${name}_path`, "lower"), prefixOptions) as string;
    };

    app.routes().defineMountedHelper(name, scriptNamer);

    extend(
      app.routes(),
      new Module((mod) => {
        mod.defineMethod("isOptimizeRoutesGeneration", () => false);

        mod.defineMethod(
          "findScriptName",
          function (this: RouteSet, options: Record<string, unknown>): string {
            if ("scriptName" in options && isPresent(options.scriptName)) {
              return mod.superMethod(this, "findScriptName")!(options) as string;
            } else {
              return scriptNamer(options);
            }
          },
        );
      }),
    );
  }

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

    let on;
    if ((on = options.on) != null && (on as unknown) !== false && !VALID_ON_OPTIONS.has(on)) {
      throw new ArgumentError(`Unknown scope :${on} given to :on`);
    }

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

    const pathTypes = groupBy(paths, (path) => (SYMBOL.test(path) ? "Symbol" : "String"));
    for (const _path of pathTypes.get("String") ?? []) {
      const routeOptions = { ...options };
      if (_path && optionPath) {
        throw new ArgumentError(
          "Ambiguous route definition. Both :path and the route path were specified as strings.",
        );
      }
      to = this.getToFromPath(_path, to, routeOptions.action);
      this.decomposedMatch(
        _path,
        controller,
        routeOptions,
        _path,
        to,
        via,
        formatted,
        anchor,
        optionsConstraints,
      );
    }

    for (const action of pathTypes.get("Symbol") ?? []) {
      const routeOptions = { ...options };
      this.decomposedMatch(
        action,
        controller,
        routeOptions,
        optionPath,
        to,
        via,
        formatted,
        anchor,
        optionsConstraints,
      );
    }
  }

  /** @internal */
  getToFromPath<T extends string | MountableApp | Redirect | undefined>(
    path: string,
    to: T,
    action: string | undefined,
  ): T | string | undefined {
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
    const on = hashDelete(options as Record<string, unknown>, "on") as string | null;
    if (on != null && (on as unknown) !== false) {
      rbFSend(this, on, recurse);
    } else {
      switch (this._scope.scopeLevel) {
        case "resources":
          this.nested(recurse);
          break;
        case "resource":
          this.member(recurse);
          break;
        default:
          this.addRoute(
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
      }
    }
  }

  /** @internal */
  matchRootRoute(options: RouteOptions & { via?: string | string[] } = {}): void {
    this.match("/", { as: "root", via: "GET", ...options });
  }

  direct(
    name: string,
    options: Record<string, unknown> = {},
    block: Parameters<RouteSet["addUrlHelper"]>[2],
  ): void {
    if (!this._scope.isRoot()) {
      throw new RuntimeError("The direct method can't be used inside a routes scope block");
    }

    this._set.addUrlHelper(name, options, block);
  }

  resolve(...args: unknown[]): void {
    if (!this._scope.isRoot()) {
      throw new RuntimeError("The resolve method can't be used inside a routes scope block");
    }

    const block = (typeof args.at(-1) === "function" ? args.pop() : undefined) as Parameters<
      RouteSet["addPolymorphicMapping"]
    >[2];
    const options = extractOptionsBang(args);
    args = args.flat(1);

    for (const klass of args as string[]) {
      this._set.addPolymorphicMapping(klass, options, block);
    }
  }

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

    action = SYMBOL.test(action!) ? symbolToS(action!) : String(action);

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

  private isShallow(): boolean {
    return !this.parentResource()!.isSingleton() && this._scope.get("shallow") === true;
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
  mergePathScope(parent: string | undefined, child: string | null): string {
    return Mapper.normalizePath(`${parent ?? ""}/${child ?? ""}`);
  }

  /** @internal */
  mergeShallowPathScope(parent: string | undefined, child: string | null): string {
    return Mapper.normalizePath(`${parent ?? ""}/${child ?? ""}`);
  }

  /** @internal */
  mergeAsScope(parent: string | undefined, child: string | null): string | null {
    return parent ? `${parent}_${child ?? ""}` : child;
  }

  /** @internal */
  mergeShallowPrefixScope(parent: string | undefined, child: string | null): string | null {
    return parent ? `${parent}_${child ?? ""}` : child;
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
  isCanonicalAction(action: string): boolean {
    return (
      this.isResourceMethodScope() &&
      CANONICAL_ACTIONS.includes(SYMBOL.test(action) ? symbolToS(action) : action)
    );
  }

  /** @internal */
  isParamConstraint(): boolean {
    const constraints = this._scope.get("constraints") as RouteConstraints | undefined;
    return constraints?.[this.parentResource()!.param] instanceof RegExp;
  }

  /** @internal */
  paramConstraint(): RouteConstraints[string] {
    return (this._scope.get("constraints") as RouteConstraints)[this.parentResource()!.param];
  }

  /** @internal */
  shallowNestingDepth(): number {
    return this._scope
      .findAll((node) => node.frame.scopeLevelResource)
      .filter((node) => (node.frame.scopeLevelResource as Resource).isShallow()).length;
  }

  /** @internal */
  pathForAction(action: string, path: string | undefined): string {
    const prefix = (this._scope.get("path") as string | undefined) ?? "";
    if (path != null) return `${prefix}/${path}`;
    if (this.isCanonicalAction(action)) {
      return prefix;
    } else {
      const actionPath = this.actionPath(action);
      return `${prefix}/${SYMBOL.test(actionPath) ? symbolToS(actionPath) : actionPath}`;
    }
  }

  /** @internal */
  prefixNameForAction(
    as: string | null | undefined,
    action: string | undefined,
  ): string | undefined {
    let prefix: string | undefined;
    if (as !== undefined && as !== null) prefix = as;
    else if (action && !this.isCanonicalAction(action)) prefix = action;
    if (prefix && prefix !== "/" && prefix.length > 0) {
      return Mapper.normalizeName(prefix.replace(/-/g, "_"));
    }
    return undefined;
  }

  /** @internal */
  nameForAction(as: string | null | undefined, action: string | undefined): string | undefined {
    const prefix = this.prefixNameForAction(as, action);
    const namePrefix = this._scope.get("as") as string | undefined;
    let collectionName: string | undefined;
    let memberName: string | undefined;

    if (this.parentResource()) {
      if (as == null && action == null) return undefined;

      collectionName = this.parentResource()!.collectionName();
      memberName = this.parentResource()!.memberName();
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
  pathScope<T>(path: string | null, fn: () => T): T {
    const previous = this._scope;
    const merged = this.mergePathScope(this._scope.get("path") as string | undefined, path);
    this._scope = this._scope.new({ path: merged });
    try {
      return fn();
    } finally {
      this._scope = previous;
    }
  }

  /** @internal */
  resourceScope<T>(resource: Resource, fn: () => T): T {
    const before = this._scope;
    this._scope = this._scope.new({ scopeLevelResource: resource });
    this._scope = this._scope.new({ controller: resource.resourceScope() });
    try {
      return fn();
    } finally {
      this._scope = before;
    }
  }

  /** @internal */
  shallowScope<T>(fn: () => T): T {
    const previous = this._scope;
    this._scope = this._scope.new({
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
  withDefaultScope(scope: ScopeOptions, block: DrawCallback): void {
    this.scope(scope, () => {
      block.call(this);
    });
  }

  /** @internal */
  parentResource(): Resource | undefined {
    return this._scope.get("scopeLevelResource") as Resource | undefined;
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
    return pathNames[SYMBOL.test(name) ? symbolToS(name) : name] ?? name;
  }

  /** @internal */
  nestedOptions(): ScopeOptions {
    const options: ScopeOptions = { as: this.parentResource()!.memberName() };
    if (this.isParamConstraint()) {
      options.constraints = {
        [this.parentResource()!.nestedParam()]: this.paramConstraint(),
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
    const self = this as unknown as Record<string, (...a: unknown[]) => unknown>;
    const blockArg = block ? [block] : [];

    if (resources.length > 1) {
      for (const r of resources) self[method](r, options, ...blockArg);
      return true;
    }
    if (options.shallow) {
      delete options.shallow;
      this.shallow(() => self[method](resources.pop()!, options, ...blockArg));
      return true;
    }
    if (this.isResourceScope()) {
      this.nested(() => self[method](resources.pop()!, options, ...blockArg));
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
      this.scope(scopeOptions, () => self[method](resources.pop()!, options, ...blockArg));
      return true;
    }
    return false;
  }
}

const CANONICAL_ACTIONS = ["index", "create", "new", "show", "update", "destroy"];

const POISON = {};

/** @noRailsEquivalent PERMANENT */
const SYMBOL = /^:\w+[?!=]?$/;

const VALID_ON_OPTIONS: ReadonlySet<string> = new Set(["new", "collection", "member"]);

include(Mapper, Redirection);

/** @noRailsEquivalent PERMANENT */
function deleteWithDefault<T>(hash: Record<string, unknown>, key: string, defaultValue: T): T {
  if (!(key in hash)) return defaultValue;
  const value = hash[key] as T;
  delete hash[key];
  return value;
}

interface ScopeOptions {
  as?: string | null;
  module?: string;
  shallowPath?: string | null;
  shallowPrefix?: string | null;
  [key: string]: unknown;
}

interface MountOptions extends RouteOptions {
  at?: string;
  via?: string | string[] | false | null;
}
