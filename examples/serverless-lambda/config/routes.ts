import { Trails } from "@blazetrails/trailties";
Trails.application.routes().draw(function () {
  this.resources("posts", { only: ["index"] });
  this.get("health", { to: "posts#health" });
});
