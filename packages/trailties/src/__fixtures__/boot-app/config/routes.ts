import type { Mapper } from "@blazetrails/actionpack";

/** `/boom` raises inside the action — exercises the `DebugExceptions` path. */
export function drawRoutes(mapper: Mapper): void {
  mapper.get("/posts", { to: "posts#index" });
  mapper.get("/admin/sessions", { to: "admin/sessions#index" });
  mapper.get("/posts/show", { to: "posts#show" });
  mapper.get("/boom", { to: "posts#boom" });
}
