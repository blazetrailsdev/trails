/**
 * ActionDispatch::Routing::RouteHelpers
 *
 * Generates `_path` and `_url` helper functions from named routes in a RouteSet.
 * In Rails, these are methods like `posts_path`, `post_url(id)`, etc.
 *
 * Usage:
 *   const helpers = RouteHelpers.generate(routeSet);
 *   helpers.posts_path()        // => "/posts"
 *   helpers.post_path(1)        // => "/posts/1"
 *   helpers.post_url(1)         // => "http://localhost/posts/1"
 */

import type { RouteSet } from "./route-set.js";
import type { Route } from "./route.js";

export type PathHelper = (...args: any[]) => string;
export type UrlHelper = (...args: any[]) => string;

export interface RouteHelpersMap {
  [name: string]: PathHelper | UrlHelper;
}

/**
 * Generate route helper functions from a RouteSet.
 */
export function generateRouteHelpers(
  routeSet: RouteSet,
  urlOptions: { host?: string; protocol?: string } = {},
): RouteHelpersMap {
  const helpers: RouteHelpersMap = {};
  const namedRoutes = routeSet.getNamedRoutes();

  for (const [name, route] of namedRoutes) {
    const paramNames = extractParamNames(route.path);

    // _path helper
    helpers[`${name}_path`] = createPathHelper(routeSet, name, paramNames);

    // _url helper
    helpers[`${name}_url`] = createUrlHelper(routeSet, name, paramNames, urlOptions);
  }

  return helpers;
}

/**
 * Extract dynamic parameter names from a route path.
 * "/posts/:id/comments/:comment_id" => ["id", "comment_id"]
 */
function extractParamNames(path: string): string[] {
  const names: string[] = [];
  const parts = path.split("/");
  for (const part of parts) {
    if (part.startsWith(":")) {
      names.push(part.slice(1));
    } else if (part.startsWith("*")) {
      names.push(part.slice(1));
    }
  }
  return names;
}

/**
 * Create a _path helper for a named route.
 *
 * Supports two calling conventions (like Rails):
 *   post_path(1)             — positional args mapped to params in order
 *   post_path({ id: 1 })     — explicit params hash
 */
function createPathHelper(
  routeSet: RouteSet,
  routeName: string,
  paramNames: string[],
): PathHelper {
  return function (...args: any[]): string {
    const params = resolveArgs(paramNames, args);
    return routeSet.pathFor(routeName, params);
  };
}

/**
 * Create a _url helper for a named route.
 */
function createUrlHelper(
  routeSet: RouteSet,
  routeName: string,
  paramNames: string[],
  defaultOptions: { host?: string; protocol?: string },
): UrlHelper {
  return function (...args: any[]): string {
    const { params, options } = resolveArgsWithOptions(paramNames, args);
    const host = options.host ?? defaultOptions.host;
    const protocol = options.protocol ?? defaultOptions.protocol ?? "http";

    const path = routeSet.pathFor(routeName, params);

    if (options.onlyPath) return path;

    if (!host) {
      throw new Error(
        "Missing host to link to! Please provide the :host parameter or set default_url_options[:host]",
      );
    }

    return `${protocol}://${host}${path}`;
  };
}

/**
 * Resolve arguments into a params hash.
 * Supports positional args or a single hash argument.
 */
function resolveArgs(
  paramNames: string[],
  args: any[],
): Record<string, string | number> {
  if (args.length === 0) return {};

  // Single object argument => params hash
  if (args.length === 1 && typeof args[0] === "object" && args[0] !== null) {
    return args[0];
  }

  // Positional arguments mapped to param names in order
  const params: Record<string, string | number> = {};
  for (let i = 0; i < Math.min(args.length, paramNames.length); i++) {
    params[paramNames[i]] = args[i];
  }
  return params;
}

/**
 * Resolve arguments into params + options (for _url helpers).
 * The last argument may contain url options like host, protocol, onlyPath.
 */
function resolveArgsWithOptions(
  paramNames: string[],
  args: any[],
): { params: Record<string, string | number>; options: { host?: string; protocol?: string; onlyPath?: boolean } } {
  if (args.length === 0) return { params: {}, options: {} };

  const URL_OPTION_KEYS = new Set(["host", "protocol", "onlyPath", "only_path", "port", "anchor"]);

  // Single object: separate url options from route params
  if (args.length === 1 && typeof args[0] === "object" && args[0] !== null) {
    const obj = args[0];
    const params: Record<string, string | number> = {};
    const options: any = {};
    for (const [k, v] of Object.entries(obj)) {
      if (URL_OPTION_KEYS.has(k)) {
        options[k] = v;
      } else {
        params[k] = v as string | number;
      }
    }
    if (obj.only_path !== undefined) options.onlyPath = obj.only_path;
    return { params, options };
  }

  // Multiple args: last one might be options hash
  const lastArg = args[args.length - 1];
  let urlOptions: any = {};
  let positionalArgs = args;

  if (typeof lastArg === "object" && lastArg !== null && args.length > paramNames.length) {
    urlOptions = lastArg;
    positionalArgs = args.slice(0, -1);
  }

  const params: Record<string, string | number> = {};
  for (let i = 0; i < Math.min(positionalArgs.length, paramNames.length); i++) {
    params[paramNames[i]] = positionalArgs[i];
  }

  return { params, options: urlOptions };
}
