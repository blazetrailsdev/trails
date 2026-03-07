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

import { Route, type RouteOptions } from "./route.js";

type MapperCallback = (mapper: Mapper) => void;

export class Mapper {
  readonly routes: Route[] = [];
  private scopeStack: ScopeFrame[] = [];

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

    const controller = name;
    const prefix = this.currentPrefix();
    const basePath = `${prefix}/${name}`;
    const singular = singularize(name);
    const namePrefix = this.currentNamePrefix();
    const routeName = (suffix: string) =>
      namePrefix ? `${namePrefix}_${suffix}` : suffix;

    // index
    this.routes.push(
      new Route("GET", basePath, controller, "index", {
        name: routeName(name),
      })
    );

    // create
    this.routes.push(
      new Route("POST", basePath, controller, "create")
    );

    // new
    this.routes.push(
      new Route("GET", `${basePath}/new`, controller, "new", {
        name: routeName(`new_${singular}`),
      })
    );

    // show
    this.routes.push(
      new Route("GET", `${basePath}/:id`, controller, "show", {
        name: routeName(singular),
      })
    );

    // edit
    this.routes.push(
      new Route("GET", `${basePath}/:id/edit`, controller, "edit", {
        name: routeName(`edit_${singular}`),
      })
    );

    // update (PUT + PATCH)
    this.routes.push(
      new Route("PUT", `${basePath}/:id`, controller, "update")
    );
    this.routes.push(
      new Route("PATCH", `${basePath}/:id`, controller, "update")
    );

    // destroy
    this.routes.push(
      new Route("DELETE", `${basePath}/:id`, controller, "destroy")
    );

    if (cb) {
      this.scopeStack.push({
        path: basePath + "/:id",
        namePrefix: singular,
        controller: undefined,
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

    // new
    this.routes.push(
      new Route("GET", `${basePath}/new`, controller, "new", {
        name: routeName(`new_${name}`),
      })
    );

    // create
    this.routes.push(
      new Route("POST", basePath, controller, "create")
    );

    // show
    this.routes.push(
      new Route("GET", basePath, controller, "show", {
        name: routeName(name),
      })
    );

    // edit
    this.routes.push(
      new Route("GET", `${basePath}/edit`, controller, "edit", {
        name: routeName(`edit_${name}`),
      })
    );

    // update
    this.routes.push(
      new Route("PUT", basePath, controller, "update")
    );
    this.routes.push(
      new Route("PATCH", basePath, controller, "update")
    );

    // destroy
    this.routes.push(
      new Route("DELETE", basePath, controller, "destroy")
    );

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
    const [controller, action] = parseEndpoint(endpoint);
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
}

interface ScopeOptions {
  as?: string;
  module?: string;
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
