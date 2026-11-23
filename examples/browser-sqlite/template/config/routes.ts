import { Trails } from "@blazetrails/trailties";

Trails.application.routes().draw(function () {
  this.root("posts#index");
  this.resources("posts", function () {
    this.resources("comments", { only: ["create", "destroy"] });
  });
});
