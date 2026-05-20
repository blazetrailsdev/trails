import { ActionController } from "@blazetrails/actionpack";
import { Info } from "./info.js";

// Port of railties/lib/rails/info_controller.rb. The Rails controller relies
// on an ApplicationController + ActionDispatch::Routing::RoutesInspector that
// don't yet exist in trails; the routes/notes actions return empty/JSON
// placeholders until those land. See docs/trailties-plan.md PR 1.7 follow-ups.

export interface RouteSearchResult {
  exact: string[];
  fuzzy: string[];
}

export class InfoController extends ActionController.Base {
  static layout: string | false = "application";

  /** `GET /rails/info` — redirects to the routes listing. */
  index(): void {
    this.redirectTo("/rails/info/routes");
  }

  /** Renders the property table built by {@link Info}. */
  properties(): void {
    this.render({ html: Info.toHtml() });
  }

  /**
   * Routes listing. Rails uses ActionDispatch::Routing::RoutesInspector to
   * format the routes; until that's ported we return an empty search result
   * — JSON-shaped both with and without a `query` param so callers don't
   * need to branch on response type.
   */
  routes(): void {
    const query = this.params.get("query");
    const q = typeof query === "string" ? query : "";
    this.render({
      json: { exact: matchingRoutes(q, true), fuzzy: matchingRoutes(q, false) },
    });
  }

  /** Annotations (TODO/FIXME/...) listing. Pending SourceAnnotationExtractor. */
  notes(): void {
    this.render({ json: [] });
  }
}

/**
 * Filter the (currently empty) route table for `query`. Once `RoutesInspector`
 * lands, port the body of `Rails::InfoController#matching_routes` here.
 * @internal
 */
export function matchingRoutes(query: string, _exactMatch: boolean): string[] {
  if (!query) return [];
  return [];
}
