/**
 * `AbstractController::Railties::RoutesHelpers` (trails: `Trailties`) — factory that
 * produces a per-class wiring step. The Rails version returns an
 * anonymous `Module` whose `inherited(klass)` hook walks
 * `klass.module_parents` for a namespace exposing
 * `railtie_routes_url_helpers` and includes the appropriate URL-helper
 * module into the subclass; if no namespace has one, it falls back to
 * `routes.url_helpers(include_path_helpers)`.
 *
 * TS has no `inherited` trigger and no `module_parents` traversal,
 * so the factory returns a *function* the host calls on each new
 * subclass. The Ruby namespace chain (e.g. `Admin::PostsController`
 * → `[Admin, Object]`) has no JS equivalent; we approximate by
 * walking the class's own static-side prototype chain for an
 * optional `trailtieRoutesUrlHelpers` slot. This catches the common
 * "Admin::PostsController extends AdminController" shape but won't
 * find a same-name namespace module that isn't an ancestor class —
 * a documented deviation, not a fixable gap.
 *
 * The URL-helpers module is mixed into the controller class as
 * instance methods (mirroring Rails' `klass.include(mod)`), so an
 * action can call `this.postPath(post)` directly. Bridging to views
 * is the job of `ActionController::Helpers`, not this factory.
 *
 * Ported from `vendor/rails/actionpack/lib/abstract_controller/railties/routes_helpers.rb`.
 *
 * @internal
 */

import type { HelperMethodsModule, HelpersClassMethods } from "../helpers.js";

/**
 * Minimum shape this factory needs from a route set. Once a real
 * `RouteSet` lands in `action-dispatch/routing`, that class can
 * implement this interface directly.
 */
export interface UrlHelpersRouteSet {
  urlHelpers(includePathHelpers?: boolean): HelperMethodsModule;
}

/**
 * Optional class-level slot: if a host class (or one of its
 * inheritance chain ancestors) wants to override the inherited
 * url-helper module, it sets `trailtieRoutesUrlHelpers` to a builder
 * function. Mirrors the Rails `respond_to?(:railtie_routes_url_helpers)`
 * branch.
 */
export interface RoutesHelpersClassMethods extends HelpersClassMethods {
  trailtieRoutesUrlHelpers?(includePathHelpers?: boolean): HelperMethodsModule;
}

/**
 * `RoutesHelpers.with(routes, include_path_helpers)` — returns a
 * subclass-init function. Hosts invoke the returned function with the
 * new controller class to wire its URL helpers.
 *
 *     const wire = withRoutesHelpers(routes);
 *     wire(PostsController);
 */
export function withRoutesHelpers(
  routes: UrlHelpersRouteSet,
  includePathHelpers = true,
): (cls: RoutesHelpersControllerClass) => void {
  return (cls) => {
    const namespaceBuilder = findTrailtieUrlHelpers(cls);
    const mod = namespaceBuilder
      ? namespaceBuilder(includePathHelpers)
      : routes.urlHelpers(includePathHelpers);
    // Rails: `klass.include(mod)` — make URL helpers available as
    // instance methods on the controller. Copy each method onto the
    // class prototype. Iterate with `for...in` so methods reachable
    // via prototype chains (e.g. a helpers module built through
    // `_helpersForModification` / `makeIncludeLink` proxy nodes)
    // aren't silently skipped.
    const proto = cls.prototype as Record<string, unknown>;
    for (const name in mod) {
      const fn = (mod as Record<string, unknown>)[name];
      if (typeof fn === "function") proto[name] = fn;
    }
  };
}

/**
 * Combined shape: a class (`{ prototype }`) optionally carrying the
 * namespace-helper slot. Splitting these into two types would force
 * every caller to intersect them; the union keeps the API ergonomic.
 */
export interface RoutesHelpersControllerClass extends RoutesHelpersClassMethods {
  prototype: object;
}

function findTrailtieUrlHelpers(
  cls: RoutesHelpersClassMethods,
): RoutesHelpersClassMethods["trailtieRoutesUrlHelpers"] {
  let current: object | null = cls;
  // Stop before Function.prototype / Object.prototype so a polyfill
  // or accidental property defined there can't be picked up. Rails
  // restricts the lookup to namespace modules; we restrict to
  // user-defined classes.
  while (current && current !== Function.prototype && current !== Object.prototype) {
    const own = Object.getOwnPropertyDescriptor(current, "trailtieRoutesUrlHelpers")?.value as
      | RoutesHelpersClassMethods["trailtieRoutesUrlHelpers"]
      | undefined;
    if (typeof own === "function") return own;
    current = Object.getPrototypeOf(current);
  }
  return undefined;
}
