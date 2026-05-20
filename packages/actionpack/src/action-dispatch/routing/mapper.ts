/**
 * The routing DSL, mirroring ActionDispatch::Routing::Mapper.
 *
 * Usage:
 *   routeSet.draw((r) => {
 *     r.root("pages#home");
 *     r.get("/about", { to: "pages#about", as: "about" });
 *     r.resources("posts");
 *     r.namespace("admin", (r) => {
 *       r.resources("users");
 *     });
 *   });
 */

import {
  Route,
  type RouteOptions,
  type RouteConstraints,
  type ResourceAction,
  type RedirectFunction,
  type RedirectOptions,
} from "./route.js";
import { Scope, type ScopeLevel } from "./scope.js";
import { underscore } from "@blazetrails/activesupport";

type MapperCallback = (mapper: Mapper) => void;
type ConcernCallback = (mapper: Mapper) => void;

/** @internal */
interface ResourceLike {
  memberName?: string;
  collectionName?: string;
  nestedParam?: string;
  param?: string;
  resourceScope?: string;
  actions?: ResourceAction[];
  shallow?: () => boolean;
}

/** Resource-DSL options stripped before falling back to `scope()`. */
const RESOURCE_OPTIONS: ReadonlySet<string> = new Set([
  "as",
  "controller",
  "path",
  "only",
  "except",
  "param",
  "concerns",
]);

/** @internal Subset of `RouteSet` consumed by the {@link Mapper} constructor. */
interface RouteSetLike {
  resourcesPathNames?: Record<string, string>;
  drawPaths?: string[];
  defaultUrlOptions?: Record<string, unknown>;
}

export class Mapper {
  readonly routes: Route[] = [];
  private scopeStack: ScopeFrame[] = [];
  private concerns: Map<string, ConcernCallback> = new Map();
  private redirectFns: Map<string, RedirectFunction> = new Map();
  private redirectCounter = 0;
  /** @internal */
  _set: RouteSetLike | undefined;
  /** @internal */
  _drawPaths: string[];
  /** @internal */
  _scope: Scope;
  /** @internal */
  _apiOnly = false;
  /** @internal Local fallback when no RouteSet is attached. */
  private _defaultUrlOptions: Record<string, unknown> = {};

  /** Mirrors Rails `Mapper#initialize(set)`. The `set` is optional in trails. */
  constructor(set?: RouteSetLike) {
    this._set = set;
    this._drawPaths = set?.drawPaths ?? [];
    const pathNames = set?.resourcesPathNames ?? { new: "new", edit: "edit" };
    this._scope = new Scope({ pathNames }, Scope.ROOT, null);
  }

  /** Rails: `default_url_options=(options)`. */
  set defaultUrlOptions(options: Record<string, unknown>) {
    if (this._set) this._set.defaultUrlOptions = options;
    else this._defaultUrlOptions = options;
  }

  /** Rails: `alias_method :default_url_options, :default_url_options=`. */
  get defaultUrlOptions(): Record<string, unknown> {
    return this._set?.defaultUrlOptions ?? this._defaultUrlOptions;
  }

  // --- HTTP verb methods ---

  get(path: string, optionsOrEndpoint: RouteOptions | string = {}): void {
    this.addRoute("GET", path, normalizeOptions(optionsOrEndpoint));
  }

  post(path: string, optionsOrEndpoint: RouteOptions | string = {}): void {
    this.addRoute("POST", path, normalizeOptions(optionsOrEndpoint));
  }

  put(path: string, optionsOrEndpoint: RouteOptions | string = {}): void {
    this.addRoute("PUT", path, normalizeOptions(optionsOrEndpoint));
  }

  patch(path: string, optionsOrEndpoint: RouteOptions | string = {}): void {
    this.addRoute("PATCH", path, normalizeOptions(optionsOrEndpoint));
  }

  delete(path: string, optionsOrEndpoint: RouteOptions | string = {}): void {
    this.addRoute("DELETE", path, normalizeOptions(optionsOrEndpoint));
  }

  // --- root ---

  root(to: string): void {
    const [controller, action] = parseEndpoint(to);
    this.routes.push(
      new Route("GET", this.currentPrefix() + "/", controller, action, {
        name: this.prefixedName("root"),
      }),
    );
  }

  // --- resources ---

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

    const shallow = options.shallow || this.isShallow();
    const controllerPrefix = this.currentControllerPrefix();
    const controller = controllerPrefix ? `${controllerPrefix}/${name}` : name;
    const prefix = this.currentPrefix();
    const basePath = `${prefix}/${name}`;
    const singular = singularize(name);
    const namePrefix = this.currentNamePrefix();
    const routeName = (suffix: string) => (namePrefix ? `${namePrefix}_${suffix}` : suffix);

    // For shallow routes, member routes drop *parent resource* segments but
    // keep outer scope/namespace prefixes. Rails: shallow_path = path until
    // outermost resource.
    const shallowPrefix = shallow ? this.outerNonResourcePrefix() : prefix;
    const shallowPath = shallow ? `${shallowPrefix}/${name}` : basePath;
    const shallowName = (suffix: string) => (shallow ? suffix : routeName(suffix));

    const allowed = allowedActions(options, [
      "index",
      "show",
      "new",
      "create",
      "edit",
      "update",
      "destroy",
    ]);
    const scopeConstraints = this.currentScopeConstraints();
    const constraints = scopeConstraints
      ? { ...scopeConstraints, ...options.constraints }
      : options.constraints;
    const scopePathNames =
      (this._scope.get("pathNames") as Record<string, string> | undefined) ?? {};
    const pathNames = { ...scopePathNames, ...(options.pathNames ?? {}) };
    const newPath = pathNames.new ?? "new";
    const editPath = pathNames.edit ?? "edit";

    // Collection-level routes first (no :id param)
    if (allowed.has("index")) {
      this.routes.push(
        new Route("GET", basePath, controller, "index", {
          name: routeName(name),
        }),
      );
    }

    if (allowed.has("create")) {
      this.routes.push(new Route("POST", basePath, controller, "create"));
    }

    if (allowed.has("new")) {
      this.routes.push(
        new Route("GET", `${basePath}/${newPath}`, controller, "new", {
          name: routeName(`new_${singular}`),
        }),
      );
    }

    // Run callback (collection/member/nested routes) before member routes
    // so collection routes like /posts/search come before /posts/:id
    if (cb) {
      // Rename parent constraints from :id to :singular_id for nested routes
      const nestedConstraints: RouteConstraints = {};
      if (constraints?.id) {
        nestedConstraints[`${singular}_id`] = constraints.id;
      }
      this.scopeStack.push({
        path: basePath + `/:${singular}_id`,
        namePrefix: singular,
        controller: undefined,
        shallow,
        constraints: Object.keys(nestedConstraints).length > 0 ? nestedConstraints : undefined,
        memberPath: `${shallowPath}/:id`,
        resource: {
          memberName: singular,
          collectionName: name,
          nestedParam: `${singular}_id`,
          param: "id",
          resourceScope: controller,
          actions: Array.from(allowed) as ResourceAction[],
        },
        resourceController: controller,
        resourcePathNames: pathNames,
      });
      cb(this);
      this.scopeStack.pop();
    }

    // Member routes last (they have :id which would greedily match collection paths)
    if (allowed.has("show")) {
      this.routes.push(
        new Route("GET", `${shallowPath}/:id`, controller, "show", {
          name: shallowName(singular),
          constraints,
        }),
      );
    }

    if (allowed.has("edit")) {
      this.routes.push(
        new Route("GET", `${shallowPath}/:id/${editPath}`, controller, "edit", {
          name: shallowName(`edit_${singular}`),
          constraints,
        }),
      );
    }

    if (allowed.has("update")) {
      this.routes.push(
        new Route("PUT", `${shallowPath}/:id`, controller, "update", { constraints }),
      );
      this.routes.push(
        new Route("PATCH", `${shallowPath}/:id`, controller, "update", { constraints }),
      );
    }

    if (allowed.has("destroy")) {
      this.routes.push(
        new Route("DELETE", `${shallowPath}/:id`, controller, "destroy", { constraints }),
      );
    }
  }

  // --- resource (singular) ---

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

    const controllerPrefix = this.currentControllerPrefix();
    const rawController = pluralize(name);
    const controller = controllerPrefix ? `${controllerPrefix}/${rawController}` : rawController;
    const prefix = this.currentPrefix();
    const basePath = `${prefix}/${name}`;
    const namePrefix = this.currentNamePrefix();
    const routeName = (suffix: string) => (namePrefix ? `${namePrefix}_${suffix}` : suffix);

    const allowed = allowedActions(options, ["show", "new", "create", "edit", "update", "destroy"]);
    const scopePathNames =
      (this._scope.get("pathNames") as Record<string, string> | undefined) ?? {};
    const pathNames = { ...scopePathNames, ...(options.pathNames ?? {}) };
    const newPath = pathNames.new ?? "new";
    const editPath = pathNames.edit ?? "edit";

    if (allowed.has("new")) {
      this.routes.push(
        new Route("GET", `${basePath}/${newPath}`, controller, "new", {
          name: routeName(`new_${name}`),
        }),
      );
    }

    if (allowed.has("create")) {
      this.routes.push(new Route("POST", basePath, controller, "create"));
    }

    if (allowed.has("show")) {
      this.routes.push(
        new Route("GET", basePath, controller, "show", {
          name: routeName(name),
        }),
      );
    }

    if (allowed.has("edit")) {
      this.routes.push(
        new Route("GET", `${basePath}/${editPath}`, controller, "edit", {
          name: routeName(`edit_${name}`),
        }),
      );
    }

    if (allowed.has("update")) {
      this.routes.push(new Route("PUT", basePath, controller, "update"));
      this.routes.push(new Route("PATCH", basePath, controller, "update"));
    }

    if (allowed.has("destroy")) {
      this.routes.push(new Route("DELETE", basePath, controller, "destroy"));
    }

    if (cb) {
      this.scopeStack.push({
        path: basePath,
        namePrefix: name,
        controller: undefined,
        memberPath: basePath,
        resource: {
          memberName: name,
          collectionName: pluralize(name),
          param: "id",
          resourceScope: controller,
          actions: Array.from(allowed) as ResourceAction[],
        },
        resourceController: controller,
        resourcePathNames: pathNames,
      });
      cb(this);
      this.scopeStack.pop();
    }
  }

  // --- namespace ---

  namespace(name: string, callback: MapperCallback): void {
    this.scopeStack.push({
      path: this.currentPrefix() + "/" + name,
      namePrefix: name,
      controller: name,
    });
    callback(this);
    this.scopeStack.pop();
  }

  // --- scope ---

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

    const prefix = path
      ? this.currentPrefix() + "/" + path.replace(/^\/+/, "")
      : this.currentPrefix();

    this.scopeStack.push({
      path: prefix,
      namePrefix: options.as,
      controller: options.module,
    });
    cb(this);
    this.scopeStack.pop();
  }

  // --- member / collection ---

  member(callback: MapperCallback): void {
    // Use the memberPath (with :id) if we're inside a resources scope
    const frame = this.scopeStack[this.scopeStack.length - 1];
    if (frame?.memberPath) {
      const saved = frame.path;
      frame.path = frame.memberPath;
      callback(this);
      frame.path = saved;
    } else {
      callback(this);
    }
  }

  collection(callback: MapperCallback): void {
    const current = this.currentPrefix();
    // Strip /:id or /:singular_id from end to get collection path
    const collectionPath = current.replace(/\/:[^/]+$/, "");
    this.scopeStack.push({
      path: collectionPath,
      namePrefix: undefined,
      controller: undefined,
    });
    callback(this);
    this.scopeStack.pop();
  }

  /** Rails: `nested(&block)`. Wraps `block` in a nested resource scope. */
  nested(callback: MapperCallback): void {
    if (!this.isResourceScope()) {
      throw new Error("can't use nested outside resource(s) scope");
    }
    this.withScopeLevel("nested", () => {
      // Only enter shallowScope if Rails-style shallow keys have been
      // populated; trails resources() currently tracks path nesting via
      // scopeStack rather than _scope.shallowPath/Prefix, so the
      // shallowScope branch would otherwise clobber as/path with undefined.
      const shallowKeysSet =
        this._scope.get("shallowPath") !== undefined ||
        this._scope.get("shallowPrefix") !== undefined;
      if (shallowKeysSet && this.isShallow() && this.shallowNestingDepth() >= 1) {
        this.shallowScope(() => callback(this));
      } else {
        callback(this);
      }
    });
  }

  /**
   * Rails: `shallow(&block)`. Pushes a `shallow: true` scope so nested
   * `resources` inside use shallow path/name conventions. The current
   * prefix is preserved — Rails clones the scope hash, which keeps `:path`
   * unchanged.
   */
  shallow(callback: MapperCallback): void {
    this.scopeStack.push({
      path: this.currentPrefix(),
      namePrefix: undefined,
      controller: undefined,
      shallow: true,
    });
    try {
      callback(this);
    } finally {
      this.scopeStack.pop();
    }
  }

  /**
   * Rails: `draw(name)`. Loads `config/routes/<name>.rb` and evaluates it
   * in the current Mapper context. The file-loading form is Ruby-specific
   * (`instance_eval(File.read…)`); in trails, pass a callback that receives
   * this Mapper instead. Passing a string throws — file-based draw is not
   * supported.
   */
  draw(nameOrCallback: string | MapperCallback): void {
    if (typeof nameOrCallback === "function") {
      nameOrCallback(this);
      return;
    }
    throw new Error(
      `Mapper#draw(${JSON.stringify(nameOrCallback)}): file-based draw is not supported in trails. ` +
        "Pass a callback (mapper) => void with the route definitions, or import and invoke a routes module directly.",
    );
  }

  /**
   * Rails: `set_member_mappings_for_resource`. Inside a `member { … }` block,
   * adds the standard member verb mappings (`edit`, `show`, `update`,
   * `destroy`) when the parent resource's `actions` allows them.
   *
   * @internal
   */
  setMemberMappingsForResource(): void {
    const parent = this.parentResource();
    if (!parent) return;
    const actions = parent.actions ?? [];
    // Find the active resource frame for the canonical member path + controller.
    const frame = [...this.scopeStack].reverse().find((f) => f.resource === parent);
    const memberPath = frame?.memberPath ?? this.currentPrefix();
    const controller = frame?.resourceController ?? "";
    const editPath = frame?.resourcePathNames?.edit ?? this.actionPath("edit");
    if (actions.includes("edit")) {
      this.routes.push(new Route("GET", `${memberPath}/${editPath}`, controller, "edit"));
    }
    if (actions.includes("show")) {
      this.routes.push(new Route("GET", memberPath, controller, "show"));
    }
    if (actions.includes("update")) {
      this.routes.push(new Route("PATCH", memberPath, controller, "update"));
      this.routes.push(new Route("PUT", memberPath, controller, "update"));
    }
    if (actions.includes("destroy")) {
      this.routes.push(new Route("DELETE", memberPath, controller, "destroy"));
    }
  }

  // --- constraints block ---

  constraints(
    constraintsOrCallback: RouteOptions["constraints"] | MapperCallback,
    callback?: MapperCallback,
  ): void {
    if (typeof constraintsOrCallback === "function") {
      constraintsOrCallback(this);
    } else {
      // Store constraints in scope for nested routes
      // For now, just execute the callback
      callback?.(this);
    }
  }

  // --- concern / concerns ---

  concern(name: string, callback: ConcernCallback): void {
    this.concerns.set(name, callback);
  }

  useConcerns(...names: string[]): void {
    for (const name of names) {
      const cb = this.concerns.get(name);
      if (cb) cb(this);
    }
  }

  // --- redirect ---

  redirect(target: string | RedirectOptions | RedirectFunction): string {
    if (typeof target === "function") {
      const id = `__redirect_fn__:${this.redirectCounter++}`;
      this.redirectFns.set(id, target);
      return id;
    }
    return `__redirect__:${typeof target === "string" ? target : JSON.stringify(target)}`;
  }

  // --- match (low-level) ---

  match(path: string, options: RouteOptions & { via?: string | string[] } = {}): void {
    const methods = options.via
      ? Array.isArray(options.via)
        ? options.via
        : [options.via]
      : ["ALL"];

    for (const method of methods) {
      this.addRoute(method, path, options);
    }
  }

  // --- HTTP helper extras ---

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

  /**
   * Mirrors Rails `Scoping#controller(controller)` — pushes a `_scope` frame
   * setting the controller name. Does NOT push onto `scopeStack`: that stack's
   * `controller` field is a *module/namespace prefix* (used by `namespace`),
   * whereas `controller(...)` overrides the controller name directly.
   */
  controller(controllerName: string, callback: MapperCallback): void {
    const previous = this._scope;
    this._scope = this._scope.newChild({ controller: controllerName });
    try {
      callback(this);
    } finally {
      this._scope = previous;
    }
  }

  defaults(defaultsHash: Record<string, string>, callback: MapperCallback): void {
    const previous = this._scope;
    const merged = this.mergeDefaultsScope(
      this._scope.get("defaults") as Record<string, string> | undefined,
      defaultsHash,
    );
    this._scope = this._scope.newChild({ defaults: merged });
    try {
      callback(this);
    } finally {
      this._scope = previous;
    }
  }

  // --- mount ---

  mount(app: MountableApp, options: MountOptions = {}): void {
    const path = options.at;
    if (typeof (app as { call?: unknown })?.call !== "function") {
      throw new Error("A rack application must be specified");
    }
    if (!path) {
      throw new Error("Must be called with mount point: mount(SomeRackApp, { at: '/path' })");
    }
    const railsApp = this.isRailsApp(app);
    const asName = options.as ?? this.appName(app, railsApp);
    const matchOpts: RouteOptions & { via?: string | string[]; at?: string } = {
      ...options,
      via: options.via ?? "ALL",
      anchor: false,
      format: false,
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
    }
    if (typeof app === "function") {
      const name = (app as { name?: string }).name;
      if (!name) return undefined;
      // Rails: ActiveSupport::Inflector.underscore(class_name).tr("/", "_")
      return underscore(name).replace(/\//g, "_");
    }
    return undefined;
  }

  /**
   * Records a `scriptNamer` for a mounted Rails engine so the engine's URL
   * helpers can prefix generated paths with the mount point. Mirrors Rails'
   * `define_generate_prefix(app, name)` registration step. Option keys
   * (`scriptName`, `originalScriptName`) follow the project-wide camelCase
   * convention (see CLAUDE.md); Rails' `:script_name` / `:original_script_name`
   * are the same value under their Ruby-side names.
   *
   * @internal
   */
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

  // --- match privates (decomposition pipeline) ---

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
    if (options.on !== undefined && !VALID_ON_OPTIONS.has(options.on)) {
      throw new Error(`Unknown scope ${options.on} given to :on`);
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
    const viaIn = options.via ?? (this._scope.get("via") as string | string[] | undefined) ?? "ALL";
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
      to = this.getToFromPath(p, to, routeOptions.action);
      this.decomposedMatch(
        p,
        controller,
        routeOptions,
        optionPath,
        to,
        viaIn,
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
    controller: string | undefined,
    options: RouteOptions & { on?: string },
    optionPath: string | undefined,
    to: string | undefined,
    via: string | string[],
    _formatted: boolean | undefined,
    _anchor: boolean,
    optionsConstraints: RouteConstraints,
  ): void {
    const recurse = () =>
      this.decomposedMatch(
        path,
        controller,
        options,
        optionPath,
        to,
        via,
        _formatted,
        _anchor,
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
    if (this._scope.scopeLevel === "resources") return this.withScopeLevel("nested", recurse);
    if (this._scope.scopeLevel === "resource") return this.member(recurse);
    const merged: RouteOptions & { via?: string | string[] } = { ...options, via };
    const mergedConstraints = { ...(optionsConstraints ?? {}), ...(options.constraints ?? {}) };
    if (Object.keys(mergedConstraints).length > 0) merged.constraints = mergedConstraints;
    if (to) merged.to = to;
    if (controller && !merged.to) merged.controller = controller;
    this.match(optionPath ?? path, merged);
  }

  /** @internal */
  matchRootRoute(options: RouteOptions & { via?: string | string[] } = {}): void {
    this.match("/", { as: "root", via: "GET", ...options });
  }

  // --- direct / resolve ---

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
    for (const klass of (args as unknown[]).flat()) {
      this._polymorphicMappings.set(String(klass), { options, block });
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

  // --- internals ---

  private addRoute(verb: string, path: string, options: RouteOptions): void {
    const fullPath = this.currentPrefix() + "/" + path.replace(/^\/+/, "");
    // Apply _scope controller/action/to defaults set via controller(...)/defaults(...)/scope(...).
    // Mirrors mapper.rb:1972-1980: scope[:to] and scope[:controller]+scope[:action] feed options[:to].
    const scopeTo = this._scope.get("to") as string | undefined;
    const scopeController = this._scope.get("controller") as string | undefined;
    const scopeAction = this._scope.get("action") as string | undefined;
    const effectiveTo =
      options.to ??
      scopeTo ??
      (scopeController && scopeAction ? `${scopeController}#${scopeAction}` : undefined);
    const effectiveController = options.controller ?? scopeController;
    const endpoint =
      effectiveTo ?? `${effectiveController ?? ""}#${options.action ?? scopeAction ?? ""}`;
    // Prepend controller module from scope stack (namespace support)
    const scopeModulePrefix = this.currentControllerPrefix();

    // Check if endpoint is a redirect
    let redirectTarget: string | RedirectOptions | RedirectFunction | undefined;
    if (typeof endpoint === "string" && endpoint.startsWith("__redirect_fn__:")) {
      redirectTarget = this.redirectFns.get(endpoint);
    } else if (typeof endpoint === "string" && endpoint.startsWith("__redirect__:")) {
      const redirectStr = endpoint.slice("__redirect__:".length);
      try {
        redirectTarget = JSON.parse(redirectStr);
      } catch {
        redirectTarget = redirectStr;
      }
    }
    if (options.redirect) {
      redirectTarget = options.redirect;
    }

    const [parsedController, action] = redirectTarget ? ["", ""] : parseEndpoint(endpoint);
    let controller = parsedController;
    if (scopeModulePrefix && controller && !controller.includes("/")) {
      controller = scopeModulePrefix + "/" + controller;
    }
    const name = options.as ?? options.name;
    const namePrefix = this.currentNamePrefix();
    const fullName = name ? (namePrefix ? `${namePrefix}_${name}` : name) : undefined;

    // Merge scope defaults (set via the `defaults(...)` DSL) under per-call defaults.
    const scopeDefaults = this._scope.get("defaults") as Record<string, string> | undefined;
    const mergedDefaults =
      scopeDefaults || options.defaults
        ? { ...(scopeDefaults ?? {}), ...(options.defaults ?? {}) }
        : undefined;

    this.routes.push(
      new Route(verb, fullPath, controller, action, {
        ...options,
        name: fullName,
        redirect: redirectTarget,
        defaults: mergedDefaults,
      }),
    );
  }

  private currentPrefix(): string {
    if (this.scopeStack.length === 0) return "";
    return this.scopeStack[this.scopeStack.length - 1].path;
  }

  /**
   * Path contributed by the outermost non-resource scope frames (namespaces,
   * scopes) — used to compute the shallow base path so it preserves
   * `/admin` etc. but drops parent-resource `/:user_id` segments.
   *
   * @internal
   */
  private outerNonResourcePrefix(): string {
    // Walk bottom-up to find the deepest non-resource frame that comes
    // *before* the outermost resource frame. A `scope(...)` opened
    // inside a resource (e.g. `resources('posts') { scope('/foo') {…} }`)
    // is NOT outer — its path already contains the parent-resource
    // segments shallow routing is meant to drop. Shallow-marker frames
    // carry no real path contribution; they snapshot currentPrefix()
    // only to keep `member()` from resetting it.
    let last = "";
    for (const f of this.scopeStack) {
      if (f.resource) return last;
      if (f.shallow) continue;
      last = f.path;
    }
    return last;
  }

  private prefixedName(name: string): string {
    const prefix = this.currentNamePrefix();
    return prefix ? `${prefix}_${name}` : name;
  }

  private isShallow(): boolean {
    return this.scopeStack.some((f) => f.shallow);
  }

  private currentNamePrefix(): string | undefined {
    const parts = this.scopeStack.map((f) => f.namePrefix).filter(Boolean) as string[];
    return parts.length > 0 ? parts.join("_") : undefined;
  }

  private currentControllerPrefix(): string | undefined {
    const parts = this.scopeStack.map((f) => f.controller).filter(Boolean) as string[];
    return parts.length > 0 ? parts.join("/") : undefined;
  }

  private currentScopeConstraints(): RouteConstraints | undefined {
    const merged: RouteConstraints = {};
    let any = false;
    for (const frame of this.scopeStack) {
      if (frame.constraints) {
        Object.assign(merged, frame.constraints);
        any = true;
      }
    }
    return any ? merged : undefined;
  }

  /**
   * Normalize a path by collapsing duplicate slashes and re-ordering optional
   * segments so a fully optional path evaluates to `/` when all options are
   * absent.
   *
   * @internal
   */
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

  // --- Rails-private scope merge helpers ---
  // These mirror ActionDispatch::Routing::Mapper::Scoping private methods.
  // Each one combines a parent scope value with a child scope value.

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
  mergeBlocksScope(
    parent: MapperCallback[] | undefined,
    child: MapperCallback | undefined,
  ): MapperCallback[] {
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

  // --- Rails-private scope/action predicates ---

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
    return this.scopeStack.some((f) => f.memberPath !== undefined);
  }

  /** @internal */
  isNestedScope(): boolean {
    return this.scopeStack.length > 1;
  }

  /** @internal */
  canonicalAction(action: string): boolean {
    return CANONICAL_ACTIONS.includes(action);
  }

  /** @internal */
  isParamConstraint(): boolean {
    const c = this.currentScopeConstraints();
    return Boolean(c && c.id instanceof RegExp);
  }

  /** @internal */
  paramConstraint(): RegExp | undefined {
    const c = this.currentScopeConstraints();
    return c?.id instanceof RegExp ? c.id : undefined;
  }

  /** @internal */
  shallowNestingDepth(): number {
    return this.scopeStack.filter((f) => f.shallow).length;
  }

  /** @internal */
  pathForAction(action: string, path: string | undefined): string {
    const prefix = this.currentPrefix();
    if (path) return `${prefix}/${path}`;
    if (this.canonicalAction(action)) return prefix;
    return `${prefix}/${action}`;
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
    const namePrefix = this.currentNamePrefix();
    const parts = [namePrefix, prefix].filter((p): p is string => Boolean(p));
    const candidate = parts.join("_");
    if (!candidate) return undefined;
    if (as === undefined) {
      if (!/^[_a-z]/i.test(candidate) || this.hasNamedRoute(candidate)) return undefined;
    }
    return candidate;
  }

  /** @internal */
  hasNamedRoute(name: string): boolean {
    return this.routes.some((r) => r.name === name);
  }

  // --- Rails-private scope-chain helpers (mapper.rb privates) ---

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

  /**
   * Mirrors `resource_scope(resource, &block)`: pushes `scopeLevelResource`,
   * then wraps in `controller(resource.resourceScope, &block)` (which Rails
   * implements as a `{controller: …}` scope).
   *
   * @internal
   */
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
  withDefaultScope(scopeOptions: ScopeOptions, callback: MapperCallback): void {
    this.scope(scopeOptions, callback);
  }

  /** @internal */
  parentResource(): ResourceLike | undefined {
    for (let i = this.scopeStack.length - 1; i >= 0; i--) {
      const r = this.scopeStack[i].resource;
      if (r) return r;
    }
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
  nestedOptions(): { as?: string; constraints?: RouteConstraints } {
    const parent = this.parentResource();
    const options: { as?: string; constraints?: RouteConstraints } = { as: parent?.memberName };
    if (this.isParamConstraint() && parent?.nestedParam) {
      const c = this.paramConstraint();
      if (c) options.constraints = { [parent.nestedParam]: c };
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

  /**
   * Mirrors `apply_common_behavior_for`: short-circuits multi-resource
   * splat, shallow unwrap, nested resource-scope, and scope-options unwrap.
   * Returns `true` if handled, `false` otherwise.
   *
   * @internal
   */
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
      // Rails calls the public `shallow do…end` DSL here, which just sets
      // `shallow: true` on the scope (mapper.rb:1635). The private
      // `shallow_scope` (path/as swap) runs later during resource emission.
      const beforeShallow = this._scope;
      this._scope = this._scope.newChild({ shallow: true });
      try {
        dispatch(resources.pop()!, options, block);
      } finally {
        this._scope = beforeShallow;
      }
      return true;
    }
    if (this._scope.isResourceScope()) {
      this.withScopeLevel("nested", () => dispatch(resources.pop()!, options, block));
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

/** Rails `VALID_ON_OPTIONS = [:new, :collection, :member]` (mapper.rb:1160). */
const VALID_ON_OPTIONS: ReadonlySet<string> = new Set(["new", "collection", "member"]);

interface ScopeFrame {
  path: string;
  namePrefix?: string;
  controller?: string;
  shallow?: boolean;
  constraints?: RouteConstraints;
  memberPath?: string;
  /** Snapshot of the active resource (Rails: `@scope[:scope_level_resource]`). */
  resource?: ResourceLike;
  /** Controller for member-route emission (Rails: resource_scope controller). */
  resourceController?: string;
  /** Merged pathNames (scope + options) for this resource frame. */
  resourcePathNames?: Record<string, string>;
}

interface ScopeOptions {
  as?: string;
  module?: string;
}

type MountableApp = ((...args: unknown[]) => unknown) | { call: (...args: unknown[]) => unknown };

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

/** Normalize a string shorthand ("controller#action") to RouteOptions. */
function normalizeOptions(optionsOrEndpoint: RouteOptions | string): RouteOptions {
  if (typeof optionsOrEndpoint === "string") {
    return { to: optionsOrEndpoint };
  }
  return optionsOrEndpoint;
}

function parseEndpoint(endpoint: string): [string, string] {
  const parts = endpoint.split("#");
  return [parts[0] || "", parts[1] || ""];
}

/** Naive singularize — handles common English plurals. */
function singularize(word: string): string {
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.endsWith("ses") || word.endsWith("xes") || word.endsWith("zes"))
    return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/** Naive pluralize. */
function pluralize(word: string): string {
  if (word.endsWith("y") && !/[aeiou]y$/.test(word)) return word.slice(0, -1) + "ies";
  if (word.endsWith("s") || word.endsWith("x") || word.endsWith("z")) return word + "es";
  return word + "s";
}
