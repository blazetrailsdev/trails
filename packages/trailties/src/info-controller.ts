import { htmlSafe, isBlank } from "@blazetrails/activesupport";
import {
  DebugView,
  RouteWrapper,
  controllerConstants,
  type RouteSet,
} from "@blazetrails/actionpack";
import { RFC2396_PARSER } from "@blazetrails/ruby-compat";
import { ApplicationController } from "./application-controller.js";
import { Info } from "./info.js";

export interface RouteSearchResult {
  exact: string[];
  fuzzy: string[];
}

export class InfoController extends ApplicationController {
  static override controllerPath(): string {
    return "rails/info";
  }

  static {
    this.layout(function (this: InfoController) {
      return this.request.xhr ? false : "application";
    });
  }

  index(): void {
    this.redirectTo("/rails/info/routes");
  }

  properties(): void {
    this.render({ html: htmlSafe(Info.toHtml()) });
  }

  routes(): void {
    let query = this.params.get("query") as string | undefined;
    if (query != null) {
      query = RFC2396_PARSER.escape(query);

      this.render({
        json: {
          exact: this.matchingRoutes({ query, exactMatch: true }),
          fuzzy: this.matchingRoutes({ query, exactMatch: false }),
        },
      });
    } else {
      this.render({ json: { exact: [], fuzzy: [] } });
    }
  }

  notes(): void {
    this.render({ json: [] });
  }

  private matchingRoutes({ query, exactMatch }: { query: string; exactMatch: boolean }): string[] {
    if (isBlank(query)) return [];
    const normalizedPath = ("/" + query).replace(/\/+/g, "/");
    const queryWithoutUrlOrPathSuffix = query
      .replace(/(\w)(_path$)/, "$1")
      .replace(/(\w)(_url$)/, "$1");
    return [...(this as unknown as { _routes: RouteSet })._routes.routes].flatMap((route) => {
      const routeWrapper = new RouteWrapper(route);
      let match: unknown;
      if (exactMatch) {
        match = route.path.match(normalizedPath);
        match ||= queryWithoutUrlOrPathSuffix === routeWrapper.name;
      } else {
        match = routeWrapper.path.match(new RegExp(query));
        match ||= routeWrapper.name.includes(queryWithoutUrlOrPathSuffix);
      }
      match ||= query === routeWrapper.verb;
      if (!match) {
        const controllerAction = RFC2396_PARSER.escape(routeWrapper.reqs);
        match = exactMatch ? query === controllerAction : controllerAction.includes(query);
      }
      return match ? [routeWrapper.path] : [];
    });
  }
}

InfoController.prependViewPath(DebugView.RESCUES_TEMPLATE_PATHS);
InfoController.beforeAction("requireLocalBang");

controllerConstants.set("rails/info", InfoController);
