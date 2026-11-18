import type { Mapper, RouteSet } from "@blazetrails/actionpack";
import { TopLevel } from "@blazetrails/activesupport";
import { Turbo } from "../turbo-trails.js";

if (Turbo.drawRoutes) {
  (TopLevel.Trails!.application!.routes() as unknown as RouteSet).draw(function (this: Mapper) {
    this.get("recede_historical_location", {
      to: "turbo/native/navigation#recede",
      as: "turbo_recede_historical_location",
    });
    this.get("resume_historical_location", {
      to: "turbo/native/navigation#resume",
      as: "turbo_resume_historical_location",
    });
    this.get("refresh_historical_location", {
      to: "turbo/native/navigation#refresh",
      as: "turbo_refresh_historical_location",
    });
  });
}
