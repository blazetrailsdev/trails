import type { RouteSet } from "./route-set.js";

export type PathHelper = (...args: any[]) => string;
export type UrlHelper = (...args: any[]) => string;

export interface RouteHelpersMap {
  [name: string]: PathHelper | UrlHelper;
}

export function generateRouteHelpers(
  routeSet: RouteSet,
  urlOptions: { host?: string; protocol?: string } = {},
): RouteHelpersMap {
  const helpers: RouteHelpersMap = {};
  const namedRoutes = routeSet.getNamedRoutes();

  for (const [name, route] of namedRoutes) {
    const paramNames = extractParamNames(route.path);

    helpers[`${name}_path`] = createPathHelper(routeSet, name, paramNames);

    helpers[`${name}_url`] = createUrlHelper(routeSet, name, paramNames, urlOptions);
  }

  return helpers;
}

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

function createPathHelper(routeSet: RouteSet, routeName: string, paramNames: string[]): PathHelper {
  return function (...args: any[]): string {
    const params = resolveArgs(paramNames, args);
    return routeSet.pathFor(routeName, params);
  };
}

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

function resolveArgs(paramNames: string[], args: any[]): Record<string, string | number> {
  if (args.length === 0) return {};

  if (args.length === 1 && typeof args[0] === "object" && args[0] !== null) {
    return args[0];
  }

  const params: Record<string, string | number> = {};
  for (let i = 0; i < Math.min(args.length, paramNames.length); i++) {
    params[paramNames[i]] = args[i];
  }
  return params;
}

function resolveArgsWithOptions(
  paramNames: string[],
  args: any[],
): {
  params: Record<string, string | number>;
  options: { host?: string; protocol?: string; onlyPath?: boolean };
} {
  if (args.length === 0) return { params: {}, options: {} };

  const URL_OPTION_KEYS = new Set(["host", "protocol", "onlyPath", "only_path", "port", "anchor"]);

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
