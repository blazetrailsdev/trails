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

type MapperCallback = (mapper: Mapper) => void;
type ConcernCallback = (mapper: Mapper) => void;

export class Mapper {
  readonly routes: Route[] = [];
  private scopeStack: ScopeFrame[] = [];
  private concerns: Map<string, ConcernCallback> = new Map();
  private redirectFns: Map<string, RedirectFunction> = new Map();
  private redirectCounter = 0;

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

    // For shallow routes, member routes use un-nested paths
    const shallowPath = shallow ? `/${name}` : basePath;
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
    const pathNames = options.pathNames ?? {};
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
        memberPath: basePath + "/:id",
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
    const pathNames = options.pathNames ?? {};
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

  // --- internals ---

  private addRoute(verb: string, path: string, options: RouteOptions): void {
    const fullPath = this.currentPrefix() + "/" + path.replace(/^\/+/, "");
    const endpoint = options.to ?? `${options.controller ?? ""}#${options.action ?? ""}`;
    // Prepend controller module from scope stack (namespace support)
    const scopeController = this.currentControllerPrefix();

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
    if (scopeController && controller && !controller.includes("/")) {
      controller = scopeController + "/" + controller;
    }
    const name = options.as ?? options.name;
    const namePrefix = this.currentNamePrefix();
    const fullName = name ? (namePrefix ? `${namePrefix}_${name}` : name) : undefined;

    this.routes.push(
      new Route(verb, fullPath, controller, action, {
        ...options,
        name: fullName,
        redirect: redirectTarget,
      }),
    );
  }

  private currentPrefix(): string {
    if (this.scopeStack.length === 0) return "";
    return this.scopeStack[this.scopeStack.length - 1].path;
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
}

const CANONICAL_ACTIONS = ["index", "create", "new", "show", "update", "destroy"];

interface ScopeFrame {
  path: string;
  namePrefix?: string;
  controller?: string;
  shallow?: boolean;
  constraints?: RouteConstraints;
  memberPath?: string;
}

interface ScopeOptions {
  as?: string;
  module?: string;
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
