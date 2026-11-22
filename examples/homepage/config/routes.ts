import { Trails } from "@blazetrails/trailties";

Trails.application!.routes().draw(function () {
  this.resources("posts", { only: ["show", "create"] }, function () {
    this.resources("comments", { shallow: true, only: ["create", "destroy"] });
    this.member(function () {
      this.post("publish");
    });
  });
  this.get("up", { to: "trails/health#show", as: "health" });
});
