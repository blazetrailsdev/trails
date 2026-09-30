import type { Mapper } from "@blazetrails/actionpack";

export function drawRoutes(mapper: Mapper): void {
  mapper.get("/posts", { to: "posts#index", as: "posts" });
  mapper.post("/posts", { to: "posts#create" });
  mapper.get("/admin/sessions", { to: "admin/sessions#index" });
  mapper.get("/posts/show", { to: "posts#show" });
  mapper.get("/posts/link", { to: "posts#link" });
  mapper.get("/posts/url", { to: "posts#url" });
  mapper.get("/posts/canonical", { to: "posts#canonical" });
  mapper.get("/boom", { to: "posts#boom" });
  mapper.get("up", { to: "rails/health#show", as: "rails_health_check" });
}
