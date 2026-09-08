import type { Mapper } from "@blazetrails/actionpack";

export function drawRoutes(mapper: Mapper): void {
  mapper.get("/posts", { to: "posts#index", as: "posts" });
  mapper.get("/admin/sessions", { to: "admin/sessions#index" });
  mapper.get("/posts/show", { to: "posts#show" });
  mapper.get("/posts/link", { to: "posts#link" });
  mapper.get("/boom", { to: "posts#boom" });
}
