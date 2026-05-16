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
  const req: RouterRequest = {
    pathInfo: path,
    scriptName: "",
    requestMethod: method.toUpperCase(),
    pathParameters: {},
  };
  let result: JourneyMatch | null = null;
  try {
    router.recognize(req, (journeyRoute, parameters) => {
      const local = JOURNEY_TO_LOCAL.get(journeyRoute);
      if (!local) return;
      const captureNames = new Set(journeyRoute.path.names);
      const params: Record<string, string> = {};
      for (const name of captureNames) {
        const v = parameters[name];
        if (v != null) params[name] = String(v);
      }
      result = { route: local, params };
      // Router.recognize iterates all matches; short-circuit so large route
      // sets aren't fully walked after the first hit.
      throw STOP;
    });
  } catch (e) {
    if (e !== STOP) throw e;
  }
  return result;
}

const STOP = Symbol("journey-bridge-stop");

function regexpRequirements(c: Record<string, unknown>): Record<string, RegExp> {
  const out: Record<string, RegExp> = {};
  for (const [k, v] of Object.entries(c)) {
    // Journey inlines `requirements[*].source` into an outer `^…$` regex, so
    // we must strip embedded anchors from RegExp sources and never add them
    // for string constraints — otherwise the anchor binds to the whole path.
    if (v instanceof RegExp) {
      const source = v.source.replace(/^\^/, "").replace(/\$$/, "");
      out[k] = new RegExp(source, v.flags);
    } else if (typeof v === "string") {
      out[k] = new RegExp(v);
    }
  }
  return out;
}
