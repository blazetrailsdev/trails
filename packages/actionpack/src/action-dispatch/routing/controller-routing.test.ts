import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { RouteSet } from "./route-set.js";
import type { RackEnv } from "@blazetrails/rack";
import { Response } from "../http/response.js";
import { controllerConstants, type Request } from "../http/request.js";
import type { DispatchableControllerClass } from "./dispatcher.js";
import { RoutingError } from "../../action-controller/metal/exceptions.js";

class StubController {}

beforeEach(() => {
  for (const name of [
    "pages",
    "posts",
    "comments",
    "profiles",
    "sessions",
    "articles",
    "users",
    "admin/posts",
    "api/posts",
    "api/v1/articles",
    "api/v1/posts",
  ]) {
    controllerConstants.set(name, StubController as unknown as DispatchableControllerClass);
  }
});

afterEach(() => {
  controllerConstants.delete("posts");
});

let capturedEnv: RackEnv = {};

class CaptureEnvController {
  static makeResponseBang(request: Request): Response {
    const res = new Response();
    res.request = request;
    return res;
  }
  static async dispatch(
    _action: string,
    req: Request,
  ): Promise<[number, Record<string, string>, string[]]> {
    capturedEnv = req.env;
    return [200, {}, []];
  }
}

describe("Controller routing integration", () => {
  it("dispatches GET / to root route", () => {
    const routes = new RouteSet();
    routes.draw((map) => {
      map.root("pages#home");
    });
    const match = routes.recognizePath("/");
    expect(match.controller).toBe("pages");
    expect(match.action).toBe("home");
  });

  it("dispatches resource routes to correct actions", () => {
    const routes = new RouteSet();
    routes.draw((map) => {
      map.resources("posts");
    });

    expect(routes.recognizePath("/posts").action).toBe("index");
    expect(routes.recognizePath("/posts", { method: "post" }).action).toBe("create");
    expect(routes.recognizePath("/posts/1").action).toBe("show");
    expect(routes.recognizePath("/posts/1").id).toBe("1");
    expect(routes.recognizePath("/posts/1", { method: "put" }).action).toBe("update");
    expect(routes.recognizePath("/posts/1", { method: "patch" }).action).toBe("update");
    expect(routes.recognizePath("/posts/1", { method: "delete" }).action).toBe("destroy");
  });

  it("path params include route parameters", () => {
    const routes = new RouteSet();
    routes.draw((map) => {
      map.get("/posts/:id", { to: "posts#show" });
    });
    const match = routes.recognizePath("/posts/42");
    expect(match.id).toBe("42");
  });

  it("named route generates path", () => {
    const routes = new RouteSet();
    routes.draw((map) => {
      map.get("/posts/:id", { to: "posts#show", as: "post" });
    });
    expect(routes.pathFor({ id: "5" }, "post")).toBe("/posts/5");
  });

  it("named route generates full URL", () => {
    const routes = new RouteSet();
    routes.setDefaultUrlOptions({ host: "example.com" });
    routes.draw((map) => {
      map.get("/posts/:id", { to: "posts#show", as: "post" });
    });
    expect(routes.urlFor({ id: "5" }, "post")).toBe("http://example.com/posts/5");
  });

  it("first matching route wins", () => {
    const routes = new RouteSet();
    routes.draw((map) => {
      map.get("/posts/special", { to: "posts#special", as: "special_post" });
      map.get("/posts/:id", { to: "posts#show" });
    });
    const match = routes.recognizePath("/posts/special");
    expect(match.action).toBe("special");
  });

  it("unmatched route returns null", () => {
    const routes = new RouteSet();
    routes.draw((map) => {
      map.get("/posts", { to: "posts#index" });
    });
    expect(() => routes.recognizePath("/users")).toThrow(RoutingError);
  });

  it("wrong method returns null", () => {
    const routes = new RouteSet();
    routes.draw((map) => {
      map.get("/posts", { to: "posts#index" });
    });
    expect(() => routes.recognizePath("/posts", { method: "post" })).toThrow(RoutingError);
  });

  it("namespace prefixes path and controller", () => {
    const routes = new RouteSet();
    routes.draw((map) => {
      map.namespace("admin", (admin) => {
        admin.resources("posts");
      });
    });
    const match = routes.recognizePath("/admin/posts");
    expect(match.controller).toBe("admin/posts");
    expect(match.action).toBe("index");
  });

  it("scope with module option", () => {
    const routes = new RouteSet();
    routes.draw((map) => {
      map.scope("/api", { module: "api" }, (scope) => {
        scope.get("/posts", { to: "posts#index" });
      });
    });
    const match = routes.recognizePath("/api/posts");
    expect(match.controller).toBe("api/posts");
  });

  it("constraints filter routes", () => {
    const routes = new RouteSet();
    routes.draw((map) => {
      map.get("/posts/:id", { to: "posts#show", constraints: { id: /\d+/ } });
    });
    expect(() => routes.recognizePath("/posts/123")).not.toThrow();
    expect(() => routes.recognizePath("/posts/abc")).toThrow(RoutingError);
  });

  it("multiple draw calls append routes", () => {
    const routes = new RouteSet();
    routes.draw((map) => {
      map.get("/a", { to: "posts#index" });
    });
    routes.draw((map) => {
      map.get("/b", { to: "pages#home" });
    });
    expect(() => routes.recognizePath("/a")).not.toThrow();
    expect(() => routes.recognizePath("/b")).not.toThrow();
  });

  it("clear removes all routes", () => {
    const routes = new RouteSet();
    routes.draw((map) => {
      map.get("/posts", { to: "posts#index" });
    });
    routes.clearBang();
    expect(() => routes.recognizePath("/posts")).toThrow(RoutingError);
  });

  it("nested resources generate correct paths", () => {
    const routes = new RouteSet();
    routes.draw((map) => {
      map.resources("posts", {}, (posts) => {
        posts.resources("comments");
      });
    });
    const match = routes.recognizePath("/posts/1/comments");
    expect(match.post_id).toBe("1");
    expect(match.action).toBe("index");

    const show = routes.recognizePath("/posts/1/comments/2");
    expect(show.post_id).toBe("1");
    expect(show.id).toBe("2");
  });

  it("member routes within resources", () => {
    const routes = new RouteSet();
    routes.draw((map) => {
      map.resources("posts", {}, (posts) => {
        posts.member((m) => {
          m.post("/publish", { to: "posts#publish" });
        });
      });
    });
    const match = routes.recognizePath("/posts/1/publish", { method: "post" });
    expect(match.id).toBe("1");
  });

  it("collection routes within resources", () => {
    const routes = new RouteSet();
    routes.draw((map) => {
      map.resources("posts", {}, (posts) => {
        posts.collection((c) => {
          c.get("/search", { to: "posts#search" });
        });
      });
    });
    const match = routes.recognizePath("/posts/search");
    expect(match.action).toBe("search");
  });

  it("singular resource routes", () => {
    const routes = new RouteSet();
    routes.draw((map) => {
      map.resource("session");
    });
    expect(() => routes.recognizePath("/session")).not.toThrow();
    expect(() => routes.recognizePath("/session", { method: "post" })).not.toThrow();
    expect(() => routes.recognizePath("/session", { method: "delete" })).not.toThrow();
    expect(routes.recognizePath("/session").action).toBe("show");
  });

  it("route defaults are merged into params", () => {
    const routes = new RouteSet();
    routes.draw((map) => {
      map.get("/posts", { to: "posts#index", defaults: { format: "json" } });
    });
    const route = routes.recognizePath("/posts");
    expect(route.format).toBe("json");
  });

  it("call returns 404 for unmatched", async () => {
    const routes = new RouteSet();
    routes.draw((map) => {
      map.get("/posts", { to: "posts#index" });
    });
    const [status] = await routes.call({ REQUEST_METHOD: "GET", PATH_INFO: "/nope" });
    expect(status).toBe(404);
  });

  it("call sets path parameters in env", async () => {
    const routes = new RouteSet();
    controllerConstants.set(
      "posts",
      CaptureEnvController as unknown as DispatchableControllerClass,
    );
    routes.draw((map) => {
      map.get("/posts/:id", { to: "posts#show" });
    });
    await routes.call({ REQUEST_METHOD: "GET", PATH_INFO: "/posts/42" });
    const pathParams = capturedEnv["action_dispatch.request.path_parameters"] as Record<
      string,
      string
    >;
    expect(pathParams.id).toBe("42");
    expect(pathParams.controller).toBe("posts");
    expect(pathParams.action).toBe("show");
  });

  it("route inspector lists all routes", () => {
    const routes = new RouteSet();
    routes.draw((map) => {
      map.get("/posts", { to: "posts#index", as: "posts" });
      map.get("/posts/:id", { to: "posts#show", as: "post" });
    });
    expect(routes.routes.routes.length).toBe(2);
  });

  it("named routes map", () => {
    const routes = new RouteSet();
    routes.draw((map) => {
      map.get("/posts", { to: "posts#index", as: "posts" });
      map.get("/about", { to: "pages#about", as: "about" });
    });
    const named = routes.namedRoutes.routes;
    expect(named.has("posts")).toBe(true);
    expect(named.has("about")).toBe(true);
  });

  it("pathFor throws on missing named route", () => {
    const routes = new RouteSet();
    expect(() => routes.pathFor({}, "nonexistent")).toThrow();
  });

  it("shallow nested resources", () => {
    const routes = new RouteSet();
    routes.draw((map) => {
      map.resources("posts", { shallow: true }, (posts) => {
        posts.resources("comments");
      });
    });
    const index = routes.recognizePath("/posts/1/comments");
    expect(index.post_id).toBe("1");

    const show = routes.recognizePath("/comments/5");
    expect(show.id).toBe("5");
  });

  it("resources with only option", () => {
    const routes = new RouteSet();
    routes.draw((map) => {
      map.resources("posts", { only: ["index", "show"] });
    });
    expect(() => routes.recognizePath("/posts")).not.toThrow();
    expect(() => routes.recognizePath("/posts/1")).not.toThrow();
    expect(() => routes.recognizePath("/posts", { method: "post" })).toThrow(RoutingError);
    expect(() => routes.recognizePath("/posts/1", { method: "delete" })).toThrow(RoutingError);
  });

  it("resources with except option", () => {
    const routes = new RouteSet();
    routes.draw((map) => {
      map.resources("posts", { except: ["destroy"] });
    });
    expect(() => routes.recognizePath("/posts")).not.toThrow();
    expect(() => routes.recognizePath("/posts/1", { method: "delete" })).toThrow(RoutingError);
  });

  it("deeply nested namespace", () => {
    const routes = new RouteSet();
    routes.draw((map) => {
      map.namespace("api", (api) => {
        api.namespace("v1", (v1) => {
          v1.resources("posts");
        });
      });
    });
    const match = routes.recognizePath("/api/v1/posts");
    expect(match.controller).toBe("api/v1/posts");
  });

  it("resources generate named routes for path generation", () => {
    const routes = new RouteSet();
    routes.draw((map) => {
      map.resources("posts");
    });
    expect(routes.pathFor({}, "posts")).toBe("/posts");
    expect(routes.pathFor({ id: "3" }, "post")).toBe("/posts/3");
    expect(routes.pathFor({}, "new_post")).toBe("/posts/new");
    expect(routes.pathFor({ id: "3" }, "edit_post")).toBe("/posts/3/edit");
  });

  it("match with multiple verbs", () => {
    const routes = new RouteSet();
    routes.draw((map) => {
      map.match("/login", { to: "sessions#create", via: ["get", "post"] });
    });
    expect(() => routes.recognizePath("/login")).not.toThrow();
    expect(() => routes.recognizePath("/login", { method: "post" })).not.toThrow();
    expect(() => routes.recognizePath("/login", { method: "put" })).toThrow(RoutingError);
  });
});
