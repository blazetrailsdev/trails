/**
 * ActionDispatch::Routing::RoutesInspector — formats routes for `rails routes`.
 */

import { pluralize, underscore } from "@blazetrails/activesupport";
import { escapePath } from "../journey/router/utils.js";
import type { Route } from "./route.js";

export interface InspectedRoute {
  name: string;
  verb: string;
  path: string;
  controller: string;
  action: string;
}

export interface CollectedRoute {
  name: string;
  verb: string;
  path: string;
  reqs: string;
  sourceLocation?: string;
}

export interface RoutesFilter {
  controller?: string;
  grep?: string;
}

/** @internal */
type NormalizedFilter = Record<string, RegExp | string> | null;

/**
 * @internal Render a constraint hash in a Rails-like shape: `{key: /regex/, ...}`.
 * `JSON.stringify` loses RegExp values (serializes them as `{}`), which would
 * make `rails routes` print `{id: {}}` instead of `{id: /\d+/}`. Mirror Ruby
 * hash inspect for the RegExp/string cases the routing layer actually uses.
 */
function formatConstraints(c: Record<string, unknown>): string {
  const parts = Object.entries(c).map(([k, v]) => {
    if (v instanceof RegExp) return `${k}: ${v.toString()}`;
    if (typeof v === "string") return `${k}: ${JSON.stringify(v)}`;
    return `${k}: ${String(v)}`;
  });
  return `{${parts.join(", ")}}`;
}

/**
 * Display-time decorator around a Route. Mirrors Rails' SimpleDelegator-based
 * `ActionDispatch::Routing::RouteWrapper` — endpoint string, non-routing
 * constraints, normalized name/path.
 */
export class RouteWrapper {
  private readonly route: Route;
  private _reqs: string | undefined;

  constructor(route: Route) {
    this.route = route;
  }

  /**
   * @internal Mirrors Rails RouteWrapper#matches_filter? — for exact_path_match
   * the value is a URL-escaped grep string and Rails calls `Pattern#match` on
   * the route's path. Bypass the verb gate by trying the route's known verb
   * (Route.match() rejects mismatched verbs up front). For all other filters
   * the value is a Regexp and Rails tests it against the named attribute.
   */
  isMatchesFilter(filter: string, value: RegExp | string): boolean {
    if (filter === "exact_path_match") {
      if (typeof value !== "string") return false;
      const verb = this.route.verb === "ALL" ? "GET" : this.route.verb;
      return this.route.match(verb, value) !== null;
    }
    const re = value instanceof RegExp ? value : new RegExp(String(value));
    const target = (this as unknown as Record<string, unknown>)[filter];
    return typeof target === "string" && re.test(target);
  }

  get endpoint(): string {
    // Rails dispatches on the wrapped app: `dispatcher?` → `controller#action`,
    // Proc rack apps → "Inline handler (Proc/Lambda)", otherwise `rack_app.inspect`.
    // trails Route encodes a redirect target on the route itself; surface a
    // redirect-shaped endpoint so the Controller#Action column doesn't print "#"
    // for redirect rows.
    if (this.route.isRedirect) {
      const t = this.route.redirectTarget;
      if (typeof t === "string") return `redirect(301, ${t})`;
      if (typeof t === "function") return "Inline handler (Proc/Lambda)";
      if (t) return `redirect(${t.status ?? 301})`;
    }
    if (!this.route.controller && !this.route.action) return "";
    return `${this.controller}#${this.action}`;
  }

  get constraints(): Record<string, unknown> {
    const { controller: _c, action: _a, ...rest } = this.requirements;
    return rest;
  }

  /**
   * @internal Mirrors Rails RouteWrapper#requirements — combines the route's
   * routing constraints with the dispatched controller/action so the
   * formatter can show `controller#action {constraint: …}`. Built on a
   * null-prototype object so a constraint keyed `__proto__` becomes a real
   * own property instead of hitting the inherited setter (same defensive
   * pattern Route#requestConstraints uses).
   */
  get requirements(): Record<string, unknown> {
    const out: Record<string, unknown> = Object.create(null);
    for (const k of Object.keys(this.route.constraints)) out[k] = this.route.constraints[k];
    out.controller = this.route.controller;
    out.action = this.route.action;
    return out;
  }

  /** @internal Rack app of mounted engine — undefined until trails Route wraps one */
  get rackApp(): unknown {
    return undefined;
  }

  get path(): string {
    return this.route.path;
  }
  get name(): string {
    return this.route.name ?? "";
  }
  get verb(): string {
    return this.route.verb;
  }
  get controller(): string {
    return this.route.controller;
  }
  get action(): string {
    return this.route.action;
  }

  get reqs(): string {
    if (this._reqs !== undefined) return this._reqs;
    let s = this.endpoint;
    const c = this.constraints;
    if (Object.keys(c).length > 0) s += ` ${formatConstraints(c)}`;
    this._reqs = s;
    return s;
  }

  /** @internal Reads the wrapped Route's internal flag — Rails hides these from `routes` output. */
  isInternal(): boolean {
    return this.route.internal;
  }

  /** @internal Engine-mounted routes get nested into a per-engine section */
  isEngine(): boolean {
    return false;
  }

  /** @internal Source-location (file:line) is not tracked in trails Route yet */
  get sourceLocation(): string | undefined {
    return undefined;
  }
}

/**
 * Formats routes for `bin/rails routes` and the routing-error page. Holds the
 * routes plus per-engine nested route collections discovered during display.
 * Intended for tooling — people should not use this class.
 */
export class RoutesInspector {
  private readonly routes: readonly Route[];
  private engines: Record<string, CollectedRoute[]>;

  constructor(routes: readonly Route[]) {
    this.routes = routes;
    this.engines = {};
  }

  inspect(): InspectedRoute[] {
    return this.routes.map((route) => ({
      name: route.name ?? "",
      verb: route.verb,
      path: route.path,
      controller: route.controller,
      action: route.action,
    }));
  }

  /**
   * Format routes via the given formatter. Defaults to `ConsoleFormatter.Sheet`
   * so the no-arg call returns the column-formatted string.
   *
   * Mirrors Rails' single-shot contract: the formatter accumulates output into
   * an internal buffer and `result()` reads it off. Pass a fresh formatter
   * instance per call — reusing one across calls will concatenate the prior
   * call's buffer into the next call's output. (This matches Rails inspector
   * callers, which always construct a new ConsoleFormatter / HtmlTableFormatter
   * for each `inspector.format(...)`.)
   */
  format(formatter: RoutesFormatter = new Sheet(), filter: RoutesFilter = {}): string {
    this.engines = {};
    const routes = this.collectRoutes(this.filterRoutes(this.normalizeFilter(filter)));
    if (routes.length === 0) {
      formatter.noRoutes(this.collectRoutes(this.routes), filter);
      return formatter.result();
    }
    formatter.header(routes);
    formatter.section(routes);
    for (const [name, engineRoutes] of Object.entries(this.engines)) {
      formatter.sectionTitle(`Routes for ${name}`);
      formatter.section(engineRoutes);
    }
    return formatter.result();
  }

  /** @internal */
  private normalizeFilter(filter: RoutesFilter): NormalizedFilter {
    if (filter.controller) {
      return { controller: new RegExp(underscore(filter.controller).replace(/_?controller$/, "")) };
    }
    if (filter.grep) {
      const re = new RegExp(filter.grep);
      // Rails uses `URI::RFC2396_PARSER.escape(filter[:grep])`, which escapes
      // reserved chars like `?`/`#` that `encodeURI` deliberately leaves alone.
      // `escapePath` (journey/router/utils) is the trails RFC3986-safe analogue.
      const normalizedPath = ("/" + escapePath(filter.grep)).replace(/\/+/g, "/");
      return {
        controller: re,
        action: re,
        verb: re,
        name: re,
        path: re,
        exact_path_match: normalizedPath,
      };
    }
    return null;
  }

  /** @internal */
  private filterRoutes(filter: NormalizedFilter): readonly Route[] {
    if (!filter) return this.routes;
    return this.routes.filter((route) => {
      const w = new RouteWrapper(route);
      return Object.entries(filter).some(([k, v]) => w.isMatchesFilter(k, v));
    });
  }

  /** @internal */
  private collectRoutes(routes: readonly Route[]): CollectedRoute[] {
    return routes
      .map((r) => new RouteWrapper(r))
      .filter((w) => !w.isInternal())
      .map((w) => {
        this.collectEngineRoutes(w);
        return {
          name: w.name,
          verb: w.verb,
          path: w.path,
          reqs: w.reqs,
          sourceLocation: w.sourceLocation,
        };
      });
  }

  /** @internal */
  private collectEngineRoutes(route: RouteWrapper): void {
    if (!route.isEngine()) return;
    const name = route.endpoint;
    if (this.engines[name]) return;
    const app = route.rackApp as { routes?: { routes?: readonly Route[] } } | undefined;
    const engineRoutes = app?.routes?.routes;
    if (engineRoutes) this.engines[name] = this.collectRoutes(engineRoutes);
  }
}

/** Output contract shared by every routes formatter (console + HTML). */
export interface RoutesFormatter {
  result(): string;
  sectionTitle(title: string): void;
  section(routes: CollectedRoute[]): void;
  header(routes: CollectedRoute[]): void;
  noRoutes(routes: CollectedRoute[], filter: RoutesFilter): void;
}

export class Base implements RoutesFormatter {
  protected buffer: string[] = [];

  result(): string {
    return this.buffer.join("\n");
  }
  sectionTitle(_title: string): void {}
  section(_routes: CollectedRoute[]): void {}
  header(_routes: CollectedRoute[]): void {}

  noRoutes(routes: CollectedRoute[], filter: RoutesFilter): void {
    let msg: string;
    if (routes.length === 0) {
      msg = "You don't have any routes defined!\n\nPlease add some routes in config/routes.rb.\n";
    } else if (filter.controller !== undefined) {
      msg = "No routes were found for this controller.";
    } else if (filter.grep !== undefined) {
      msg = "No routes were found for this grep pattern.";
    } else {
      msg = "";
    }
    this.buffer.push(msg);
    this.buffer.push(
      "For more information about routes, see the Rails guide: https://guides.rubyonrails.org/routing.html.",
    );
  }
}

export class Sheet extends Base {
  override sectionTitle(title: string): void {
    this.buffer.push(`\n${title}:`);
  }
  override section(routes: CollectedRoute[]): void {
    this.buffer.push(this.drawSection(routes).join("\n"));
  }
  override header(routes: CollectedRoute[]): void {
    this.buffer.push(this.drawHeader(routes));
  }

  /** @internal */
  private drawSection(routes: CollectedRoute[]): string[] {
    const [n, v, p] = this.widthsWithHeaders(routes);
    return routes.map(
      (r) => `${r.name.padStart(n)} ${r.verb.padEnd(v)} ${r.path.padEnd(p)} ${r.reqs}`,
    );
  }

  /** @internal */
  private drawHeader(routes: CollectedRoute[]): string {
    const [n, v, p] = this.widths(routes);
    return `${"Prefix".padStart(n)} ${"Verb".padEnd(v)} ${"URI Pattern".padEnd(p)} Controller#Action`;
  }

  /** @internal */
  private widths(routes: CollectedRoute[]): [number, number, number] {
    return [
      Math.max(0, ...routes.map((r) => r.name.length)),
      Math.max(0, ...routes.map((r) => r.verb.length)),
      Math.max(0, ...routes.map((r) => r.path.length)),
    ];
  }

  private widthsWithHeaders(routes: CollectedRoute[]): [number, number, number] {
    const [n, v, p] = this.widths(routes);
    return [Math.max(n, 6), Math.max(v, 4), Math.max(p, 11)];
  }
}

export class Expanded extends Base {
  private width: number;

  constructor(width = 80) {
    super();
    this.width = width;
  }

  override sectionTitle(title: string): void {
    this.buffer.push(`\n[ ${title} ]`);
  }
  override section(routes: CollectedRoute[]): void {
    this.buffer.push(this.drawExpandedSection(routes).join("\n"));
  }

  /** @internal */
  private drawExpandedSection(routes: CollectedRoute[]): string[] {
    return routes.map((r, i) => {
      let rows =
        `${this.routeHeader(i + 1)}\nPrefix            | ${r.name}\nVerb              | ${r.verb}\n` +
        `URI               | ${r.path}\nController#Action | ${r.reqs}`;
      if (r.sourceLocation) rows += `\nSource Location   | ${r.sourceLocation}`;
      return rows;
    });
  }

  /** @internal */
  private routeHeader(index: number): string {
    const prefix = `--[ Route ${index} ]`;
    return prefix.length >= this.width ? prefix : prefix + "-".repeat(this.width - prefix.length);
  }
}

export class Unused extends Sheet {
  override header(routes: CollectedRoute[]): void {
    this.buffer.push(`Found ${routes.length} unused ${pluralize("route", routes.length)}:\n`);
    super.header(routes);
  }

  override noRoutes(_routes: CollectedRoute[], filter: RoutesFilter): void {
    let msg: string;
    if (filter.controller === undefined && filter.grep === undefined) {
      msg = "No unused routes found.";
    } else if (filter.controller !== undefined) {
      msg = "No unused routes found for this controller.";
    } else {
      msg = "No unused routes found for this grep pattern.";
    }
    this.buffer.push(msg);
  }
}

export const ConsoleFormatter = { Base, Sheet, Expanded, Unused };

// HtmlTableFormatter is intentionally deferred — it needs an ActionView
// collaborator (`view.render({ partial, layout, collection })` + `view.raw`)
// that isn't wired up in trails yet, so shipping it before its render
// dependency would just stub the visible methods. Follow-up PR.
