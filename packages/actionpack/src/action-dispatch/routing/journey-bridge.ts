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
  /**
   * For unanchored routes (e.g. `mount`), the matched prefix that should be
   * appended to `SCRIPT_NAME` when forwarding to a mounted Rack app. Mirrors
   * `match.to_s` in Rails' `action_dispatch/journey/router.rb`. Undefined for
   * anchored routes.
   */
  matchedPrefix?: string;
  /**
   * For unanchored routes, the un-matched remainder of `PATH_INFO` (always
   * starting with `/`). Mirrors `match.post_match` in Rails' Journey router.
   * Undefined for anchored routes.
   */
  postMatch?: string;
}

export interface BuildJourneyRouterOptions {
  /**
   * Skip request-attribute constraints (subdomain, format, etc.) on the
   * synthesized Journey routes. Use for path-only matchers like
   * `Route#match(method, path)` where the caller has no real request to
   * evaluate request constraints against — otherwise `Route#matches`
   * would reject every request because the constraint keys are undefined
   * on the synthetic RouterRequest.
   */
  skipRequestConstraints?: boolean;
  /**
   * App attached to every synthesized Journey route. When omitted, routes
   * carry a throwing stub — callers that only use `Router.recognize` /
   * `journeyRecognize` never trigger it. Pass a `RouteDispatcher` here to
   * make `Router.serve` actually dispatch.
   */
  app?: RoutableApp;
}

export function buildJourneyRouter(
  routes: readonly LocalRoute[],
  opts: BuildJourneyRouterOptions = {},
): JourneyRouter {
  const journeyRoutes = new JourneyRoutes();
  for (let i = 0; i < routes.length; i++) {
    const r = routes[i]!;
    const tree = new Parser().parse(r.path);
    const ast = new Ast(tree, true);
    // Path-capture constraints become pattern requirements; request-attribute
    // constraints (subdomain, format, etc.) stay on the Journey Route so
    // Route#matches can apply them per-request. Route owns this split because
    // it already knows which constraint keys are path captures.
    const requirements = regexpRequirements(r.pathConstraints);
    const pattern = new Pattern(ast, requirements, SEPARATORS, r.anchor);
    const verb = (r.verb || "").toUpperCase();
    const requestMethodMatch = !verb || verb === "ALL" ? undefined : [VerbMatchers.for(verb)];
    const name = r.name ?? `__r${i}`;
    // controller/action are authoritative on the local Route; user defaults
    // must not overwrite them. Precedence is the insertion index so
    // Router.recognize's precedence sort preserves RouteSet order.
    const fallbackApp: RoutableApp = {
      serve: () => {
        throw new Error(
          `Journey-bridge route '${name}' has no app — use RouteSet.call(), not journeyRouter.serve().`,
        );
      },
    };
    const app = opts.app ?? fallbackApp;
    journeyRoutes.addRoute(name, {
      makeRoute: (routeName, index) => {
        const journeyRoute = new JourneyRoute({
          name: routeName,
          app,
          path: pattern,
          constraints: opts.skipRequestConstraints ? {} : r.requestConstraints,
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
    // For unanchored routes (mounts), expose the matched prefix and
    // post-match so callers can rewrite SCRIPT_NAME / PATH_INFO the same
    // way Rails' Journey router does (action_dispatch/journey/router.rb).
    if (match && !journeyRoute.path.anchored) {
      const post = match.postMatch();
      result.matchedPrefix = match.toString().replace(/\/$/, "");
      result.postMatch = post.startsWith("/") ? post : "/" + post;
    }
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
