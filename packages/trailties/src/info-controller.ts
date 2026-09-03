import { ActionController } from "@blazetrails/actionpack";
import { Info } from "./info.js";

export interface RouteSearchResult {
  exact: string[];
  fuzzy: string[];
}

export class InfoController extends ActionController.Base {
  static layout: string | false = "application";

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
