/**
 * ActionDispatch::Routing::PolymorphicRoutes
 *
 * Mirrors `vendor/rails/actionpack/lib/action_dispatch/routing/polymorphic_routes.rb`.
 *
 * Polymorphic URL helpers resolve a record (or [namespace, parent, record]
 * array) to a named-route call. They are designed to mix into any host that
 * exposes `_routes` (returning an object with `polymorphicMappings`) and
 * answers the generated route-helper names via `[method](...args)`.
 *
 * Usage matches Rails:
 *
 *     polymorphicUrl(post)                       // post_url(post)
 *     polymorphicUrl([blog, post])               // blog_post_url(blog, post)
 *     polymorphicUrl([Symbol.for("admin"), post]) // admin_post_url(post)
 *     polymorphicUrl(Comment)                    // comments_url()
 *
 * When the first element of the array is a `RoutesProxy`, it becomes the
 * recipient of the resolved helper call (mirroring Rails' `shift` in
 * `HelperMethodBuilder.polymorphic_method`).
 */

import { ArgumentError } from "@blazetrails/activemodel";
import type { ModelName } from "@blazetrails/activemodel";

import { RoutesProxy } from "./routes-proxy.js";

/** Record-shaped argument: anything with `toModel()`. */
export interface ToModel {
  toModel(): PolymorphicModel;
}

/** What `toModel()` must return — the model surface we read off of. */
export interface PolymorphicModel {
  modelName: ModelName;
  persisted(): boolean;
}

/** A class-shaped argument carrying `modelName`. */
export interface ModelClass {
  modelName: ModelName;
}

/** Custom URL helper registered via `direct(:name) { ... }` in Rails. */
export interface PolymorphicMappingEntry {
  call(host: PolymorphicHost, args: unknown[], onlyPath: boolean): string;
}

/** Surface the host's `_routes` must expose for polymorphic dispatch. */
export interface PolymorphicRoutesAccessor {
  polymorphicMappings: Map<string, PolymorphicMappingEntry>;
}

/**
 * Host interface a PolymorphicRoutes consumer must satisfy. `_routes` provides
 * the polymorphic-mapping registry; the index signature is the dynamic dispatch
 * Rails performs via `recipient.public_send(method, *args, options)`.
 */
export interface PolymorphicHost {
  _routes: PolymorphicRoutesAccessor;
  [helper: string]: unknown;
}

export type PolymorphicArg =
  | ToModel
  | ModelClass
  | string
  | symbol
  | ReadonlyArray<ToModel | ModelClass | string | symbol | RoutesProxy | null | undefined>
  // Hash form: { id: record, ...opts }
  | Record<string, unknown>;

export interface PolymorphicOptions {
  action?: "edit" | "new" | (string & {});
  routingType?: "path" | "url";
  [key: string]: unknown;
}

function isModelClass(x: unknown): x is ModelClass {
  return typeof x === "function" && "modelName" in (x as object);
}

function isToModel(x: unknown): x is ToModel {
  return typeof x === "object" && x !== null && typeof (x as ToModel).toModel === "function";
}

function isHash(x: unknown): boolean {
  if (x == null) return false;
  if (typeof x !== "object") return false;
  if (Array.isArray(x)) return false;
  if (isToModel(x)) return false;
  // Mirrors Rails `is_a?(Hash)`: accept both plain object literals and
  // `Object.create(null)` (`JSON.parse(..., { ... })` shapes, prototype-less
  // bags) — anything that walks like a hash.
  const proto = Object.getPrototypeOf(x);
  return proto === Object.prototype || proto === null;
}

function symbolToString(s: symbol): string {
  const name = s.description;
  if (!name) {
    throw new ArgumentError(
      'Cannot build a polymorphic route from a description-less Symbol. Use Symbol.for("name") or a string.',
    );
  }
  return name;
}

/** Mirrors Rails `polymorphic_url`. */
export function polymorphicUrl(
  this: PolymorphicHost,
  recordOrHashOrArray: PolymorphicArg,
  options: PolymorphicOptions = {},
): string {
  if (isHash(recordOrHashOrArray)) {
    const merged = { ...(recordOrHashOrArray as Record<string, unknown>), ...options };
    const record = merged["id"] as PolymorphicArg;
    delete merged["id"];
    return polymorphicUrl.call(this, record, merged as PolymorphicOptions);
  }

  const mapping = polymorphicMapping(this, recordOrHashOrArray);
  if (mapping) return mapping.call(this, [recordOrHashOrArray, options], false);

  const opts = { ...options };
  const action = opts.action;
  delete opts.action;
  const type: "path" | "url" = opts.routingType ?? "url";
  delete opts.routingType;

  return HelperMethodBuilder.polymorphicMethod(this, recordOrHashOrArray, action, type, opts);
}

/** Mirrors Rails `polymorphic_path`. */
export function polymorphicPath(
  this: PolymorphicHost,
  recordOrHashOrArray: PolymorphicArg,
  options: PolymorphicOptions = {},
): string {
  if (isHash(recordOrHashOrArray)) {
    const merged = { ...(recordOrHashOrArray as Record<string, unknown>), ...options };
    const record = merged["id"] as PolymorphicArg;
    delete merged["id"];
    return polymorphicPath.call(this, record, merged as PolymorphicOptions);
  }

  const mapping = polymorphicMapping(this, recordOrHashOrArray);
  if (mapping) return mapping.call(this, [recordOrHashOrArray, options], true);

  const opts = { ...options };
  const action = opts.action;
  delete opts.action;

  return HelperMethodBuilder.polymorphicMethod(this, recordOrHashOrArray, action, "path", opts);
}

export function editPolymorphicUrl(
  this: PolymorphicHost,
  recordOrHash: PolymorphicArg,
  options: PolymorphicOptions = {},
): string {
  return polymorphicUrlForAction.call(this, "edit", recordOrHash, options);
}

export function editPolymorphicPath(
  this: PolymorphicHost,
  recordOrHash: PolymorphicArg,
  options: PolymorphicOptions = {},
): string {
  return polymorphicPathForAction.call(this, "edit", recordOrHash, options);
}

export function newPolymorphicUrl(
  this: PolymorphicHost,
  recordOrHash: PolymorphicArg,
  options: PolymorphicOptions = {},
): string {
  return polymorphicUrlForAction.call(this, "new", recordOrHash, options);
}

export function newPolymorphicPath(
  this: PolymorphicHost,
  recordOrHash: PolymorphicArg,
  options: PolymorphicOptions = {},
): string {
  return polymorphicPathForAction.call(this, "new", recordOrHash, options);
}

/** @internal Rails-private helper. */
export function polymorphicUrlForAction(
  this: PolymorphicHost,
  action: string,
  recordOrHash: PolymorphicArg,
  options: PolymorphicOptions,
): string {
  return polymorphicUrl.call(this, recordOrHash, { ...options, action });
}

/** @internal Rails-private helper. */
export function polymorphicPathForAction(
  this: PolymorphicHost,
  action: string,
  recordOrHash: PolymorphicArg,
  options: PolymorphicOptions,
): string {
  return polymorphicPath.call(this, recordOrHash, { ...options, action });
}

/** @internal Rails-private helper. */
export function polymorphicMapping(
  host: PolymorphicHost,
  record: unknown,
): PolymorphicMappingEntry | undefined {
  if (isToModel(record)) {
    return host._routes.polymorphicMappings.get(record.toModel().modelName.name);
  }
  const ctor = (record as { constructor?: { name?: string } })?.constructor;
  const key = ctor?.name ?? "";
  return host._routes.polymorphicMappings.get(key);
}

type KeyStrategy = (name: ModelName) => string;

/**
 * Mirrors Rails `PolymorphicRoutes::HelperMethodBuilder`. Resolves the
 * `record_or_hash_or_array` to `[method, args]` for the host's dynamic
 * route-helper dispatch.
 *
 * @internal Rails-private helper.
 */
export class HelperMethodBuilder {
  /** Cache of `[type][action]` builders. Mirrors Rails CACHE. */
  private static readonly CACHE: {
    path: Map<string | null, HelperMethodBuilder>;
    url: Map<string | null, HelperMethodBuilder>;
  } = { path: new Map(), url: new Map() };

  // Mirrors Rails' bottom-of-class CACHE seeding loop. Static initializer
  // block guarantees this runs as part of class evaluation — no ordering
  // hazard from import side effects.
  static {
    for (const action of [null, "new", "edit"] as const) {
      HelperMethodBuilder.CACHE.url.set(action, HelperMethodBuilder.build(action, "url"));
      HelperMethodBuilder.CACHE.path.set(action, HelperMethodBuilder.build(action, "path"));
    }
  }

  static get(action: string | null | undefined, type: "path" | "url"): HelperMethodBuilder {
    const key = action ?? null;
    const cached = HelperMethodBuilder.CACHE[type].get(key);
    if (cached) return cached;
    return HelperMethodBuilder.build(key, type);
  }

  static url(): HelperMethodBuilder {
    return HelperMethodBuilder.CACHE.url.get(null)!;
  }

  static path(): HelperMethodBuilder {
    return HelperMethodBuilder.CACHE.path.get(null)!;
  }

  static build(action: string | null, type: "path" | "url"): HelperMethodBuilder {
    const prefix = action ? `${action}_` : "";
    const suffix = type;
    return action === "new"
      ? HelperMethodBuilder.singular(prefix, suffix)
      : HelperMethodBuilder.plural(prefix, suffix);
  }

  static singular(prefix: string, suffix: string): HelperMethodBuilder {
    return new HelperMethodBuilder((name) => name.singularRouteKey, prefix, suffix);
  }

  static plural(prefix: string, suffix: string): HelperMethodBuilder {
    return new HelperMethodBuilder((name) => name.routeKey, prefix, suffix);
  }

  static polymorphicMethod(
    recipient: PolymorphicHost,
    recordOrHashOrArray: PolymorphicArg,
    action: string | null | undefined,
    type: "path" | "url",
    options: Record<string, unknown>,
  ): string {
    const builder = HelperMethodBuilder.get(action, type);

    let method: string;
    let args: unknown[];
    let target: PolymorphicHost = recipient;
    if (Array.isArray(recordOrHashOrArray)) {
      const compact = recordOrHashOrArray.filter((x) => x != null);
      if (compact.length === 0) {
        throw new ArgumentError("Nil location provided. Can't build URI.");
      }
      if (compact[0] instanceof RoutesProxy) {
        target = compact.shift() as unknown as PolymorphicHost;
      }
      [method, args] = builder.handleList(compact);
    } else if (typeof recordOrHashOrArray === "string") {
      [method, args] = builder.handleString(recordOrHashOrArray);
    } else if (typeof recordOrHashOrArray === "symbol") {
      [method, args] = builder.handleString(symbolToString(recordOrHashOrArray));
    } else if (isModelClass(recordOrHashOrArray)) {
      [method, args] = builder.handleClass(recordOrHashOrArray);
    } else if (recordOrHashOrArray == null) {
      throw new ArgumentError("Nil location provided. Can't build URI.");
    } else {
      [method, args] = builder.handleModel(recordOrHashOrArray as ToModel);
    }

    const helper = (target as unknown as Record<string, unknown>)[method];
    if (typeof helper !== "function") {
      throw new ArgumentError(`undefined route helper ${method}`);
    }
    return Object.keys(options).length === 0
      ? (helper as (...a: unknown[]) => string).call(target, ...args)
      : (helper as (...a: unknown[]) => string).call(target, ...args, options);
  }

  readonly suffix: string;
  readonly prefix: string;
  private readonly keyStrategy: KeyStrategy;

  constructor(keyStrategy: KeyStrategy, prefix: string, suffix: string) {
    this.keyStrategy = keyStrategy;
    this.prefix = prefix;
    this.suffix = suffix;
  }

  handleString(record: string): [string, unknown[]] {
    return [this.getMethodForString(record), []];
  }

  handleStringCall(target: PolymorphicHost, str: string): string {
    const m = this.getMethodForString(str);
    return (target[m] as (...a: unknown[]) => string).call(target);
  }

  handleClass(klass: ModelClass): [string, unknown[]] {
    return [this.getMethodForClass(klass), []];
  }

  handleClassCall(target: PolymorphicHost, klass: ModelClass): string {
    const m = this.getMethodForClass(klass);
    return (target[m] as (...a: unknown[]) => string).call(target);
  }

  handleModel(record: ToModel): [string, unknown[]] {
    const args: unknown[] = [];
    const model = record.toModel();
    const namedRoute = model.persisted()
      ? (args.push(model), this.getMethodForString(model.modelName.singularRouteKey))
      : this.getMethodForClass(model);
    return [namedRoute, args];
  }

  handleModelCall(target: PolymorphicHost, record: ToModel): string {
    const mapping = polymorphicMapping(target, record);
    if (mapping) return mapping.call(target, [record], this.suffix === "path");
    const [method, args] = this.handleModel(record);
    return (target[method] as (...a: unknown[]) => string).call(target, ...args);
  }

  handleList(list: ReadonlyArray<unknown>): [string, unknown[]] {
    const recordList = [...list];
    const record = recordList.pop();
    const args: unknown[] = [];

    const route: string[] = recordList.map((parent) => {
      if (typeof parent === "symbol") return symbolToString(parent);
      if (typeof parent === "string") {
        throw new ArgumentError("Please use symbols for polymorphic route arguments.");
      }
      if (isModelClass(parent)) {
        args.push(parent);
        return parent.modelName.singularRouteKey;
      }
      const model = (parent as ToModel).toModel();
      args.push(model);
      return model.modelName.singularRouteKey;
    });

    let tail: string;
    if (typeof record === "symbol") {
      tail = symbolToString(record);
    } else if (typeof record === "string") {
      throw new ArgumentError("Please use symbols for polymorphic route arguments.");
    } else if (isModelClass(record)) {
      tail = this.keyStrategy(record.modelName);
    } else {
      const model = (record as ToModel).toModel();
      if (model.persisted()) {
        args.push(model);
        tail = model.modelName.singularRouteKey;
      } else {
        tail = this.keyStrategy(model.modelName);
      }
    }
    route.push(tail);
    route.push(this.suffix);

    return [this.prefix + route.join("_"), args];
  }

  private getMethodForClass(klass: ModelClass): string {
    return this.getMethodForString(this.keyStrategy(klass.modelName));
  }

  private getMethodForString(str: string): string {
    return `${this.prefix}${str}_${this.suffix}`;
  }
}
