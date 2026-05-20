import { ActionController } from "@blazetrails/actionpack";
import { Info } from "./info.js";

// Port of railties/lib/rails/info_controller.rb. The Rails controller relies
// on an ApplicationController + ActionDispatch::Routing::RoutesInspector that
// don't yet exist in trails; the routes/notes actions render textual stubs
// until those land. See docs/trailties-plan.md PR 1.7 and follow-ups.

export class InfoController extends ActionController.Base {
  static layout: string | false = "application";

  /** `GET /rails/info` → redirect to routes. */
  index(): void {
    this.redirectTo("/rails/info/routes");
  }

  /** Renders the property table built by {@link Info}. */
  properties(): void {
    const info = Info.toHtml();
    this.render({ html: info });
  }

  /**
   * Routes listing. Rails uses ActionDispatch::Routing::RoutesInspector to
   * format the routes; until that's ported, return a plain-text placeholder
   * when no `query` is supplied, and an empty result set otherwise.
   */
  routes(): void {
    const query = this.params.get("query");
    if (typeof query === "string") {
      this.render({
        json: { exact: matchingRoutes(query, true), fuzzy: matchingRoutes(query, false) },
      });
      return;
    }
    this.render({ plain: "Routes inspector not yet implemented" });
  }

  /** Annotations (TODO/FIXME/...) listing. Pending SourceAnnotationExtractor. */
  notes(): void {
    this.render({ plain: "Annotation extractor not yet implemented" });
  }
}

/** Filter the (currently empty) route table. Public for testing. */
export function matchingRoutes(query: string, _exactMatch: boolean): string[] {
  if (!query) return [];
  return [];
}
