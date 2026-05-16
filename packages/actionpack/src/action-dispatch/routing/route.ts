/**
 * A single route entry, mirroring ActionDispatch::Journey::Route.
 */

import { Parser } from "../journey/parser.js";
import { Ast } from "../journey/ast.js";
import { normalizePath as journeyNormalizePath } from "../journey/router/utils.js";
import { buildJourneyRouter, journeyRecognize } from "./journey-bridge.js";
import type { Router as JourneyRouter } from "../journey/router.js";

export interface RouteConstraints {
  [key: string]: string | RegExp;
}

export interface RouteOptions {
  name?: string;
  constraints?: RouteConstraints;
  defaults?: Record<string, string>;
  format?: boolean;
  as?: string;
  to?: string;
  controller?: string;
  action?: string;
  only?: ResourceAction | ResourceAction[];
  except?: ResourceAction | ResourceAction[];
  ip?: string | RegExp;
  redirect?: string | RedirectOptions | RedirectFunction;
  pathNames?: { new?: string; edit?: string };
  anchor?: boolean;
  shallow?: boolean;
}

export type ResourceAction = "index" | "show" | "new" | "create" | "edit" | "update" | "destroy";

export type RedirectFunction = (
  params: Record<string, string>,
  request: { method: string; path: string },
) => string;

export interface RedirectOptions {
  path?: string;
  host?: string;
  subdomain?: string;
  domain?: string;
  status?: number;
}

export interface MatchedRoute {
  route: Route;
  params: Record<string, string>;
}

export class Route {
  readonly verb: string;
  readonly path: string;
  readonly name: string | undefined;
  readonly controller: string;
  readonly action: string;
  readonly defaults: Record<string, string>;
  readonly constraints: RouteConstraints;
  readonly ip: string | RegExp;
  readonly redirectTarget: string | RedirectOptions | RedirectFunction | undefined;
  readonly anchor: boolean;

  private readonly segments: PathSegment[];
  private readonly paramNames: string[];
  /** @internal lazy single-route Journey router for match() */
  private _journeyRouter: JourneyRouter | null = null;
  /** @internal true once we've discovered the path can't be parsed */
  private _journeyRouterUnbuildable = false;

  constructor(
    verb: string,
    path: string,
    controller: string,
    action: string,
    options: RouteOptions = {},
  ) {
    this.verb = verb.toUpperCase();
    this.path = normalizePath(path);
    this.controller = controller;
    this.action = action;
    this.name = options.name ?? options.as;
    this.defaults = options.defaults ?? {};
    this.constraints = options.constraints ?? {};
    this.ip = options.ip ?? /(?:)/;
    this.redirectTarget = options.redirect;
    this.anchor = options.anchor !== false;

    this.segments = parseSegments(this.path);
    // Derive capture names from the Journey parser/AST — the same source
    // the Journey bridge uses. Keeps the path-vs-request constraint split
    // in lockstep with what `Pattern.names` will report, so escaped sigils
    // (`\:`, `\(`, `\)`), bare `*`, embedded captures, and nested optional
    // groups all classify identically.
    this.paramNames = collectParamNamesFromJourneyAst(this.path);
  }

  get isRedirect(): boolean {
    return this.redirectTarget !== undefined;
  }

  /**
   * Returns the path-capture (dynamic/glob) parameter names declared by
   * this route, e.g. `["id"]` for `/posts/:id`. Returns a defensive copy
   * so external callers can't mutate the route's internal classification.
   */
  get pathParamNames(): readonly string[] {
    return this.paramNames.slice();
  }

  /**
   * Constraints that apply to *request* attributes (subdomain, format,
   * signed-in, etc.) rather than to path captures. Path-capture
   * constraints are passed into the pattern requirements instead, so the
   * Journey `Route#matches` request-constraint loop should not re-check
   * them against undefined request properties.
   */
  get requestConstraints(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const paths = new Set<string>(this.paramNames);
    for (const [k, v] of Object.entries(this.constraints)) {
      if (!paths.has(k)) out[k] = v;
    }
    return out;
  }

  /**
   * Constraints that apply to path captures (key matches a `:name` /
   * `*name` segment). These become Journey pattern requirements.
   */
  get pathConstraints(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const paths = new Set<string>(this.paramNames);
    for (const [k, v] of Object.entries(this.constraints)) {
      if (paths.has(k)) out[k] = v;
    }
    return out;
  }

  /**
   * Compute a specificity score for this route. Higher = more specific.
   */
  score(knowledge: Record<string, boolean> = {}): number {
    let s = 0;
    for (const seg of this.segments) {
      if (seg.type === "static") s += 3;
      else if (seg.type === "dynamic") s += knowledge[seg.name] ? 2 : 1;
      else if (seg.type === "glob") s += 0;
      else if (seg.type === "optional") s += 0;
    }
    return s;
  }

  match(method: string, requestPath: string): MatchedRoute | null {
    // Verb fast-path: skip Journey router construction when the verb can
    // be rejected up front. HEAD falls through to GET routes (Journey
    // handles the HEAD→GET fallback inside `_matchHeadRoutes`).
    const m = method.toUpperCase();
    if (this.verb !== "ALL" && this.verb !== m && !(m === "HEAD" && this.verb === "GET")) {
      return null;
    }
    if (this._journeyRouterUnbuildable) return null;
    if (this._journeyRouter === null) {
      try {
        // Path-only matcher: skip request constraints since match() takes
        // no request attributes — preserves legacy matchSegments semantics
        // where request constraints (subdomain, format, …) didn't apply.
        this._journeyRouter = buildJourneyRouter([this], { skipRequestConstraints: true });
      } catch {
        // Mirrors collectParamNamesFromJourneyAst's swallow-and-cache policy:
        // a malformed path shouldn't crash the route table at match time.
        this._journeyRouterUnbuildable = true;
        return null;
      }
    }
    const match = journeyRecognize(this._journeyRouter, method, requestPath);
    if (!match) return null;
    return { route: this, params: match.params };
  }

  /**
   * Generate a path from this route by substituting params.
   */
  pathFor(params: Record<string, string | number> = {}): string {
    const parts: string[] = [];
    for (const seg of this.segments) {
      if (seg.type === "static") {
        parts.push(seg.value);
      } else if (seg.type === "dynamic") {
        const val = params[seg.name];
        if (val === undefined) {
          throw new Error(
            `Missing required parameter :${seg.name} for route "${this.name ?? this.path}"`,
          );
        }
        parts.push(String(val));
      } else if (seg.type === "glob") {
        const val = params[seg.name];
        if (val !== undefined) {
          parts.push(String(val));
        }
      } else if (seg.type === "optional") {
        // Include optional group only if all dynamic params are provided
        const optParts: string[] = [];
        let allPresent = true;
        for (const child of seg.children) {
          if (child.type === "static") {
            optParts.push(child.value);
          } else if (child.type === "dynamic") {
            const val = params[child.name];
            if (val === undefined || val === null) {
              allPresent = false;
              break;
            }
            optParts.push(String(val));
          }
        }
        if (allPresent && optParts.length > 0) {
          parts.push(...optParts);
        }
      }
    }
    const result = "/" + parts.join("/");
    return result === "/" ? "/" : result;
  }

  /**
   * Resolve a redirect target given matched params and request info.
   */
  resolveRedirect(
    params: Record<string, string>,
    request: { method: string; path: string; host?: string },
  ): { url: string; status: number } {
    const target = this.redirectTarget;
    if (!target) throw new Error("Route is not a redirect");

    if (typeof target === "function") {
      return { url: target(params, request), status: 301 };
    }

    if (typeof target === "string") {
      const url = interpolateRedirect(target, params);
      return { url, status: 301 };
    }

    // RedirectOptions
    const status = target.status ?? 301;
    const path = target.path ? interpolateRedirect(target.path, params) : request.path;
    let host = target.host ?? request.host ?? "www.example.com";
    if (target.subdomain) {
      const hostParts = host.split(".");
      if (hostParts.length >= 2) {
        hostParts[0] = target.subdomain;
        host = hostParts.join(".");
      } else {
        host = target.subdomain + "." + host;
      }
    }
    if (target.domain) {
      host = "www." + target.domain;
    }
    const url = `http://${host}${path}`;
    return { url, status };
  }
}

// --- Path segment types ---

interface StaticSegment {
  type: "static";
  value: string;
}
interface DynamicSegment {
  type: "dynamic";
  name: string;
}
interface GlobSegment {
  type: "glob";
  name: string;
}
interface OptionalGroup {
  type: "optional";
  children: (StaticSegment | DynamicSegment)[];
}

type PathSegment = StaticSegment | DynamicSegment | GlobSegment | OptionalGroup;

function collectParamNamesFromJourneyAst(path: string): string[] {
  try {
    const tree = new Parser().parse(path);
    const ast = new Ast(tree, true);
    // Preserve duplicates so this stays in lockstep with Pattern.names —
    // e.g. `/:id/:id` keeps two captures. Constraint splitters that need
    // uniqueness build their own Set.
    return ast.names.slice();
  } catch {
    // Parser failure shouldn't crash the route table; fall back to no captures.
    return [];
  }
}

function parseSegments(path: string): PathSegment[] {
  const segments: PathSegment[] = [];
  const raw = path.replace(/^\/+/, "");
  if (!raw) return segments;

  // Handle optional groups: (/:locale) or (.:format)
  let i = 0;
  const parts: string[] = [];
  let current = "";

  // First split by / but handle parenthesized groups
  while (i < raw.length) {
    if (raw[i] === "(") {
      // Find matching close paren
      if (current) {
        parts.push(current);
        current = "";
      }
      let depth = 1;
      let group = "(";
      i++;
      while (i < raw.length && depth > 0) {
        if (raw[i] === "(") depth++;
        if (raw[i] === ")") depth--;
        group += raw[i];
        i++;
      }
      parts.push(group);
    } else if (raw[i] === "/") {
      if (current) {
        parts.push(current);
        current = "";
      }
      i++;
    } else {
      current += raw[i];
      i++;
    }
  }
  if (current) parts.push(current);

  for (const part of parts) {
    if (part.startsWith("(") && part.endsWith(")")) {
      // Optional group
      const inner = part.slice(1, -1).replace(/^\/+/, "").replace(/^\./, "");
      const children: (StaticSegment | DynamicSegment)[] = [];
      for (const sub of inner.split("/").filter(Boolean)) {
        if (sub.startsWith(":")) {
          children.push({ type: "dynamic", name: sub.slice(1) });
        } else if (sub.startsWith("*")) {
          // glob in optional — treat as dynamic
          children.push({ type: "dynamic", name: sub.slice(1) });
        } else {
          children.push({ type: "static", value: sub });
        }
      }
      if (children.length > 0) {
        segments.push({ type: "optional", children });
      }
    } else if (part.startsWith("*")) {
      segments.push({ type: "glob", name: part.slice(1) });
    } else if (part.startsWith(":")) {
      segments.push({ type: "dynamic", name: part.slice(1) });
    } else {
      segments.push({ type: "static", value: part });
    }
  }

  return segments;
}

function normalizePath(p: string): string {
  // Mirrors Rails `ActionDispatch::Routing::Mapper.normalize_path`:
  // first apply Journey's `Utils.normalize_path` (leading-`/`, collapse
  // duplicate slashes, strip trailing, uppercase `%xx`), then swap `/(`
  // → `(/` so leading optional groups keep the `/` *inside* the optional.
  // The leading `/(` form is restored only when the entire path is
  // composed of adjacent optional segments (root-style routes).
  let path = journeyNormalizePath(p);
  path = path.replace(/\/(\(+)\/?/g, "$1/");
  if (isAllOptional(path)) {
    path = path.replace(/^(\(+)\//, "/$1");
  }
  return path;
}

/**
 * True when `path` consists only of adjacent balanced-paren optional
 * groups (no top-level literal characters between them). Mirrors what
 * Rails' Mapper.normalize_path treats as the "all-optional" shape —
 * paths like `(/:locale)(.:format)` or `(/:a)(/:b)(/:c)`.
 */
function isAllOptional(path: string): boolean {
  if (!path.startsWith("(")) return false;
  let depth = 0;
  for (let i = 0; i < path.length; i++) {
    const ch = path[i];
    if (ch === "(") {
      depth++;
    } else if (ch === ")") {
      depth--;
      if (depth < 0) return false;
      // After closing a top-level group, only another `(` may follow
      // (adjacent optional groups). Any literal between groups
      // disqualifies the all-optional shape.
      if (depth === 0 && i + 1 < path.length && path[i + 1] !== "(") return false;
    }
  }
  return depth === 0;
}

function interpolateRedirect(template: string, params: Record<string, string>): string {
  return template.replace(/%\{(\w+)\}/g, (_, key) => params[key] ?? "");
}
