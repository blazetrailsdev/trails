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

import { Route, type RouteOptions, type ResourceAction, type RedirectFunction, type RedirectOptions } from "./route.js";

type MapperCallback = (mapper: Mapper) => void;
type ConcernCallback = (mapper: Mapper) => void;

export class Mapper {
  readonly routes: Route[] = [];
  private scopeStack: ScopeFrame[] = [];
  private concerns: Map<string, ConcernCallback> = new Map();
  private redirectFns: Map<string, RedirectFunction> = new Map();
  private redirectCounter = 0;

  // --- HTTP verb methods ---

  get(path: string, options: RouteOptions = {}): void {
    this.addRoute("GET", path, options);
  }

  post(path: string, options: RouteOptions = {}): void {
    this.addRoute("POST", path, options);
  }

  put(path: string, options: RouteOptions = {}): void {
    this.addRoute("PUT", path, options);
  }

  patch(path: string, options: RouteOptions = {}): void {
    this.addRoute("PATCH", path, options);
  }

  delete(path: string, options: RouteOptions = {}): void {
    this.addRoute("DELETE", path, options);
  }

  // --- root ---

  root(to: string): void {
    const [controller, action] = parseEndpoint(to);
    this.routes.push(
      new Route("GET", this.currentPrefix() + "/", controller, action, {
        name: this.prefixedName("root"),
      })
    );
  }

  // --- resources ---

  resources(name: string, optionsOrCallback?: RouteOptions | MapperCallback, callback?: MapperCallback): void {
    let options: RouteOptions = {};
    let cb: MapperCallback | undefined;

    if (typeof optionsOrCallback === "function") {
      cb = optionsOrCallback;
    } else if (optionsOrCallback) {
      options = optionsOrCallback;
      cb = callback;
    }

    const shallow = options.shallow || this.isShallow();
    const controller = name;
    const prefix = this.currentPrefix();
    const basePath = `${prefix}/${name}`;
    const singular = singularize(name);
    const namePrefix = this.currentNamePrefix();
    const routeName = (suffix: string) =>
      namePrefix ? `${namePrefix}_${suffix}` : suffix;

    // For shallow routes, member routes use un-nested paths
    const shallowPath = shallow ? `/${name}` : basePath;
    const shallowName = (suffix: string) => shallow ? suffix : routeName(suffix);

    const allowed = allowedActions(options, ["index", "show", "new", "create", "edit", "update", "destroy"]);
    const constraints = options.constraints;
    const pathNames = options.pathNames ?? {};
    const newPath = pathNames.new ?? "new";
    const editPath = pathNames.edit ?? "edit";

    if (allowed.has("index")) {
      this.routes.push(
        new Route("GET", basePath, controller, "index", {
          name: routeName(name),
        })
      );
    }

    if (allowed.has("create")) {
      this.routes.push(
        new Route("POST", basePath, controller, "create")
      );
    }

    if (allowed.has("new")) {
      this.routes.push(
        new Route("GET", `${basePath}/${newPath}`, controller, "new", {
          name: routeName(`new_${singular}`),
        })
      );
    }

    if (allowed.has("show")) {
      this.routes.push(
        new Route("GET", `${shallowPath}/:id`, controller, "show", {
          name: shallowName(singular),
          constraints,
        })
      );
    }

    if (allowed.has("edit")) {
      this.routes.push(
        new Route("GET", `${shallowPath}/:id/${editPath}`, controller, "edit", {
          name: shallowName(`edit_${singular}`),
          constraints,
        })
      );
    }

    if (allowed.has("update")) {
      this.routes.push(
        new Route("PUT", `${shallowPath}/:id`, controller, "update", { constraints })
      );
      this.routes.push(
        new Route("PATCH", `${shallowPath}/:id`, controller, "update", { constraints })
      );
    }

    if (allowed.has("destroy")) {
      this.routes.push(
        new Route("DELETE", `${shallowPath}/:id`, controller, "destroy", { constraints })
      );
    }

    if (cb) {
      this.scopeStack.push({
        path: basePath + "/:id",
        namePrefix: singular,
        controller: undefined,
        shallow,
      });
      cb(this);
      this.scopeStack.pop();
    }
  }

  // --- resource (singular) ---

  resource(name: string, optionsOrCallback?: RouteOptions | MapperCallback, callback?: MapperCallback): void {
    let options: RouteOptions = {};
    let cb: MapperCallback | undefined;

    if (typeof optionsOrCallback === "function") {
      cb = optionsOrCallback;
    } else if (optionsOrCallback) {
      options = optionsOrCallback;
      cb = callback;
    }

    const controller = pluralize(name);
    const prefix = this.currentPrefix();
    const basePath = `${prefix}/${name}`;
    const namePrefix = this.currentNamePrefix();
    const routeName = (suffix: string) =>
      namePrefix ? `${namePrefix}_${suffix}` : suffix;

    const allowed = allowedActions(options, ["show", "new", "create", "edit", "update", "destroy"]);
    const pathNames = options.pathNames ?? {};
    const newPath = pathNames.new ?? "new";
    const editPath = pathNames.edit ?? "edit";

    if (allowed.has("new")) {
      this.routes.push(
        new Route("GET", `${basePath}/${newPath}`, controller, "new", {
          name: routeName(`new_${name}`),
        })
      );
    }

    if (allowed.has("create")) {
      this.routes.push(
        new Route("POST", basePath, controller, "create")
      );
    }

    if (allowed.has("show")) {
      this.routes.push(
        new Route("GET", basePath, controller, "show", {
          name: routeName(name),
        })
      );
    }

    if (allowed.has("edit")) {
      this.routes.push(
        new Route("GET", `${basePath}/${editPath}`, controller, "edit", {
          name: routeName(`edit_${name}`),
        })
      );
    }

    if (allowed.has("update")) {
      this.routes.push(
        new Route("PUT", basePath, controller, "update")
      );
      this.routes.push(
        new Route("PATCH", basePath, controller, "update")
      );
    }

    if (allowed.has("destroy")) {
      this.routes.push(
        new Route("DELETE", basePath, controller, "destroy")
      );
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

  scope(pathOrOptions: string | ScopeOptions, callbackOrOptions?: MapperCallback | ScopeOptions, callback?: MapperCallback): void {
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
    callback(this);
  }

  collection(callback: MapperCallback): void {
    const current = this.currentPrefix();
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

  constraints(constraintsOrCallback: RouteOptions["constraints"] | MapperCallback, callback?: MapperCallback): void {
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
      ? Array.isArray(options.via) ? options.via : [options.via]
      : ["ALL"];

    for (const method of methods) {
      this.addRoute(method, path, options);
    }
  }

  // --- internals ---

  private addRoute(verb: string, path: string, options: RouteOptions): void {
    const fullPath = this.currentPrefix() + "/" + path.replace(/^\/+/, "");
    const endpoint = options.to ?? `${options.controller ?? ""}#${options.action ?? ""}`;

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

    const [controller, action] = redirectTarget ? ["", ""] : parseEndpoint(endpoint);
    const name = options.as ?? options.name;
    const namePrefix = this.currentNamePrefix();
    const fullName = name
      ? namePrefix
        ? `${namePrefix}_${name}`
        : name
      : undefined;

    this.routes.push(
      new Route(verb, fullPath, controller, action, {
        ...options,
        name: fullName,
        redirect: redirectTarget,
      })
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
    const parts = this.scopeStack
      .map((f) => f.namePrefix)
      .filter(Boolean) as string[];
    return parts.length > 0 ? parts.join("_") : undefined;
  }
}

interface ScopeFrame {
  path: string;
  namePrefix?: string;
  controller?: string;
  shallow?: boolean;
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
  if (word.endsWith("y") && !/[aeiou]y$/.test(word))
    return word.slice(0, -1) + "ies";
  if (word.endsWith("s") || word.endsWith("x") || word.endsWith("z"))
    return word + "es";
  return word + "s";
}
