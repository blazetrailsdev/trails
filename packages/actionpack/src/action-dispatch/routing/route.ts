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
  /** @internal anchored requirement regexes for path captures, by capture name */
  private _pathRequirements: Record<string, RegExp> | null = null;
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
    // Null-prototype map so a constraint keyed `__proto__` becomes an own
    // property rather than hitting the inherited setter.
    const out: Record<string, unknown> = Object.create(null);
    const paths = new Set<string>(this.paramNames);
    for (const k of Object.keys(this.constraints)) {
      if (!paths.has(k)) out[k] = this.constraints[k];
    }
    return out;
  }

  /**
   * Constraints that apply to path captures (key matches a `:name` /
   * `*name` segment). These become Journey pattern requirements.
   */
  get pathConstraints(): Record<string, unknown> {
    const out: Record<string, unknown> = Object.create(null);
    const paths = new Set<string>(this.paramNames);
    for (const k of Object.keys(this.constraints)) {
      if (paths.has(k)) out[k] = this.constraints[k];
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
        // Or-children are alternatives — only one can match a real
        // request, so score the most specific branch rather than the
        // sum of all branches.
        let max = 0;
        for (const c of n.children?.() ?? []) {
          const before = s;
          walk(c, nested);
          const branch = s - before;
          if (branch > max) max = branch;
          s = before;
        }
        s += max;
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
      // Pass path-capture constraints into the Pattern so requirement
      // checks (e.g. `id: /\d+/`) are honored at generation time. Use
      // `pathConstraints` (not the raw `constraints`) so request-level
      // constraints like `subdomain` don't accidentally validate
      // unrelated params. Null-prototype map so a route capture named
      // `__proto__` becomes an own requirement entry.
      const reqs: Record<string, RegExp> = Object.create(null);
      for (const [k, v] of Object.entries(this.pathConstraints)) {
        if (v instanceof RegExp) reqs[k] = v;
        else if (typeof v === "string") reqs[k] = new RegExp(v);
      }
      const pattern = new Pattern(ast, reqs, PATHFOR_SEPARATORS, this.anchor);
      this._pathFormatter = pattern.buildFormatter();
      // `Pattern.requiredNames` filters by optional-name *set*, so a name
      // that appears both required and optional (e.g. `/:id(.:id)`) gets
      // dropped. Walk the AST and collect symbol names strictly outside
      // Group nodes (top-level Stars count as required too) — that's the
      // true "must be supplied" set.
      this._requiredParamNames = topLevelSymbolNames(tree);
      // Build the anchored requirements ourselves from `reqs` (which is
      // already null-prototype). Going through Pattern's
      // `requirementsForMissingKeysCheck` getter would route a
      // `__proto__` capture to the plain-object inherited setter,
      // dropping the requirement before we can copy it.
      const safeReqs: Record<string, RegExp> = Object.create(null);
      for (const name of Object.keys(reqs)) {
        const re = reqs[name]!;
        safeReqs[name] = new RegExp(`^(?:${re.source})$`, re.flags);
      }
      this._pathRequirements = safeReqs;
    }
    for (const name of this._requiredParamNames!) {
      // Match Journey Formatter's Ruby-truthiness rule: only nil/undefined
      // are missing. Empty string is treated as supplied and emitted by
      // Format.evaluate (e.g. `/posts/:id` with `{ id: "" }` → `/posts/`).
      if (!Object.hasOwn(params, name) || params[name] == null) {
        throw new Error(
          `Missing required parameter :${name} for route "${this.name ?? this.path}"`,
        );
      }
    }
    // Validate supplied path-capture values against the route's
    // requirement regexes (Rails Journey Formatter `missing_keys` check).
    for (const [name, re] of Object.entries(this._pathRequirements!)) {
      // `Object.hasOwn` avoids inheriting prototype-chain values for
      // optional captures named like `constructor`/`toString`.
      if (!Object.hasOwn(params, name)) continue;
      const v = params[name];
      if (v != null && !re.test(String(v))) {
        throw new Error(
          `Missing required parameter :${name} for route "${this.name ?? this.path}"`,
        );
      }
    }
    // Null-prototype object so an own `__proto__` route param becomes a
    // real own property rather than hitting the inherited setter (which
    // would silently update the prototype instead of storing the value).
    const hash: Record<string, unknown> = Object.create(null);
    for (const [k, v] of Object.entries(params)) {
      if (v != null) hash[k] = String(v);
    }
    let out = this._pathFormatter.evaluate(hash);
    // Collapse runs of `/` left over from omitted optional groups
    // (e.g. `(/:a)(/:b)` with `{ b: "x" }` → `//x` → `/x`). Skip when
    // a path-preserving capture (`*splat` / `:controller`) is supplied
    // with a value containing `/` — those use Format.requiredPath /
    // escapePath, which keeps `/` literal, so collapsing would munge
    // the user value.
    if (!emittedSlashInPathPreservingCapture(params, this.path, out)) {
      // Collapse `/{2,}` runs left over from omitted optional groups
      // (e.g. `(/:a)(/:b)` with `{ b: "x" }` → `//x` → `/x`). Trailing
      // slashes are kept — they can be structural (e.g. `/posts/` is
      // the correct output for `/posts/:id` with `{ id: "" }`).
      out = out.replace(/\/{2,}/g, "/");
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
 * True if a *path-preserving* capture's slash-bearing value was actually
 * emitted by the formatter. Checking emitted-vs-supplied matters when
 * the capture sits in an optional group that gets omitted because some
 * other required param in the same group is missing — the value
 * shouldn't suppress the structural-slash collapse if it never made it
 * to the output.
 *
 * Only `*splat` and `:controller` parameters preserve slashes (via
 * `Format.requiredPath` + `escapePath`); ordinary `:name` segments
 * percent-encode `/` to `%2F`, so their values can't introduce literal
 * `/` runs into the output and don't need to suppress collapse.
 */
function emittedSlashInPathPreservingCapture(
  params: Record<string, string | number>,
  path: string,
  out: string,
): boolean {
  // Names of path-preserving captures declared by this route. Splat
  // (`*name`) is always path-preserving; the `:controller` symbol gets
  // special-cased by Journey's FormatBuilder.
  // `\*name` is NOT escaped by Journey's scanner — only `\:`, `\(`, `\)`
  // are literalized. So splat names are matched without a backslash
  // exclusion, and the name accepts any `\w` after `*` (matching the
  // scanner's STAR rule, including digit-leading names like `*123`).
  const splatNames = new Set<string>();
  for (const m of path.matchAll(/\*(\w+)/g)) {
    splatNames.add(m[1]!);
  }
  const declaresController = /(?<!\\):controller\b/.test(path);
  for (const [k, v] of Object.entries(params)) {
    if (typeof v !== "string" || !v.includes("/")) continue;
    const isPathPreserving = splatNames.has(k) || (declaresController && k === "controller");
    if (!isPathPreserving) continue;
    // `escapePath` keeps `/` literal but escapes other unsafe chars,
    // so the value can land in `out` either verbatim or partially
    // escaped. Cheap proof-of-presence: the slash-containing prefix up
    // to the first non-path-safe character should appear unchanged.
    const slashPrefix = v.split(/[^a-zA-Z0-9\-._~!$&'()*+,;=:@/]/, 1)[0]!;
    if (slashPrefix.includes("/") && out.includes(slashPrefix)) return true;
  }
  return false;
}

function topLevelSymbolNames(tree: unknown): readonly string[] {
  // Names of `:symbol` and `*splat` captures that appear strictly outside
  // any optional `Group`. Top-level `Star` nodes ARE counted as required
  // (recurse into them without flipping `nested`) so omitting `*path`
  // from `/files/*path` still throws missing-parameter rather than
  // silently producing `/files/`.
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
