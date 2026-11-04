import { Trails } from "@blazetrails/trailties";

Trails.application.routes().draw(function () {
  this.get("health", { to: "health#show" });

  this.resource("feed", { only: ["show"] });

  this.resources(
    "posts",
    { only: ["show", "create"], format: false, constraints: { id: /[^/]+/, post_id: /[^/]+/ } },
    function () {
      this.scope({ module: "posts" }, function () {
        this.resource("like", { only: ["create"] });
      });
    },
  );

  this.match("/", { to: "errors#notFound", via: ":all" });
  this.match("*path", { to: "errors#notFound", via: ":all", format: false });
});
