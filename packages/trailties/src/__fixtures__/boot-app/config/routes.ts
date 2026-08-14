import type { Mapper } from "@blazetrails/actionpack";

export function drawRoutes(mapper: Mapper): void {
  mapper.get("/posts", { to: "posts#index" });
  // Raises inside the action — exercises the `DebugExceptions` path.
  mapper.get("/boom", { to: "posts#boom" });
}
