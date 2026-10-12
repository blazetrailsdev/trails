import { Trails } from "@blazetrails/trailties";

Trails.application!.routes().draw(function () {
  this.resources("trails");
  // Define your application routes here.
  // Example:
  //   this.get("/posts", { to: "posts#index" });

  // Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  // Can be used by load balancers and uptime monitors to verify that the app is live.
  this.get("up", { to: "rails/health#show", as: "rails_health_check" });

  // Defines the root path route ("/")
  // this.root("posts#index");
});
