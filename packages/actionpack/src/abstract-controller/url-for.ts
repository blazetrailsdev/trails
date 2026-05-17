/**
 * `AbstractController::UrlFor` — Rails-shaped contract that the route
 * set + action-method filtering rely on. Rails additionally `include
 * ActionDispatch::Routing::UrlFor` here to provide the actual
 * `urlFor(...)` instance method; that mixin is **not yet ported**.
 *
 * This module currently provides:
 *  - the instance-side `_routes` stub that throws until the host wires
 *    in a real route set
 *  - the class-side `_routes` default that returns `null`
 *  - `filterActionMethodsForRoutes`, used by hosts to strip named-route
 *    helper names out of their `actionMethods` list (mirrors Rails'
 *    `ClassMethods#action_methods` override)
 *
 * Ported from `vendor/rails/actionpack/lib/abstract_controller/url_for.rb`.
 */

export interface NamedRoutesLike {
  helperNames: readonly string[];
}

export interface RouteSetLike {
  namedRoutes: NamedRoutesLike;
}

/**
 * Static-side contract for `_routes`. Hosts that include UrlFor must
 * supply this on the class (mirrors Rails' `module ClassMethods; def
 * _routes; …; end; end`). Returning `null` is valid and means "no
 * routes wired up yet" — `actionMethods` then returns the unfiltered
 * action set.
 */
export interface UrlForClassMethods {
  _routes(): RouteSetLike | null;
}

const NO_ROUTES_MESSAGE =
  "In order to use #url_for, you must include routing helpers explicitly. " +
  "For instance, `include Rails.application.routes.url_helpers`.";

/**
 * Default instance-side `_routes` — raises until the host overrides
 * it. Mirrors Rails: trying to generate URLs before the routes are
 * wired up should fail loudly with a hint.
 */
export function _routesInstanceDefault(this: object): never {
  throw new Error(NO_ROUTES_MESSAGE);
}

/**
 * Default class-side `_routes` — returns `null`. Conforms to
 * `UrlForClassMethods#_routes`. Hosts override this on the class once
 * a route set is wired up.
 */
export const _routesClassDefault: UrlForClassMethods["_routes"] = () => null;

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
