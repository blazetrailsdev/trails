import { describe, it, expect } from "vitest";
import { RouteSet } from "../../routing/route-set.js";
import { RoutesInspector } from "../../routing/inspector.js";

// ==========================================================================
// dispatch/routing/inspector_test.rb
// ==========================================================================
describe("RoutesInspectorTest", () => {
  it("displaying routes for engines", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts", { to: "posts#index", as: "posts" });
    });
    const inspector = new RoutesInspector(routes.getRoutes());
    const rows = inspector.inspect();
    expect(rows.length).toBe(1);
    expect(rows[0].verb).toBe("GET");
    expect(rows[0].path).toBe("/posts");
    expect(rows[0].controller).toBe("posts");
    expect(rows[0].action).toBe("index");
  });

  it("cart inspect", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resource("cart");
    });
    const inspector = new RoutesInspector(routes.getRoutes());
    const rows = inspector.inspect();
    expect(rows.length).toBe(7);
    const verbs = rows.map((r) => r.verb);
    expect(verbs).toContain("GET");
    expect(verbs).toContain("POST");
    expect(verbs).toContain("PUT");
    expect(verbs).toContain("PATCH");
    expect(verbs).toContain("DELETE");
  });

  it("articles inspect with multiple verbs", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("articles");
    });
    const inspector = new RoutesInspector(routes.getRoutes());
    const rows = inspector.inspect();
    expect(rows.length).toBe(8);
    const formatted = inspector.format();
    expect(formatted).toContain("articles");
    expect(formatted).toContain("GET");
  });
});
