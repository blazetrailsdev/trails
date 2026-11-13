import type { Mapper, RouteSet } from "@blazetrails/actionpack";
import { TopLevel } from "@blazetrails/activesupport";

(TopLevel.Trails!.application!.routes() as unknown as RouteSet).draw(function (this: Mapper) {
  this.resources("messages");

  this.namespace("admin", function (this: Mapper) {
    this.resources("messages", { only: ["show"] });
  });
});
