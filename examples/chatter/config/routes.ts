import { Trails } from "@blazetrails/trailties";

Trails.application.routes().draw(function () {
  this.resource("session", { only: ["new", "create", "destroy"] }, function () {
    this.get("sent", { on: "collection" });
  });
  this.get("magic/:token", { to: "magic_links#show", as: "magic_link" });

  this.resource("profile", { only: ["edit", "update"] });

  this.resources("rooms", { only: ["index", "show", "new", "create"] }, function () {
    this.resources("messages", { only: ["create", "destroy"] });
  });
  this.resources("messages", { only: [] }, function () {
    this.resource("thread", { only: ["show"] });
    this.resources("reactions", { only: ["create"] });
  });
  this.resources("directs", { only: ["create"] });

  this.get("up", { to: "trails/health#show", as: "trails_health_check" });

  this.root("rooms#index");
});
