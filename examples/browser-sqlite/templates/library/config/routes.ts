import { Trails } from "@blazetrails/trailties";

Trails.application.routes().draw(function () {
  this.root("authors#index");
  this.resources("authors", { only: ["index", "show", "create"] }, function () {
    this.resources("books", { only: ["index", "create"] });
  });
});
