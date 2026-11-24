import { Trails } from "@blazetrails/trailties";

Trails.application.routes().draw(function () {
  this.resources("bookmarks", function () {
    this.patch("toggleRead", { on: "member" });
    this.resources("attachments", { only: ["create", "destroy"] }, function () {
      this.post("open", { on: "member" });
    });
  });
  this.resource("export", { only: ["create"] });
  this.resource("import", { only: ["create"] });

  this.get("up", { to: "trails/health#show", as: "trails_health_check" });

  this.root("bookmarks#index");
});
