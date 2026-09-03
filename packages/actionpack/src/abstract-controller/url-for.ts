export interface NamedRoutesLike {
  helperNames(): readonly string[];
}

export interface RouteSetLike {
  namedRoutes: NamedRoutesLike;
  defaultEnv?: Record<string, unknown>;
}

export interface UrlForClassMethods {
  _routes: RouteSetLike | null;
}

export const NO_ROUTES_MESSAGE =
  "In order to use #url_for, you must include routing helpers explicitly. " +
  "For instance, `include Rails.application.routes.url_helpers`.";

export const _routesClassDefault: RouteSetLike | null = null;

export const _routesInstanceDefault: RouteSetLike | null = null;

export const UrlForDefaults = {
  _routes: _routesInstanceDefault,
  _routesStatic: _routesClassDefault,
} as const;

/** @internal */
export function _routes(host?: { _routes?: RouteSetLike | null }): RouteSetLike | null {
  return host?._routes ?? _routesClassDefault;
}

/** @internal */
export function actionMethods(
  baseActionMethods: readonly string[],
  routes: RouteSetLike | null = _routesClassDefault,
): string[] {
  if (!routes) return [...baseActionMethods];
  const helpers = new Set(routes.namedRoutes.helperNames());
  return baseActionMethods.filter((name) => !helpers.has(name));
}
