import type { RouteSet } from "@blazetrails/actionpack";
import { TopLevel } from "@blazetrails/activesupport";

(TopLevel.Trails!.application!.routes() as unknown as RouteSet).draw(function () {});
