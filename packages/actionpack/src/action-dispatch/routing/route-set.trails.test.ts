import { describe, it, expect } from "vitest";
import { RouteSet, StaticDispatcher } from "./route-set.js";
import { Constraints } from "./mapper.js";
import { X_CASCADE } from "../constants.js";
import type { Request } from "../http/request.js";

describe("ActionDispatch::Routing::RouteSet generation", () => {
  it("trims a trailing part that restates the route default", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts(/:page)", { to: "posts#index", as: "posts", defaults: { page: "1" } });
    });
    expect(routes.generate("posts", { page: "1" }).path()).toBe("/posts");
    expect(routes.generate("posts", { page: "2" }).path()).toBe("/posts/2");
  });

  it("never trims a required part that restates the route default", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:page", { to: "posts#index", as: "posts", defaults: { page: "1" } });
    });
    expect(routes.generate("posts", { page: "1" }).path()).toBe("/posts/1");
  });

  it("keeps a trailing part named only by the enclosing scope", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.scope({ page: "1" }, (m) => {
        m.get("/posts(/:page)", { to: "posts#index", as: "posts" });
      });
    });
    expect(routes.generate("posts", {}, { page: "3" }).path()).toBe("/posts/3");
  });
});

describe("ActionDispatch::Routing::Mapper::Mapping#app", () => {
  it("wraps the dispatcher in Constraints(SERVE) for a route under a constraints block", () => {
    const routes = new RouteSet();
    const constraint = (req: Request) => req.path === "/posts";
    routes.draw((r) => {
      r.constraints(constraint, () => {
        r.get("/posts", { to: "posts#index" });
      });
      r.get("/comments", { to: "comments#index" });
    });
    const [posts, comments] = routes.getRoutes();
    expect(posts.app).toBeInstanceOf(Constraints);
    expect(posts.app!.dispatcher()).toBe(true);
    expect((posts.app as Constraints).constraints).toEqual([constraint]);
    expect(comments.app).not.toBeInstanceOf(Constraints);
  });

  it("cascades when the constraints block rejects the request", async () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.constraints(
        () => false,
        () => {
          r.get("/posts", { to: "posts#index" });
        },
      );
    });
    const [status, headers] = await routes.call({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/posts",
      HTTP_HOST: "example.org",
      "rack.url_scheme": "http",
    } as never);
    expect(status).toBe(404);
    expect(headers[X_CASCADE]).toBe("pass");
  });

  it("dispatches a mounted app answering action through StaticDispatcher", () => {
    const routes = new RouteSet();
    const app = { action: () => app, call: () => [200, {}, []] };
    routes.draw((r) => {
      r.mount(app as never, { at: "/static" });
    });
    expect(routes.getRoutes()[0].app).toBeInstanceOf(StaticDispatcher);
  });

  it("merges nested Hash scope constraints onto a matched route", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.scope({ constraints: { subdomain: "api" } }, () => {
        r.scope({ constraints: { id: /\d+/ } }, () => {
          r.get("/posts/:id", { to: "posts#show", constraints: { format: "json" } });
        });
      });
    });
    expect(routes.getRoutes()[0].constraints).toEqual({
      subdomain: "api",
      id: /\d+/,
      format: "json",
    });
  });

  it("raises for a constraint answering neither call nor matches?", () => {
    const routes = new RouteSet();
    expect(() =>
      routes.draw((r) => {
        r.get("/posts", { to: "posts#index", constraints: 1 as never });
      }),
    ).toThrow("Invalid constraint: 1 must respond to :call or :matches?");
  });
});
