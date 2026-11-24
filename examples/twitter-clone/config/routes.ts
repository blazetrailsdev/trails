import { Trails } from "@blazetrails/trailties";

Trails.application.routes().draw(function () {
  this.resources("users", { only: ["show", "create"], param: "handle" }, function () {
    this.scope({ module: "users" }, function () {
      this.resources("tweets", { only: ["index", "create"] });
      this.resource("timeline", { only: ["show"] });
      this.post("follow/:target", { to: "follows#create" });
    });
  });

  this.resources("tweets", { only: [] }, function () {
    this.scope({ module: "tweets" }, function () {
      this.resource("like", { only: ["create"] });
    });
  });

  // Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  // Can be used by load balancers and uptime monitors to verify that the app is live.
  this.get("up", { to: "trails/health#show", as: "trails_health_check" });
});
