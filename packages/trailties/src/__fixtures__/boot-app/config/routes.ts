import { Trails } from "../../../rails.js";

Trails.application!.routes().draw(function () {
  this.get("/posts", { to: "posts#index", as: "posts" });
  this.post("/posts", { to: "posts#create" });
  this.get("/admin/sessions", { to: "admin/sessions#index" });
  this.get("/posts/show", { to: "posts#show" });
  this.get("/posts/link", { to: "posts#link" });
  this.get("/posts/url", { to: "posts#url" });
  this.get("/posts/canonical", { to: "posts#canonical" });
  this.get("/boom", { to: "posts#boom" });
  this.get("up", { to: "rails/health#show", as: "rails_health_check" });
});
