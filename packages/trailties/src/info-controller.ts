import { DebugView, controllerConstants } from "@blazetrails/actionpack";
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
    this.render({ html: Info.toHtml() });
  }

  routes(): void {
    const query = this.params.get("query");
    const q = typeof query === "string" ? query : "";
    this.render({
      json: { exact: matchingRoutes(q, true), fuzzy: matchingRoutes(q, false) },
    });
  }

  notes(): void {
    this.render({ json: [] });
  }
}

/** @internal */
export function matchingRoutes(query: string, _exactMatch: boolean): string[] {
  if (!query) return [];
  return [];
}

InfoController.prependViewPath(DebugView.RESCUES_TEMPLATE_PATHS);
InfoController.beforeAction("requireLocalBang");

controllerConstants.set("rails/info", InfoController);
