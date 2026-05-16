/**
 * Journey-bridge: builds a `Journey::Router` from a `RouteSet`'s local
 * `Route` objects so dispatch can be exercised end-to-end through the
 * journey engine. The bridge is a seam — `RouteSet#recognize` still
 * delegates to the local matcher for now; consumers can opt in to the
 * journey-backed path via `RouteSet#journeyRouter` / `journeyRecognize`.
 */

import { Parser } from "../journey/parser.js";
import { Ast } from "../journey/ast.js";
import { Pattern } from "../journey/path/pattern.js";
import { Route as JourneyRoute, VerbMatchers } from "../journey/route.js";
import { Routes as JourneyRoutes } from "../journey/routes.js";
import { Router as JourneyRouter, type RouterRequest } from "../journey/router.js";
import { normalizePath, unescapeUri } from "../journey/router/utils.js";
import type { Route as LocalRoute } from "./route.js";

const SEPARATORS = "/.?";

const JOURNEY_TO_LOCAL = new WeakMap<JourneyRoute, LocalRoute>();

export interface JourneyMatch {
  route: LocalRoute;
  params: Record<string, string>;
}

export function buildJourneyRouter(routes: readonly LocalRoute[]): JourneyRouter {
  const journeyRoutes = new JourneyRoutes();
  for (let i = 0; i < routes.length; i++) {
    const r = routes[i]!;
    const tree = new Parser().parse(r.path);
    const ast = new Ast(tree, true);
    const requirements = regexpRequirements(r.constraints);
    const pattern = new Pattern(ast, requirements, SEPARATORS, r.anchor);
    // Path-name constraints belong in the pattern, not on the JourneyRoute,
    // or Route#matches will recheck them against request properties (where
    // the captured value isn't yet) and reject every request. Rails splits
    // these the same way.
    const pathNames = new Set(pattern.names);
    const requestConstraints: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r.constraints)) {
      if (!pathNames.has(k)) requestConstraints[k] = v;
    }
    const verb = (r.verb || "").toUpperCase();
    const requestMethodMatch = !verb || verb === "ALL" ? undefined : [VerbMatchers.for(verb)];
    const name = r.name ?? `__r${i}`;
    // controller/action are authoritative on the local Route; user defaults
    // must not overwrite them. Precedence is the insertion index so
    // Router.recognize's precedence sort preserves RouteSet order.
    journeyRoutes.addRoute(name, {
      makeRoute: (routeName, index) => {
        const journeyRoute = new JourneyRoute({
          name: routeName,
          app: {
            serve: () => {
              throw new Error(
                `Journey-bridge route '${routeName}' has no app — use RouteSet.call(), not journeyRouter.serve().`,
              );
            },
          },
          path: pattern,
          constraints: requestConstraints,
          defaults: { ...r.defaults, controller: r.controller, action: r.action },
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
    // Re-match against the pattern so we get *only* captured segments —
    // the parameters Router.recognize yields are merged with defaults,
    // which leaks defaults into optional captures (e.g. /posts(/:id)
    // with defaults={id:"1"} matching /posts).
    const match = journeyRoute.path.match(pathInfo);
    const params: Record<string, string> = {};
    if (match) {
      for (const [name, value] of Object.entries(match.namedCaptures)) {
        if (value != null) params[name] = unescapeUri(value);
      }
    }
    result = { route: local, params };
    return true; // stop iterating after the first hit
  });
  return result;
}

function stripAnchors(source: string): string {
  let s = source;
  if (s.startsWith("^")) s = s.slice(1);
  // Only strip a trailing `$` if it's a true end-of-string anchor — i.e. not
  // preceded by an odd number of backslashes (which would mean it's `\$`,
  // a literal dollar sign).
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
    // Journey inlines `requirements[*].source` into an outer `^…$` regex, so
    // we must strip embedded anchors from RegExp sources and never add them
    // for string constraints — otherwise the anchor binds to the whole path.
    if (v instanceof RegExp) {
      out[k] = new RegExp(stripAnchors(v.source), v.flags);
    } else if (typeof v === "string") {
      out[k] = new RegExp(stripAnchors(v));
    }
  }
  return out;
}
