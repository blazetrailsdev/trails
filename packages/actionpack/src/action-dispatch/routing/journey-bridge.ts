import { Parser } from "../journey/parser.js";
import { Ast } from "../journey/ast.js";
import { Pattern } from "../journey/path/pattern.js";
import { Route as JourneyRoute, VerbMatchers } from "../journey/route.js";
import { Routes as JourneyRoutes } from "../journey/routes.js";
import {
  Router as JourneyRouter,
  type RoutableApp,
  type RouterRequest,
} from "../journey/router.js";
import { normalizePath, unescapeUri } from "../journey/router/utils.js";
import type { Route as LocalRoute } from "./route.js";

const SEPARATORS = "/.?";

const JOURNEY_TO_LOCAL = new WeakMap<JourneyRoute, LocalRoute>();

export interface JourneyMatch {
  route: LocalRoute;
  params: Record<string, string>;
  matchedPrefix?: string;
  postMatch?: string;
}

export interface BuildJourneyRouterOptions {
  skipRequestConstraints?: boolean;
  app?: (route: LocalRoute) => RoutableApp;
}

export function buildJourneyRouter(
  routes: readonly LocalRoute[],
  opts: BuildJourneyRouterOptions = {},
): JourneyRouter {
  const journeyRoutes = new JourneyRoutes();
  for (let i = 0; i < routes.length; i++) {
    const r = routes[i];
    const tree = new Parser().parse(r.path);
    const ast = new Ast(tree, true);
    const requirements = regexpRequirements(r.pathConstraints);
    const pattern = new Pattern(ast, requirements, SEPARATORS, r.anchor);
    const verb = (r.verb || "").toUpperCase();
    const requestMethodMatch = !verb || verb === "ALL" ? undefined : [VerbMatchers.for(verb)];
    const name = r.name ?? `__r${i}`;
    const app = opts.app?.(r);
    journeyRoutes.addRoute(name, {
      makeRoute: (routeName, index) => {
        const journeyRoute = new JourneyRoute({
          name: routeName,
          app,
          path: pattern,
          constraints: opts.skipRequestConstraints ? {} : r.requestConstraints,
          defaults: {
            ...r.defaults,
            ...(r.controller ? { controller: r.controller } : {}),
            ...(r.action ? { action: r.action } : {}),
          },
          requestMethodMatch,
          precedence: index,
        });
        JOURNEY_TO_LOCAL.set(journeyRoute, r);
        return journeyRoute;
      },
    });
  }
  return new JourneyRouter(journeyRoutes);
}

export function journeyRecognize(
  router: JourneyRouter,
  method: string,
  path: string,
): JourneyMatch | null {
  const pathInfo = normalizePath(path);
  const req: RouterRequest = {
    pathInfo,
    scriptName: "",
    requestMethod: method.toUpperCase(),
    pathParameters: {},
  };
  let result: JourneyMatch | null = null;
  router.recognize(req, (journeyRoute) => {
    const local = JOURNEY_TO_LOCAL.get(journeyRoute);
    if (!local) return;
    const match = journeyRoute.path.match(pathInfo);
    const params: Record<string, string> = {};
    if (match) {
      for (const [name, value] of Object.entries(match.namedCaptures)) {
        if (value != null) params[name] = unescapeUri(value);
      }
    }
    result = { route: local, params };
    if (match && !journeyRoute.path.anchored) {
      const post = match.postMatch();
      result.matchedPrefix = match.toString().replace(/\/$/, "");
      result.postMatch = post.startsWith("/") ? post : "/" + post;
    }
    return true;
  });
  return result;
}

function stripAnchors(source: string): string {
  let s = source;
  if (s.startsWith("^")) s = s.slice(1);
  if (s.endsWith("$")) {
    let backslashes = 0;
    for (let i = s.length - 2; i >= 0 && s[i] === "\\"; i--) backslashes++;
    if (backslashes % 2 === 0) s = s.slice(0, -1);
  }
  return s;
}

function regexpRequirements(c: Record<string, unknown>): Record<string, RegExp> {
  const out: Record<string, RegExp> = {};
  for (const [k, v] of Object.entries(c)) {
    if (v instanceof RegExp) {
      out[k] = new RegExp(stripAnchors(v.source), v.flags);
    } else if (typeof v === "string") {
      out[k] = new RegExp(stripAnchors(v));
    }
  }
  return out;
}
