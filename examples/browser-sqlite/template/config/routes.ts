import { Trails } from "@blazetrails/trailties";

Trails.application.routes().draw(function () {
  this.root("posts#index");
  this.resources("posts", { only: ["index", "show", "create", "destroy"] });
});
