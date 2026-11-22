import { Trails } from "@blazetrails/trailties";

Trails.application!.routes().draw(function () {
  this.root("posts#index");
  this.resources("posts", function () {
    this.resources("comments", { shallow: true });
    this.member(function () {
      this.post("publish");
    });
  });
  this.namespace("admin", function () {
    this.resources("users", { except: ["destroy"] });
  });
  this.get("up", { to: "trails/health#show", as: "health" });
});
