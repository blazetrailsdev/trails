import { describe, it, expect } from "vitest";
import { RouteSet } from "../../routing/route-set.js";
import { ConsoleFormatter, RoutesInspector } from "../../routing/inspector.js";

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

  it("routes can be filtered", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("articles");
      r.resources("comments");
    });
    const inspector = new RoutesInspector(routes.getRoutes());
    const out = inspector.format(new ConsoleFormatter.Sheet(), { controller: "articles" });
    expect(out).toContain("articles");
    expect(out).not.toContain("comments");
  });

  it("routes when expanded", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts", { to: "posts#index", as: "posts" });
    });
    const inspector = new RoutesInspector(routes.getRoutes());
    const out = inspector.format(new ConsoleFormatter.Expanded(80));
    expect(out).toContain("--[ Route 1 ]");
    expect(out).toContain("Prefix            | posts");
    expect(out).toContain("Verb              | GET");
    expect(out).toContain("URI               | /posts");
    expect(out).toContain("Controller#Action | posts#index");
  });

  it("routes can be filtered with namespaced controllers", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("articles");
      r.resources("comments");
    });
    const inspector = new RoutesInspector(routes.getRoutes());
    const out = inspector.format(new ConsoleFormatter.Sheet(), { grep: "comment" });
    expect(out).toContain("comments");
    expect(out).not.toContain("articles");
  });

  it("displays unused routes", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts", { to: "posts#index", as: "posts" });
    });
    const inspector = new RoutesInspector(routes.getRoutes());
    const out = inspector.format(new ConsoleFormatter.Unused());
    expect(out).toContain("Found 1 unused route:");
    expect(out).toContain("posts");
    expect(out).toContain("GET");
  });

  it("no unused routes found", () => {
    const routes = new RouteSet();
    const inspector = new RoutesInspector(routes.getRoutes());
    const out = inspector.format(new ConsoleFormatter.Unused());
    expect(out).toContain("No unused routes found.");
  });

  it("no routes were defined", () => {
    const routes = new RouteSet();
    const inspector = new RoutesInspector(routes.getRoutes());
    const out = inspector.format(new ConsoleFormatter.Sheet(), { grep: "DummyController" });
    expect(out).toContain("You don't have any routes defined!");
    expect(out).toContain("Please add some routes in config/routes.rb.");
    expect(out).toContain(
      "For more information about routes, see the Rails guide: https://guides.rubyonrails.org/routing.html.",
    );
  });
});
