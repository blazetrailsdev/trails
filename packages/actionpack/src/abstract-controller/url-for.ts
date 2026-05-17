/**
 * `AbstractController::UrlFor` — Rails-shaped contract that the route
 * set + action-method filtering rely on. Rails additionally `include
 * ActionDispatch::Routing::UrlFor` here to provide the actual
 * `urlFor(...)` instance method; that mixin is **not yet ported**.
 *
 * This module currently provides:
 *  - `_routesInstanceDefault` / `_routesClassDefault` — the literal
 *    `null` defaults trails uses on hosts that haven't wired up
 *    routes yet (`_routes` is a property in trails, not a method)
 *  - `NO_ROUTES_MESSAGE` — the Rails-shaped hint to surface at the
 *    eventual `urlFor()` call site
 *  - `filterActionMethodsForRoutes`, used by hosts to strip named-route
 *    helper names out of their `actionMethods` list (mirrors Rails'
 *    `ClassMethods#action_methods` override)
 *
 * Ported from `vendor/rails/actionpack/lib/abstract_controller/url_for.rb`.
 */

export interface NamedRoutesLike {
  /**
   * Names of generated route helpers (e.g. `posts_path`, `post_url`).
   * Typed as `readonly string[]` to match how consumers actually use
   * it — `UrlGenerationError#corrections` (in
   * `action-controller/metal/exceptions.ts`) calls `.filter().slice()`
   * on it. If a future `NamedRouteCollection` port wants to expose a
   * Set internally, it should still return an array here.
   */
  helperNames: readonly string[];
}

export interface RouteSetLike {
  namedRoutes: NamedRoutesLike;
  /**
   * Default Rack env merged underneath request-specific env when the
   * controller generates URLs. Consumed by
   * `action-controller/renderer.ts#envForRequest`.
   */
  defaultEnv?: Record<string, unknown>;
}

/**
 * Static-side contract for `_routes`. Hosts that include UrlFor expose
 * this on the class. **It's a property, not a method** — trails reads
 * `controller._routes` directly (see `action-controller/renderer.ts`'s
 * `envForRequest`), unlike Rails which uses a `def _routes` method.
 * `null` means "no routes wired up yet"; `filterActionMethodsForRoutes`
 * then returns the unfiltered action set.
 */
export interface UrlForClassMethods {
  _routes: RouteSetLike | null;
}

/**
 * Hint shown when a host tries to use `#url_for` before any route set
 * is wired up. Use this at the eventual `urlFor()` call site (the
 * ActionDispatch::Routing::UrlFor mixin, not yet ported).
 */
export const NO_ROUTES_MESSAGE =
  "In order to use #url_for, you must include routing helpers explicitly. " +
  "For instance, `include Rails.application.routes.url_helpers`.";

/**
 * Class-side default for `_routes` — `null`. Conforms to
 * `UrlForClassMethods._routes`. Hosts override this on the class once
 * a route set is wired up.
 *
 * Note: trails treats `_routes` as a property (not a method), so the
 * default is the literal value `null` rather than a function returning
 * `null`. The renderer reads `controller._routes` and dereferences
 * `.defaultEnv` directly.
 */
export const _routesClassDefault: RouteSetLike | null = null;

/** Per-instance default; same property-based contract. */
export const _routesInstanceDefault: RouteSetLike | null = null;

/**
 * Convenience bag of Rails-shaped defaults. Use this to wire both
 * sides of the contract at once without renaming:
 *
 * ```ts
 * Host.prototype._routes = UrlForDefaults._routes;
 * (Host as { _routes: RouteSetLike | null })._routes = UrlForDefaults._routesStatic;
 * ```
 */
export const UrlForDefaults = {
  _routes: _routesInstanceDefault,
  _routesStatic: _routesClassDefault,
} as const;

/**
 * Filter `actionMethods` by removing any names that collide with
 * named-route helper names. Mirrors Rails' `ClassMethods#action_methods`
 * override: when `_routes` is wired up, the method list shrinks by
 * the helper names so routing helpers don't show up as actions.
 *
 * @param baseActionMethods The unfiltered action list (typically from
 *   `AbstractController.actionMethods()`).
 * @param routes The route set returned by `_routes`, or `null`.
 */
export function filterActionMethodsForRoutes(
  baseActionMethods: readonly string[],
  routes: RouteSetLike | null,
): string[] {
  if (!routes) return [...baseActionMethods];
  const helpers = new Set(routes.namedRoutes.helperNames);
  return baseActionMethods.filter((name) => !helpers.has(name));
}
