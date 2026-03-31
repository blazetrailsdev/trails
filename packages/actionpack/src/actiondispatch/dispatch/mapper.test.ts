import { describe, it, expect } from "vitest";
import { RouteSet } from "../routing/route-set.js";

// ==========================================================================
// dispatch/mapper_test.rb
// ==========================================================================
describe("MapperTest", () => {
  it("initialize", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/foo", { to: "foo#index" });
    });
    expect(routes.getRoutes().length).toBeGreaterThan(0);
  });
});
