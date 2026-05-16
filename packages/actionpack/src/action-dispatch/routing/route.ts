/**
 * A single route entry, mirroring ActionDispatch::Journey::Route.
 */

import { Parser } from "../journey/parser.js";
import { Ast } from "../journey/ast.js";
import { Pattern } from "../journey/path/pattern.js";
import type { Format } from "../journey/visitors.js";
import { normalizePath as journeyNormalizePath } from "../journey/router/utils.js";
import { buildJourneyRouter, journeyRecognize } from "./journey-bridge.js";
import type { Router as JourneyRouter } from "../journey/router.js";

const PATHFOR_SEPARATORS = "/.?";

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

  private readonly paramNames: string[];
  /** @internal lazy single-route Journey router for match() */
  private _journeyRouter: JourneyRouter | null = null;
  /** @internal lazy Journey Format tree for pathFor() */
  private _pathFormatter: Format | null = null;
  /** @internal required (non-optional) path captures, computed from Pattern */
  private _requiredParamNames: readonly string[] | null = null;
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
   * Static literals score 3, top-level dynamic captures score 1 (or 2 if
   * the caller signals knowledge of that name). Captures nested inside
   * an optional group or glob score 0.
   */
  score(knowledge: Record<string, boolean> = {}): number {
    let tree;
    try {
      tree = new Parser().parse(this.path);
    } catch {
      return 0;
    }
    let s = 0;
    const walk = (node: unknown, nested: boolean): void => {
      const n = node as {
        isLiteral?: () => boolean;
        isSymbol?: () => boolean;
        isGroup?: () => boolean;
        isStar?: () => boolean;
        isCat?: () => boolean;
        type?: string;
        toSym?: () => string;
        children?: () => unknown[];
        left?: unknown;
        right?: unknown;
      };
      if (n.isGroup?.() || n.isStar?.()) {
        walk(n.left, true);
        return;
      }
      if (n.isCat?.()) {
        walk(n.left, nested);
        walk(n.right, nested);
        return;
      }
      if (n.type === "OR") {
        // Or-children are alternatives at the same nesting level.
        for (const c of n.children?.() ?? []) walk(c, nested);
        return;
      }
      if (n.isLiteral?.()) {
        if (!nested) s += 3;
        return;
      }
      if (n.isSymbol?.()) {
        if (!nested) s += knowledge[n.toSym!()] ? 2 : 1;
        return;
      }
    };
    walk(tree, false);
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
   * Generate a path from this route by substituting params. Throws if a
   * required (non-optional) capture is missing, matching Rails'
   * UrlGenerationError behavior.
   */
  pathFor(params: Record<string, string | number> = {}): string {
    if (this._pathFormatter === null) {
      const tree = new Parser().parse(this.path);
      const ast = new Ast(tree, true);
      const pattern = new Pattern(ast, {}, PATHFOR_SEPARATORS, this.anchor);
      this._pathFormatter = pattern.buildFormatter();
      // `Pattern.requiredNames` filters by optional-name *set*, so a name
      // that appears both required and optional (e.g. `/:id(.:id)`) gets
      // dropped. Walk the AST and collect symbol names strictly outside
      // Group/Star nodes — that's the true "must be supplied" set.
      this._requiredParamNames = topLevelSymbolNames(tree);
    }
    for (const name of this._requiredParamNames!) {
      // Empty string is treated as missing — Format.evaluate would still
      // emit a literal `""` and leave structural slashes around it,
      // producing malformed URLs like `//x`. Rails URL helpers raise on
      // empty required params for the same reason.
      const v = params[name];
      if (!Object.hasOwn(params, name) || v == null || v === "") {
        throw new Error(
          `Missing required parameter :${name} for route "${this.name ?? this.path}"`,
        );
      }
    }
    // Null-prototype object so route params named `__proto__` /
    // `constructor` etc. become own properties rather than hitting the
    // inherited setter (which would silently drop them).
    const hash: Record<string, unknown> = Object.create(null);
    for (const [k, v] of Object.entries(params)) {
      if (v != null) hash[k] = String(v);
    }
    let out = this._pathFormatter.evaluate(hash);
    // Collapse runs of `/` left over from omitted optional groups (e.g.
    // `(/:a)(/:b)` with `{ b: "x" }` → `//x`) and strip a single trailing
    // slash. Skip when a supplied value actually contains a literal `/`
    // — those values come from a splat or `:controller` (which use
    // Format.requiredPath / escapePath, preserving `/`) and collapsing
    // would munge them. When the slash-bearing capture is omitted (e.g.
    // it's inside an unsatisfied optional group), collapsing is safe.
    if (!suppliedAnySlash(params, this.paramNames)) {
      out = out.replace(/\/{2,}/g, "/");
      if (out.length > 1 && out.endsWith("/")) out = out.slice(0, -1);
    }
    return out;
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

/**
 * True if any supplied param value that the route actually uses
 * contains a literal `/`. Glob and `:controller` captures preserve
 * slashes (via `escapePath`), so when such a value is actually
 * supplied, post-process slash-collapse would corrupt it. Unused
 * params are ignored — they never reach the formatter output.
 */
function suppliedAnySlash(
  params: Record<string, string | number>,
  declaredNames: readonly string[],
): boolean {
  const declared = new Set(declaredNames);
  for (const [k, v] of Object.entries(params)) {
    if (!declared.has(k)) continue;
    if (typeof v === "string" && v.includes("/")) return true;
  }
  return false;
}

function topLevelSymbolNames(tree: unknown): readonly string[] {
  // Names of `:symbol` and `*splat` captures that appear strictly outside
  // any optional `Group`. Stars are treated as required when top-level —
  // omitting `*path` from a route like `/files/*path` should still throw
  // missing-parameter rather than silently produce `/files/`.
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (node: unknown, nested: boolean): void => {
    const n = node as {
      isSymbol?: () => boolean;
      isGroup?: () => boolean;
      isStar?: () => boolean;
      isCat?: () => boolean;
      type?: string;
      toSym?: () => string;
      children?: () => unknown[];
      left?: unknown;
      right?: unknown;
    };
    if (n.isGroup?.()) {
      walk(n.left, true);
      return;
    }
    if (n.isStar?.()) {
      // The star wraps a Symbol child; that child is the splat name and is
      // required iff the star itself is top-level.
      walk(n.left, nested);
      return;
    }
    if (n.isCat?.()) {
      walk(n.left, nested);
      walk(n.right, nested);
      return;
    }
    if (n.type === "OR") {
      for (const c of n.children?.() ?? []) walk(c, nested);
      return;
    }
    if (!nested && n.isSymbol?.()) {
      const name = n.toSym!();
      if (!seen.has(name)) {
        seen.add(name);
        out.push(name);
      }
    }
  };
  walk(tree, false);
  return out;
}

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
