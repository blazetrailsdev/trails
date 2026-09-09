import { isPlainObject, isPresent, toParam } from "@blazetrails/activesupport";
import { UrlGenerationError } from "../../action-controller/metal/exceptions.js";
import type { Route } from "./route.js";

export { UrlGenerationError };

export interface FormatterHost {
  routes: { routes: readonly Route[] };
  namedRoutes: { has(name: string): boolean; get(name: string): Route | undefined };
}

export class RouteWithParams {
  constructor(
    private readonly _route: Route,
    private readonly _parameterizedParts: Record<string, unknown>,
    readonly params: Record<string, unknown>,
  ) {}

  path(_?: string): string {
    return this._route.format(this._parameterizedParts);
  }
}

export class MissingRoute {
  constructor(
    readonly constraints: Record<string, unknown>,
    readonly missingKeys: readonly string[],
    readonly unmatchedKeys: readonly string[],
    readonly routes: FormatterHost | undefined,
    readonly name: string | null,
  ) {}

  path(methodName: string): never {
    throw new UrlGenerationError(this.message, this.routes, this.name, methodName);
  }

  get params(): never {
    return this.path("unknown");
  }

  get message(): string {
    const sorted = Object.entries(this.constraints).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    let msg = `No route matches ${rubyInspectHash(sorted)}`;
    if (this.missingKeys.length > 0) {
      msg += `, missing required keys: ${rubyInspectSymbolArray([...this.missingKeys].sort())}`;
    }
    if (this.unmatchedKeys.length > 0) {
      msg += `, possible unmatched constraints: ${rubyInspectSymbolArray([...this.unmatchedKeys].sort())}`;
    }
    return msg;
  }
}

export class Formatter {
  readonly routes: FormatterHost;
  /** @internal */
  private _cache: Record<string, unknown> | null = null;

  constructor(routes: FormatterHost) {
    this.routes = routes;
  }

  generate(
    name: string | null,
    options: Record<string, unknown>,
    pathParameters: Record<string, unknown>,
  ): RouteWithParams | MissingRoute {
    const originalOptions = { ...options };
    let pathParams: Record<string, unknown> | null = null;
    const rawPathParams = options["pathParams"];
    options = { ...options };
    delete options["pathParams"];
    if (isPlainObject(rawPathParams)) {
      pathParams = rawPathParams as Record<string, unknown>;
      options = { ...pathParams, ...options };
    }
    const constraints = { ...pathParameters, ...options };
    let missingKeys: string[] | null = null;

    for (const route of this.matchRoute(name, constraints)) {
      const parameterizedParts = this.extractParameterizedParts(route, options, pathParameters);

      if (!name && !route.isDispatcher()) continue;

      missingKeys = this.missingKeys(route, parameterizedParts);
      if (missingKeys && missingKeys.length > 0) continue;

      const remainingOptions = { ...options };
      for (const key of Object.keys(remainingOptions)) {
        if (
          Object.hasOwn(parameterizedParts, key) ||
          Object.hasOwn(route.defaults, key) ||
          (pathParams && Object.hasOwn(pathParams, key) && !Object.hasOwn(originalOptions, key))
        ) {
          delete remainingOptions[key];
        }
      }

      const defaults = route.defaults;
      const requiredParts = route.requiredParts;
      const parts = [...route.parts];

      for (let i = parts.length - 1; i >= 0; i--) {
        const key = parts[i];
        const partVal = parameterizedParts[key];
        if (defaults[key] == null && isPresent(partVal)) break;
        if (toS(partVal) !== toS(defaults[key])) continue;
        if (requiredParts.includes(key)) break;
        delete parameterizedParts[key];
      }

      return new RouteWithParams(route, parameterizedParts, remainingOptions);
    }

    const constraintKeys = Object.keys(constraints);
    const unmatchedKeys = (missingKeys ?? []).filter((k) => constraintKeys.includes(k));
    const trulyMissing = (missingKeys ?? []).filter((k) => !unmatchedKeys.includes(k));

    return new MissingRoute(constraints, trulyMissing, unmatchedKeys, this.routes, name);
  }

  clear(): void {
    this._cache = null;
  }

  eagerLoadBang(): void {
    void this.cache;
  }

  /** @internal */
  private extractParameterizedParts(
    route: Route,
    options: Record<string, unknown>,
    recall: Record<string, unknown>,
  ): Record<string, unknown> {
    const parameterizedParts: Record<string, unknown> = { ...recall, ...options };

    const parts = [...route.parts].reverse();
    let dropping = true;
    const keysToKeep = new Set<string>();
    for (const part of parts) {
      if (dropping) {
        const supplied = Object.hasOwn(options, part) || Object.hasOwn(route.scopeOptions, part);
        const present = options[part] != null || recall[part] != null;
        if (supplied && present) dropping = false;
        else continue;
      }
      keysToKeep.add(part);
    }
    for (const p of route.requiredParts) keysToKeep.add(p);

    for (const badKey of Object.keys(parameterizedParts)) {
      if (!keysToKeep.has(badKey)) delete parameterizedParts[badKey];
    }

    for (const [k, v] of Object.entries(parameterizedParts)) {
      if (k === "controller") {
        parameterizedParts[k] = v;
      } else {
        parameterizedParts[k] = toParam(v);
      }
    }

    for (const k of Object.keys(parameterizedParts)) {
      if (parameterizedParts[k] == null) delete parameterizedParts[k];
    }
    return parameterizedParts;
  }

  /** @internal */
  private *matchRoute(name: string | null, options: Record<string, unknown>): Generator<Route> {
    if (name != null && this.namedRoutes.has(name)) {
      const r = this.namedRoutes.get(name);
      if (r) yield r;
      return;
    }

    const routes = this.nonRecursive(this.cache, options);

    const suppliedSet = new Set<string>();
    for (const [k, v] of Object.entries(options)) {
      if (v != null && v !== false) suppliedSet.add(String(k));
    }

    const buckets = new Map<number, [number, Route][]>();
    for (const entry of routes) {
      const score = entry[1].score(suppliedSet);
      let bucket = buckets.get(score);
      if (!bucket) buckets.set(score, (bucket = []));
      bucket.push(entry);
    }

    const scores = [...buckets.keys()].sort((a, b) => b - a);
    for (const s of scores) {
      if (s < 0) break;
      const bucket = buckets.get(s)!;
      bucket.sort((a, b) => a[0] - b[0]);
      for (const [, r] of bucket) yield r;
    }
  }

  /** @internal */
  private nonRecursive(
    cache: Record<string, unknown>,
    options: Record<string, unknown>,
  ): [number, Route][] {
    let routes: [number, Route][] = [];
    const queue: Record<string, unknown>[] = [cache];
    while (queue.length > 0) {
      const c = queue.shift()!;
      if (Object.hasOwn(c, "___routes"))
        routes = routes.concat(c["___routes"] as [number, Route][]);
      for (const [k, v] of Object.entries(options)) {
        const pair = pairKey(k, v);
        if (Object.hasOwn(c, pair)) queue.push(c[pair] as Record<string, unknown>);
      }
    }
    return routes;
  }

  /** @internal */
  private missingKeys(route: Route, parts: Record<string, unknown>): string[] | null {
    let missing: string[] | null = null;
    const tests = route.path.requirementsForMissingKeysCheck;
    for (const key of route.requiredParts) {
      const test = tests[key];
      if (test == null) {
        const v = parts[key];
        if (v == null || v === false) {
          (missing ??= []).push(key);
        }
      } else {
        const v = parts[key];
        if (v == null || !test.test(String(v))) {
          (missing ??= []).push(key);
        }
      }
    }
    return missing;
  }

  /** @internal */
  private get namedRoutes(): FormatterHost["namedRoutes"] {
    return this.routes.namedRoutes;
  }

  /** @internal */
  private possibles(
    cache: Record<string, unknown>,
    options: Record<string, unknown>,
  ): [number, Route][] {
    return [
      ...((cache["___routes"] as [number, Route][]) ?? []),
      ...Object.entries(options)
        .filter(([k, v]) => Object.hasOwn(cache, pairKey(k, v)))
        .flatMap(([k, v]) =>
          this.possibles(cache[pairKey(k, v)] as Record<string, unknown>, options),
        ),
    ];
  }

  /** @internal */
  private buildCache(): Record<string, unknown> {
    const root: Record<string, unknown> = { ___routes: [] as [number, Route][] };
    const list = this.routes.routes.routes;
    for (let i = 0; i < list.length; i++) {
      const route = list[i];
      const leaf = Object.entries(route.requiredDefaults).reduce<Record<string, unknown>>(
        (h, [k, v]) => (h[pairKey(k, v)] ||= {}) as Record<string, unknown>,
        root,
      );
      ((leaf["___routes"] ||= []) as [number, Route][]).push([i, route]);
    }
    return root;
  }

  /** @internal */
  private get cache(): Record<string, unknown> {
    return (this._cache ??= this.buildCache());
  }
}

function pairKey(k: string, v: unknown): string {
  return JSON.stringify([k, v ?? null]);
}

function toS(v: unknown): string {
  return v == null ? "" : String(v);
}

function rubyInspectHash(entries: [string, unknown][]): string {
  const parts = entries.map(([k, v]) => `:${k}=>${rubyInspect(v)}`);
  return `{${parts.join(", ")}}`;
}

function rubyInspectSymbolArray(names: readonly string[]): string {
  return `[${names.map((name) => `:${name}`).join(", ")}]`;
}

function rubyInspectArray(arr: readonly unknown[]): string {
  return `[${arr.map((x) => rubyInspect(x)).join(", ")}]`;
}

function rubyInspect(v: unknown): string {
  if (v == null) return "nil";
  if (typeof v === "string") return `"${escapeRubyString(v)}"`;
  if (typeof v === "symbol") return `:${v.description ?? ""}`;
  if (Array.isArray(v)) return rubyInspectArray(v);
  if (typeof v === "object") {
    return rubyInspectHash(Object.entries(v as Record<string, unknown>));
  }
  return String(v);
}

function escapeRubyString(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (ch === "\\") out += "\\\\";
    else if (ch === '"') out += '\\"';
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (code < 0x20) out += `\\x${code.toString(16).padStart(2, "0").toUpperCase()}`;
    else out += ch;
  }
  return out;
}
