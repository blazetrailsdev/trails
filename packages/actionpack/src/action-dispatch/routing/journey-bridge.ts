import type { Route as JourneyRoute } from "../journey/route.js";
import type { Router as JourneyRouter, RouterRequest } from "../journey/router.js";
import { normalizePath, unescapeUri } from "../journey/router/utils.js";
import { Request } from "../http/request.js";

export interface JourneyMatch {
  route: JourneyRoute;
  params: Record<string, string>;
  matchedPrefix?: string;
  postMatch?: string;
}

export function journeyRecognize(
  router: JourneyRouter,
  method: string,
  path: string,
): JourneyMatch | null {
  const pathInfo = normalizePath(path);
  const req = new Request({
    REQUEST_METHOD: method.toUpperCase(),
    PATH_INFO: pathInfo,
    SCRIPT_NAME: "",
  }) as unknown as RouterRequest;
  let result: JourneyMatch | null = null;
  router.recognize(req, (journeyRoute) => {
    const match = journeyRoute.path.match(pathInfo);
    const params: Record<string, string> = {};
    if (match) {
      for (const [name, value] of Object.entries(match.namedCaptures)) {
        if (value != null) params[name] = unescapeUri(value);
      }
    }
    result = { route: journeyRoute, params };
    if (match && !journeyRoute.path.anchored) {
      const post = match.postMatch();
      result.matchedPrefix = match.toString().replace(/\/$/, "");
      result.postMatch = post.startsWith("/") ? post : "/" + post;
    }
    return true;
  });
  return result;
}
