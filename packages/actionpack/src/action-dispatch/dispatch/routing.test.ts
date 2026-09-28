import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { RouteSet, type NamedRouteHelper } from "../routing/route-set.js";
import { bodyFromString, bodyToString, MockRequest } from "@blazetrails/rack";
import { Response } from "../http/response.js";
import { controllerConstants, type Request } from "../http/request.js";
import type { DispatchableControllerClass } from "../routing/dispatcher.js";
import { escapeSegment, unescapeUri } from "../journey/router/utils.js";
import { ArgumentError } from "@blazetrails/activemodel";
import { assertDeprecated } from "@blazetrails/activesupport";
import { deprecator } from "../deprecator.js";
import { IntegrationTest } from "../testing/integration.js";
import { RoutingError, UrlGenerationError } from "../../action-controller/metal/exceptions.js";

class StubController {}

beforeEach(() => {
  for (const name of [
    "a",
    "account",
    "account/account",
    "account/subscriptions",
    "accounts",
    "admin",
    "admin/users",
    "api/tokens",
    "api/v1/articles",
    "api/v1/users",
    "api/v2/articles",
    "articles",
    "assets",
    "attachments",
    "b",
    "bar/comments",
    "bar/posts",
    "bookmarks",
    "chat",
    "clubs",
    "comments",
    "companies",
    "content",
    "customers",
    "foo",
    "foo/bar/baz",
    "foo/comments",
    "foo/posts",
    "forum/products",
    "global",
    "goodbye",
    "google/accounts",
    "google/secret/infos",
    "hello",
    "home",
    "images",
    "infos",
    "internal",
    "involvements",
    "journey",
    "local",
    "managers",
    "medical/taxises",
    "mes",
    "movies",
    "my_controller",
    "openid",
    "pagemarks",
    "pages",
    "participants",
    "people",
    "pooh",
    "posts",
    "products",
    "profiles",
    "projects",
    "purchases",
    "replies",
    "rooms",
    "search",
    "sessions",
    "sheep",
    "songs",
    "status",
    "tasks",
    "test",
    "tickets",
    "todos",
    "transport/taxis",
    "users",
  ]) {
    controllerConstants.set(name, StubController as unknown as DispatchableControllerClass);
  }
});

afterEach(() => {
  controllerConstants.delete("posts");
});

async function verifyRedirect(
  routes: RouteSet,
  url: string,
): Promise<{ status: number; location: string | undefined }> {
  const [status, headers] = await routes.call(MockRequest.envFor(url));
  return { status, location: (headers as Record<string, string>)["location"] };
}

const routeSpec = (match: Record<string, unknown>): string => `${match.controller}#${match.action}`;

class EchoParamsController {
  static makeResponseBang(request: Request): Response {
    const res = new Response();
    res.request = request;
    return res;
  }
  static async dispatch(
    action: string,
    req: Request,
  ): Promise<[number, Record<string, string>, ReturnType<typeof bodyFromString>]> {
    const { controller, action: _a, ...params } = req.pathParameters as Record<string, string>;
    const body = JSON.stringify({ controller, action, params });
    return [200, { "content-type": "application/json" }, bodyFromString(body)];
  }
}

describe("TestRoutingMapper", () => {
  it("logout", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.delete("/logout", { to: "sessions#destroy", as: "logout" });
    });
    const m = routes.recognizePath("/logout", { method: "delete" });
    expect(m.controller).toBe("sessions");
    expect(m.action).toBe("destroy");
    expect(routes.pathFor({}, "logout")).toBe("/logout");
  });

  it("login", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/login", { to: "sessions#new", as: "login" });
      r.post("/login", { to: "sessions#create" });
    });
    const getM = routes.recognizePath("/login");
    expect(getM.action).toBe("new");
    const postM = routes.recognizePath("/login", { method: "post" });
    expect(postM.action).toBe("create");
    expect(routes.pathFor({}, "login")).toBe("/login");
  });

  it("session singleton resource", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resource("session");
    });

    expect(routes.recognizePath("/session").action).toBe("show");
    expect(routes.recognizePath("/session", { method: "post" }).action).toBe("create");
    expect(routes.recognizePath("/session", { method: "put" }).action).toBe("update");
    expect(routes.recognizePath("/session", { method: "patch" }).action).toBe("update");
    expect(routes.recognizePath("/session", { method: "delete" }).action).toBe("destroy");
    expect(routes.recognizePath("/session/new").action).toBe("new");
    expect(routes.recognizePath("/session/edit").action).toBe("edit");

    expect(routes.pathFor({}, "session")).toBe("/session");
    expect(routes.pathFor({}, "new_session")).toBe("/session/new");
    expect(routes.pathFor({}, "edit_session")).toBe("/session/edit");
  });

  it("projects (resources)", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("projects");
    });

    expect(routes.recognizePath("/projects").action).toBe("index");
    expect(routes.recognizePath("/projects/new").action).toBe("new");
    expect(routes.recognizePath("/projects", { method: "post" }).action).toBe("create");
    expect(routes.recognizePath("/projects/1").action).toBe("show");
    expect(routes.recognizePath("/projects/1/edit").action).toBe("edit");
    expect(routes.recognizePath("/projects/1", { method: "put" }).action).toBe("update");
    expect(routes.recognizePath("/projects/1", { method: "patch" }).action).toBe("update");
    expect(routes.recognizePath("/projects/1", { method: "delete" }).action).toBe("destroy");

    expect(routes.pathFor({}, "projects")).toBe("/projects");
    expect(routes.pathFor({}, "new_project")).toBe("/projects/new");
    expect(routes.pathFor({ id: 1 }, "project")).toBe("/projects/1");
    expect(routes.pathFor({ id: 1 }, "edit_project")).toBe("/projects/1/edit");
  });

  it("admin (namespace)", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.namespace("admin", (r) => {
        r.resources("users");
      });
    });

    expect(routes.recognizePath("/admin/users").action).toBe("index");
    expect(routes.recognizePath("/admin/users/1").action).toBe("show");
    expect(routes.pathFor({}, "admin_users")).toBe("/admin/users");
    expect(routes.pathFor({ id: 1 }, "admin_user")).toBe("/admin/users/1");
  });

  it("root", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.root("pages#home");
    });
    const m = routes.recognizePath("/");
    expect(m.controller).toBe("pages");
    expect(m.action).toBe("home");
    expect(routes.pathFor({}, "root")).toBe("/");
  });

  it("scoped root", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.scope("/api", { as: "api" }, (r) => {
        r.get("/status", { to: "status#show", as: "status" });
      });
    });
    expect(() => routes.recognizePath("/api/status")).not.toThrow();
    expect(routes.pathFor({}, "api_status")).toBe("/api/status");
  });

  it("nested namespace", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.namespace("api", (r) => {
        r.namespace("v1", (r) => {
          r.resources("articles");
        });
      });
    });
    expect(routes.recognizePath("/api/v1/articles").action).toBe("index");
    expect(routes.pathFor({}, "api_v1_articles")).toBe("/api/v1/articles");
    expect(routes.pathFor({ id: 5 }, "api_v1_article")).toBe("/api/v1/articles/5");
  });

  it("nested resources", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("posts", (r) => {
        r.resources("comments");
      });
    });
    const m = routes.recognizePath("/posts/3/comments/7");
    expect(m.controller).toBe("comments");
    expect(m.action).toBe("show");
  });

  it("match with multiple via", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.match("/search", { to: "search#index", via: ["GET", "POST"], as: "search" });
    });
    expect(() => routes.recognizePath("/search")).not.toThrow();
    expect(() => routes.recognizePath("/search", { method: "post" })).not.toThrow();
    expect(() => routes.recognizePath("/search", { method: "delete" })).toThrow(RoutingError);
  });

  it("multiple draw calls append routes", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/a", { to: "a#index" });
    });
    routes.draw((r) => {
      r.get("/b", { to: "b#index" });
    });
    expect(() => routes.recognizePath("/a")).not.toThrow();
    expect(() => routes.recognizePath("/b")).not.toThrow();
  });

  it("constraints on dynamic segments", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", as: "post", constraints: { id: /\d+/ } });
    });
    expect(() => routes.recognizePath("/posts/42")).not.toThrow();
    expect(() => routes.recognizePath("/posts/abc")).toThrow(RoutingError);
  });

  it("named routes", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/about", { to: "pages#about", as: "about" });
    });
    expect(routes.pathFor({}, "about")).toBe("/about");
  });

  it("getRoutes lists all routes", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.root("pages#home");
      r.resources("posts");
    });
    expect(routes.routes.routes.length).toBe(9);
  });

  it("returns 404 for unmatched routes", async () => {
    const routes = new RouteSet();
    const [status, , body] = await routes.call({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/nope",
    });
    expect(status).toBe(404);
    expect(await bodyToString(body)).toContain("Not Found");
  });

  it("dispatches matched route", async () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show" });
    });
    controllerConstants.set(
      "posts",
      EchoParamsController as unknown as DispatchableControllerClass,
    );
    const [status, , body] = await routes.call({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/posts/7",
    });
    expect(status).toBe(200);
    const json = JSON.parse(await bodyToString(body));
    expect(json.controller).toBe("posts");
    expect(json.action).toBe("show");
    expect(json.params.id).toBe("7");
  });

  it("sets action_dispatch.request.path_parameters", async () => {
    controllerConstants.delete("posts");
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show" });
    });
    const env: Record<string, unknown> = {
      REQUEST_METHOD: "GET",
      PATH_INFO: "/posts/3",
    };
    await expect(routes.call(env)).rejects.toThrow(/uninitialized constant PostsController/);
    const params = env["action_dispatch.request.path_parameters"] as Record<string, string>;
    expect(params.controller).toBe("posts");
    expect(params.action).toBe("show");
    expect(params.id).toBe("3");
  });

  it("session singleton resource for api app", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resource("session", { except: ["new", "edit"] });
    });
    expect(routes.recognizePath("/session").action).toBe("show");
    expect(routes.recognizePath("/session", { method: "post" }).action).toBe("create");
    expect(routes.recognizePath("/session", { method: "delete" }).action).toBe("destroy");
    expect(() => routes.recognizePath("/session/new")).toThrow(RoutingError);
    expect(() => routes.recognizePath("/session/edit")).toThrow(RoutingError);
  });

  it("resource routes with only and except", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resource("post", { only: ["show", "update", "destroy"] });
    });
    expect(routes.recognizePath("/post").action).toBe("show");
    expect(routes.recognizePath("/post", { method: "put" }).action).toBe("update");
    expect(routes.recognizePath("/post", { method: "delete" }).action).toBe("destroy");
    expect(() => routes.recognizePath("/post", { method: "post" })).toThrow(RoutingError);
    expect(() => routes.recognizePath("/post/new")).toThrow(RoutingError);
    expect(() => routes.recognizePath("/post/edit")).toThrow(RoutingError);
  });

  it("resource routes only create update destroy", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resource("profile", { only: ["create", "update", "destroy"] });
    });
    expect(routes.recognizePath("/profile", { method: "post" }).action).toBe("create");
    expect(routes.recognizePath("/profile", { method: "put" }).action).toBe("update");
    expect(routes.recognizePath("/profile", { method: "delete" }).action).toBe("destroy");
    expect(() => routes.recognizePath("/profile")).toThrow(RoutingError);
  });

  it("resources routes only create update destroy", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("products", { only: ["create", "update", "destroy"] });
    });
    expect(routes.recognizePath("/products", { method: "post" }).action).toBe("create");
    expect(routes.recognizePath("/products/1", { method: "put" }).action).toBe("update");
    expect(routes.recognizePath("/products/1", { method: "delete" }).action).toBe("destroy");
    expect(() => routes.recognizePath("/products")).toThrow(RoutingError);
    expect(() => routes.recognizePath("/products/1")).toThrow(RoutingError);
  });

  it("projects involvements (nested resources)", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("projects", (r) => {
        r.resources("involvements");
        r.resources("attachments");
      });
    });
    const m = routes.recognizePath("/projects/1/involvements");
    expect(m.controller).toBe("involvements");
    expect(m.action).toBe("index");

    const m2 = routes.recognizePath("/projects/1/involvements/2");
    expect(m2.action).toBe("show");

    const m3 = routes.recognizePath("/projects/1/attachments");
    expect(m3.controller).toBe("attachments");
  });

  it("projects attachments", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("projects", (r) => {
        r.resources("attachments");
      });
    });
    expect(routes.recognizePath("/projects/1/attachments").controller).toBe("attachments");
  });

  it("openid", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.match("openid/login", { to: "openid#login", via: ["GET", "POST"] });
    });
    expect(routes.recognizePath("/openid/login").controller).toBe("openid");
    expect(routes.recognizePath("/openid/login", { method: "post" }).controller).toBe("openid");
  });

  it("namespace with options", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.namespace("api", (r) => {
        r.namespace("v1", (r) => {
          r.resources("users");
        });
      });
    });
    expect(routes.recognizePath("/api/v1/users").action).toBe("index");
    expect(routes.pathFor({}, "api_v1_users")).toBe("/api/v1/users");
  });

  it("namespace containing numbers", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.namespace("api", (r) => {
        r.namespace("v2", (r) => {
          r.resources("articles");
        });
      });
    });
    expect(routes.recognizePath("/api/v2/articles").action).toBe("index");
    expect(routes.pathFor({}, "api_v2_articles")).toBe("/api/v2/articles");
  });

  it("namespaced roots", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.namespace("account", (r) => {
        r.root("account#index");
      });
    });
    expect(routes.recognizePath("/account").action).toBe("index");
    expect(routes.pathFor({}, "account_root")).toBe("/account");
  });

  it("resource does not modify passed options", () => {
    const options = { only: ["show", "create"] as ("show" | "create")[] };
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resource("user", options);
    });
    expect(options).toEqual({ only: ["show", "create"] });
  });

  it("resources does not modify passed options", () => {
    const options = { only: ["index", "show"] as ("index" | "show")[] };
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("users", options);
    });
    expect(options).toEqual({ only: ["index", "show"] });
  });

  it("scoped root as name", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.scope("/api", { as: "api" }, (r) => {
        r.root("api#index");
      });
    });
    expect(routes.pathFor({}, "api_root")).toBe("/api");
  });

  it("projects posts (nested resources)", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("projects", (r) => {
        r.resources("posts");
      });
    });
    expect(routes.recognizePath("/projects/1/posts").controller).toBe("posts");
    expect(routes.recognizePath("/projects/1/posts/2").action).toBe("show");
    expect(routes.recognizePath("/projects/1/posts", { method: "post" }).action).toBe("create");
  });

  it("root works in the resources scope", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("products", (r) => {
        r.root({ to: "products#root" });
      });
    });
    expect(routeSpec(routes.recognizePath("/products"))).toBe("products#root");
    expect(routes.pathFor({}, "products_root")).toBe("/products");
  });

  it("module scope", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.scope({ module: "api" }, (r) => {
        r.resource("token");
      });
    });
    expect(routes.recognizePath("/token").action).toBe("show");
    expect(routes.pathFor({}, "token")).toBe("/token");
  });

  it("path scope", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.scope("api", (r) => {
        r.resource("me");
      });
    });
    expect(routes.recognizePath("/api/me").action).toBe("show");
    expect(routes.pathFor({}, "me")).toBe("/api/me");
  });

  it("dynamic controller segments are deprecated", async () => {
    await assertDeprecated(deprecator(), () => {
      new RouteSet().draw((r) => {
        r.get("/:controller", { action: "index" });
      });
    });
  });

  it("nested resources with constraints", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("posts", { constraints: { id: /\d+/ } }, (r) => {
        r.resources("comments");
      });
    });
    expect(() => routes.recognizePath("/posts/1/comments")).not.toThrow();
  });

  it("index", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/info", { to: "projects#info", as: "info" });
    });
    expect(routes.pathFor({}, "info")).toBe("/info");
    expect(routes.recognizePath("/info").controller).toBe("projects");
    expect(routes.recognizePath("/info").action).toBe("info");
  });

  it("normalize namespaced matches", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.namespace("account", (r) => {
        r.get("description", { action: "description", as: "description" });
      });
    });
    expect(routes.pathFor({}, "account_description")).toBe("/account/description");
    const m = routes.recognizePath("/account/description");
    expect(m.controller).toBe("account");
    expect(m.action).toBe("description");
  });

  it("session info nested singleton resource", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resource("session", (r) => {
        r.resource("info");
      });
    });
    expect(routes.recognizePath("/session/info").action).toBe("show");
  });

  it("member on resource", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("replies", (r) => {
        r.member((r) => {
          r.put("answer", { to: "replies#mark_as_answer" });
          r.delete("answer", { to: "replies#unmark_as_answer" });
        });
      });
    });
    const putM = routes.recognizePath("/replies/1/answer", { method: "put" });
    expect(putM.action).toBe("mark_as_answer");

    const delM = routes.recognizePath("/replies/1/answer", { method: "delete" });
    expect(delM.action).toBe("unmark_as_answer");
  });

  it("replies", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("replies", (r) => {
        r.member((r) => {
          r.put("answer", { to: "replies#mark_as_answer" });
          r.delete("answer", { to: "replies#unmark_as_answer" });
        });
      });
    });
    expect(routes.recognizePath("/replies/1/answer", { method: "put" }).action).toBe(
      "mark_as_answer",
    );
    expect(routes.recognizePath("/replies/1/answer", { method: "delete" }).action).toBe(
      "unmark_as_answer",
    );
  });

  it("projects participants", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("projects", (r) => {
        r.resources("participants");
      });
    });
    expect(routes.recognizePath("/projects/1/participants").controller).toBe("participants");
    expect(routes.recognizePath("/projects/1/participants/2").action).toBe("show");
  });

  it("projects companies", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("projects", (r) => {
        r.resources("companies");
      });
    });
    expect(routes.recognizePath("/projects/1/companies").controller).toBe("companies");
    expect(routes.recognizePath("/projects/1/companies/2").action).toBe("show");
  });

  it("project manager", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("projects", (r) => {
        r.resource("manager");
      });
    });
    expect(routes.recognizePath("/projects/1/manager").action).toBe("show");
  });

  it("project images", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("projects", (r) => {
        r.resources("images");
      });
    });
    expect(routes.recognizePath("/projects/1/images").controller).toBe("images");
    expect(routes.recognizePath("/projects/1/images/2").action).toBe("show");
    expect(routes.recognizePath("/projects/1/images", { method: "post" }).action).toBe("create");
  });

  it("projects people", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("projects", (r) => {
        r.resources("people");
      });
    });
    expect(routes.recognizePath("/projects/1/people").controller).toBe("people");
    expect(routes.recognizePath("/projects/1/people/2").action).toBe("show");
  });

  it("account namespace", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.namespace("account", (r) => {
        r.resources("subscriptions");
      });
    });
    expect(routes.recognizePath("/account/subscriptions").action).toBe("index");
    expect(routes.pathFor({}, "account_subscriptions")).toBe("/account/subscriptions");
    expect(routes.pathFor({ id: 1 }, "account_subscription")).toBe("/account/subscriptions/1");
  });

  it("resource constraints", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("products", { constraints: { id: /\d{4}/ } });
    });
    expect(routes.recognizePath("/products/1234").action).toBe("show");
    expect(() => routes.recognizePath("/products/abc")).toThrow(RoutingError);
  });

  it("url generator for generic route", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("whatever/:controller/:action", { to: "foo#bar" });
    });
    expect(() => routes.recognizePath("/whatever/foo/bar")).not.toThrow();
  });

  it("url generator for namespaced generic route", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("whatever/:controller/:action/:id", { to: "foo#bar", constraints: { id: /\d+/ } });
    });
    expect(() => routes.recognizePath("/whatever/foo/show/1")).not.toThrow();
    expect(() => routes.recognizePath("/whatever/foo/show/abc")).toThrow(RoutingError);
  });

  it("resources merges options from scope", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("products", { only: ["index", "show"] }, (r) => {
        r.resources("images", { only: ["index"] });
      });
    });
    expect(() => routes.recognizePath("/products")).not.toThrow();
    expect(() => routes.recognizePath("/products/1")).not.toThrow();
    expect(() => routes.recognizePath("/products/1/edit")).toThrow(RoutingError);
    expect(() => routes.recognizePath("/products", { method: "post" })).toThrow(RoutingError);
    expect(() => routes.recognizePath("/products/1/images")).not.toThrow();
  });

  it("resource merges options from scope", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resource("account", { only: ["show"] });
    });
    expect(routes.recognizePath("/account").action).toBe("show");
    expect(() => routes.recognizePath("/account/new")).toThrow(RoutingError);
    expect(() => routes.recognizePath("/account/edit")).toThrow(RoutingError);
  });

  it("resource merges options from scope hash", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resource("account", { only: ["show"] });
    });
    expect(routes.recognizePath("/account").action).toBe("show");
    expect(() => routes.recognizePath("/account/new")).toThrow(RoutingError);
  });

  it("match without via", () => {
    const routes = new RouteSet();
    expect(() =>
      routes.draw((r) => {
        r.match("/foo/bar", { to: "files#show" });
      }),
    ).toThrow(ArgumentError);
  });

  it("non greedy regexp", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", constraints: { id: /\d+?/ } });
    });
    expect(() => routes.recognizePath("/posts/1")).not.toThrow();
  });

  it("default string params", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts", { to: "posts#index", defaults: { format: "json" } });
    });
    expect(routes.recognizePath("/posts").format).toBe("json");
  });

  it("default integer params", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts", { to: "posts#index", defaults: { page: "1" } });
    });
    expect(routes.recognizePath("/posts").page).toBe("1");
  });

  it("symbol scope", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.scope("api", (r) => {
        r.scope("v2", (r) => {
          r.resource("me");
        });
      });
    });
    expect(routes.recognizePath("/api/v2/me").action).toBe("show");
  });

  it("update person route", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("people");
    });
    expect(routes.recognizePath("/people/1", { method: "put" }).action).toBe("update");
    expect(routes.recognizePath("/people/1", { method: "patch" }).action).toBe("update");
  });

  it("update project person", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("projects", (r) => {
        r.resources("people");
      });
    });
    expect(routes.recognizePath("/projects/1/people/2", { method: "put" }).action).toBe("update");
  });

  it("forum products", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.namespace("forum", (r) => {
        r.resources("products");
      });
    });
    expect(routes.recognizePath("/forum/products").action).toBe("index");
    expect(routes.pathFor({}, "forum_products")).toBe("/forum/products");
  });

  it("articles with id", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("articles");
    });
    expect(routes.recognizePath("/articles/1").action).toBe("show");
    expect(routes.pathFor({ id: 1 }, "article")).toBe("/articles/1");
  });

  it("articles perma", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("articles", { constraints: { id: /\d+/ } });
    });
    expect(routes.recognizePath("/articles/42").action).toBe("show");
    expect(() => routes.recognizePath("/articles/abc")).toThrow(RoutingError);
  });

  it("appending routes", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/hello", { to: "hello#index" });
    });
    routes.draw((r) => {
      r.get("/goodbye", { to: "goodbye#index" });
    });
    expect(() => routes.recognizePath("/hello")).not.toThrow();
    expect(() => routes.recognizePath("/goodbye")).not.toThrow();
    expect(() => routes.recognizePath("/random")).toThrow(RoutingError);
  });

  it("controller option with nesting and leading slash", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.namespace("foo", (r) => {
        r.namespace("bar", (r) => {
          r.get("baz", { to: "baz#index" });
        });
      });
    });
    expect(routes.recognizePath("/foo/bar/baz").action).toBe("index");
  });

  it("multiple nested controller", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.namespace("foo", (r) => {
        r.namespace("bar", (r) => {
          r.get("baz", { to: "baz#index" });
        });
      });
      r.get("pooh", { to: "pooh#index" });
    });
    expect(() => routes.recognizePath("/foo/bar/baz")).not.toThrow();
    expect(() => routes.recognizePath("/pooh")).not.toThrow();
  });

  it("sprockets", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/assets/*path", { to: "assets#show", as: "asset" });
    });
    expect(() => routes.recognizePath("/assets/application.js")).not.toThrow();
    expect(routes.pathFor({ path: "application.js" }, "asset")).toBe("/assets/application.js");
  });

  it("projects status", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/projects/status", { to: "projects#status" });
    });
    expect(routes.recognizePath("/projects/status").action).toBe("status");
  });

  it("access token rooms", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("access_tokens", (r) => {
        r.resources("rooms");
      });
    });
    expect(routes.recognizePath("/access_tokens/1/rooms").controller).toBe("rooms");
  });

  it("resources controller name is not pluralized", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("content");
    });
    expect(routes.recognizePath("/content").controller).toBe("content");
  });

  it("resources are not pluralized", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.namespace("transport", (r) => {
        r.resources("taxis");
      });
    });
    expect(routes.recognizePath("/transport/taxis").action).toBe("index");
    expect(routes.pathFor({}, "transport_taxis")).toBe("/transport/taxis");
    expect(routes.recognizePath("/transport/taxis/1").action).toBe("show");
    expect(routes.pathFor({ id: 1 }, "transport_taxi")).toBe("/transport/taxis/1");
    expect(routes.recognizePath("/transport/taxis/new").action).toBe("new");
    expect(routes.pathFor({}, "transport_new_taxi")).toBe("/transport/taxis/new");
    expect(routes.recognizePath("/transport/taxis/1/edit").action).toBe("edit");
    expect(routes.pathFor({ id: 1 }, "transport_edit_taxi")).toBe("/transport/taxis/1/edit");
  });

  it("singleton resources are not singularized", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.namespace("medical", (r) => {
        r.resource("taxis");
      });
    });
    expect(routes.recognizePath("/medical/taxis").action).toBe("show");
    expect(routes.recognizePath("/medical/taxis", { method: "post" }).action).toBe("create");
    expect(routes.recognizePath("/medical/taxis/new").action).toBe("new");
    expect(routes.recognizePath("/medical/taxis/edit").action).toBe("edit");
  });

  it("router removes invalid conditions", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/tickets", { to: "tickets#index", as: "tickets" });
    });
    expect(() => routes.recognizePath("/tickets")).not.toThrow();
    expect(routes.pathFor({}, "tickets")).toBe("/tickets");
  });

  it("route defined in resources scope level", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("customers", (r) => {
        r.get("export", { to: "customers#export" });
      });
    });
    expect(routes.recognizePath("/customers/1/export").action).toBe("export");
  });

  it("only should be read from scope", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("clubs", { only: ["index", "show"] });
    });
    expect(() => routes.recognizePath("/clubs")).not.toThrow();
    expect(() => routes.recognizePath("/clubs/1")).not.toThrow();
    expect(() => routes.recognizePath("/clubs/1/edit")).toThrow(RoutingError);
    expect(() => routes.recognizePath("/clubs", { method: "post" })).toThrow(RoutingError);
  });

  it("except should be read from scope", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("clubs", { except: ["new", "edit"] });
    });
    expect(() => routes.recognizePath("/clubs")).not.toThrow();
    expect(() => routes.recognizePath("/clubs/1")).not.toThrow();
    expect(routes.recognizePath("/clubs/new").action).toBe("show");
    expect(() => routes.recognizePath("/clubs/1/edit")).toThrow(RoutingError);
  });

  it("only option should override scope", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("posts", { only: ["index"] });
    });
    expect(() => routes.recognizePath("/posts")).not.toThrow();
    expect(() => routes.recognizePath("/posts/1")).toThrow(RoutingError);
  });

  it("except option should override scope", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("posts", { except: ["destroy"] });
    });
    expect(() => routes.recognizePath("/posts/1", { method: "delete" })).toThrow(RoutingError);
    expect(() => routes.recognizePath("/posts")).not.toThrow();
  });

  it("only option should not inherit", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("posts", { only: ["index", "show"] }, (r) => {
        r.resources("comments");
      });
    });
    expect(() => routes.recognizePath("/posts/1/comments")).not.toThrow();
    expect(() => routes.recognizePath("/posts/1/comments", { method: "post" })).not.toThrow();
    expect(() => routes.recognizePath("/posts/1/comments/new")).not.toThrow();
  });

  it("except option should not inherit", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("posts", { except: ["destroy"] }, (r) => {
        r.resources("comments");
      });
    });
    expect(() => routes.recognizePath("/posts/1/comments/2", { method: "delete" })).not.toThrow();
  });

  it("projects for api app", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("projects", { except: ["new", "edit"] });
    });
    expect(() => routes.recognizePath("/projects")).not.toThrow();
    expect(() => routes.recognizePath("/projects/1")).not.toThrow();
    expect(routes.recognizePath("/projects/new").action).toBe("show");
    expect(() => routes.recognizePath("/projects/1/edit")).toThrow(RoutingError);
  });

  it("constraints are merged from scope", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("movies", { constraints: { id: /\d{4}/ } });
    });
    expect(routes.recognizePath("/movies/0001").action).toBe("show");
    expect(() => routes.recognizePath("/movies/00001")).toThrow(RoutingError);
  });

  it("nested resource constraints", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("lists", { constraints: { id: /\d+/ } }, (r) => {
        r.resources("todos", { constraints: { id: /\d+/ } });
      });
    });
    expect(() => routes.recognizePath("/lists/1/todos/2")).not.toThrow();
    expect(() => routes.recognizePath("/lists/abc/todos/2")).toThrow(RoutingError);
  });

  it("URL helpers raise a missing keys error for a nil param", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", as: "post" });
    });
    expect(() => routes.pathFor({}, "post")).toThrow(/missing required keys: \[:id\]/);
  });

  it("resource with slugs in ids", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("posts", { constraints: { id: /[a-z0-9-]+/ } });
    });
    expect(routes.recognizePath("/posts/hello-world").action).toBe("show");
    expect(routes.recognizePath("/posts/123-abc").id).toBe("123-abc");
  });

  it("named character classes in regexp constraints", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/purchases/:token/:filename", {
        to: "purchases#fetch",
        constraints: { token: /[a-zA-Z0-9]{10}/, filename: /(.+)/ },
        as: "purchase",
      });
    });
    expect(() => routes.recognizePath("/purchases/315004be7e/Ruby_on_Rails.pdf")).not.toThrow();
    expect(routes.pathFor({ token: "315004be7e", filename: "Ruby_on_Rails.pdf" }, "purchase")).toBe(
      "/purchases/315004be7e/Ruby_on_Rails.pdf",
    );
  });

  it("resources path can be a symbol", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/pages", { to: "wiki_pages#index", as: "wiki_pages" });
      r.get("/pages/:id", { to: "wiki_pages#show", as: "wiki_page" });
    });
    expect(routes.pathFor({}, "wiki_pages")).toBe("/pages");
    expect(routes.pathFor({ id: "Ruby_on_Rails" }, "wiki_page")).toBe("/pages/Ruby_on_Rails");
  });

  it("login redirect", async () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/login", { to: r.redirect("/dashboard"), as: "login" });
    });
    const { status, location } = await verifyRedirect(routes, "http://www.example.com/login");
    expect(status).toBe(301);
    expect(location).toBe("http://www.example.com/dashboard");
    expect(status).toBe(301);
  });

  it("logout redirect without to", async () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/logout", { to: r.redirect("/"), as: "logout" });
    });
    const { status, location } = await verifyRedirect(routes, "http://www.example.com/logout");
    expect(status).toBe(301);
    expect(location).toBe("http://www.example.com/");
  });

  it("namespace redirect", async () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.namespace("admin", (r) => {
        r.get("/old", { to: r.redirect("/admin/new"), as: "old" });
      });
    });
    const { status, location } = await verifyRedirect(routes, "http://www.example.com/admin/old");
    expect(status).toBe(301);
    expect(location).toBe("http://www.example.com/admin/new");
  });

  it("redirect with failing constraint", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: r.redirect("/articles/%{id}"), constraints: { id: /\d+/ } });
    });
    expect(() => routes.recognizePath("/posts/abc")).toThrow(RoutingError);
  });

  it("redirect with passing constraint", async () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: r.redirect("/articles/%{id}"), constraints: { id: /\d+/ } });
    });
    const { status, location } = await verifyRedirect(routes, "http://www.example.com/posts/123");
    expect(status).toBe(301);
    expect(location).toBe("http://www.example.com/articles/123");
  });

  it("redirect modulo", async () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/old/:id", { to: r.redirect("/new/%{id}") });
    });
    const { status, location } = await verifyRedirect(routes, "http://www.example.com/old/42");
    expect(status).toBe(301);
    expect(location).toBe("http://www.example.com/new/42");
  });

  it("redirect proc", async () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/old/:id", { to: r.redirect((params) => `/new/${params.id}`), as: "old" });
    });
    const { status, location } = await verifyRedirect(routes, "http://www.example.com/old/5");
    expect(status).toBe(301);
    expect(location).toBe("http://www.example.com/new/5");
  });

  it("redirect proc with request", async () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/old", { to: r.redirect((_params, req) => `${req.path}/new`), as: "old" });
    });
    const { status, location } = await verifyRedirect(routes, "http://www.example.com/old");
    expect(status).toBe(301);
    expect(location).toBe("http://www.example.com/old/new");
  });

  it("redirect hash with subdomain", async () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/old", { to: r.redirect({ subdomain: "api" }), as: "old" });
    });
    const { status, location } = await verifyRedirect(routes, "http://www.example.com/old");
    expect(status).toBe(301);
    expect(location).toBe("http://api.example.com/old");
  });

  it("redirect hash with domain and path", async () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/old", { to: r.redirect({ domain: "other.com", path: "/new" }), as: "old" });
    });
    const { status, location } = await verifyRedirect(routes, "http://www.example.com/old");
    expect(status).toBe(301);
    expect(location).toBe("http://www.other.com/new");
  });

  it("redirect hash with path", async () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/old", { to: r.redirect({ path: "/new" }), as: "old" });
    });
    const { status, location } = await verifyRedirect(routes, "http://www.example.com/old");
    expect(status).toBe(301);
    expect(location).toBe("http://www.example.com/new");
  });

  it("redirect hash with host", async () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/old", { to: r.redirect({ host: "other.com" }), as: "old" });
    });
    const { status, location } = await verifyRedirect(routes, "http://www.example.com/old");
    expect(status).toBe(301);
    expect(location).toBe("http://other.com/old");
  });

  it("redirect hash path substitution", async () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: r.redirect({ path: "/articles/%{id}" }), as: "old_post" });
    });
    const { status, location } = await verifyRedirect(routes, "http://example.com/posts/42");
    expect(status).toBe(301);
    expect(location).toBe("http://example.com/articles/42");
  });

  it("redirect hash path substitution with catch all", async () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/old/*path", { to: r.redirect({ path: "/new/%{path}" }) });
    });
    const { status, location } = await verifyRedirect(routes, "http://example.com/old/a/b/c");
    expect(status).toBe(301);
    expect(location).toBe("http://example.com/new/a/b/c");
  });

  it("redirect class", async () => {
    const customRedirect = (params: Record<string, string>) => `/custom/${params.id}`;
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/old/:id", { to: r.redirect(customRedirect), as: "old" });
    });
    const { status, location } = await verifyRedirect(routes, "http://www.example.com/old/7");
    expect(status).toBe(301);
    expect(location).toBe("http://www.example.com/custom/7");
  });

  it("resources for uncountable names", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("sheep");
    });
    expect(() => routes.recognizePath("/sheep")).not.toThrow();
    expect(() => routes.recognizePath("/sheep/1")).not.toThrow();
  });

  it("path names", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("posts", { pathNames: { new: "novo", edit: "editar" } });
    });
    expect(() => routes.recognizePath("/posts/novo")).not.toThrow();
    expect(routes.recognizePath("/posts/novo").action).toBe("new");
    expect(() => routes.recognizePath("/posts/1/editar")).not.toThrow();
    expect(routes.recognizePath("/posts/1/editar").action).toBe("edit");
  });

  it("projects with resources path names", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("projects", { pathNames: { new: "nuevo" } }, (r) => {
        r.resources("tasks", { pathNames: { new: "nueva" } });
      });
    });
    expect(routes.recognizePath("/projects/nuevo").action).toBe("new");
    expect(routes.recognizePath("/projects/1/tasks/nueva").action).toBe("new");
  });

  it("shallow nested resources", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("posts", (r) => {
        r.resources("comments", { shallow: true });
      });
    });
    expect(() => routes.recognizePath("/posts/1/comments")).not.toThrow();
    expect(() => routes.recognizePath("/posts/1/comments", { method: "post" })).not.toThrow();
    expect(() => routes.recognizePath("/comments/1")).not.toThrow();
    expect(routes.recognizePath("/comments/1").action).toBe("show");
    expect(() => routes.recognizePath("/comments/1", { method: "delete" })).not.toThrow();
  });

  it("shallow nested resources inside resource", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resource("account", (r) => {
        r.resources("posts", { shallow: true });
      });
    });
    expect(() => routes.recognizePath("/account/posts")).not.toThrow();
    expect(() => routes.recognizePath("/posts/1")).not.toThrow();
    expect(routes.recognizePath("/posts/1").action).toBe("show");
  });

  it("custom resource routes are scoped", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("posts", (r) => {
        r.get("preview", { to: "posts#preview", as: "preview" });
      });
    });
    const m = routes.recognizePath("/posts/1/preview");
    expect(m.action).toBe("preview");
  });

  it("glob parameter accepts regexp", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/*path", { to: "posts#show" });
    });
    const m = routes.recognizePath("/posts/2024/01/hello");
    expect(m.path).toBe("2024/01/hello");
  });

  it("optional scoped root hierarchy", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("(/:locale)/posts", { to: "posts#index" });
      r.get("(/:locale)/posts/:id", { to: "posts#show" });
    });
    expect(routeSpec(routes.recognizePath("/posts"))).toBe("posts#index");
    expect(routeSpec(routes.recognizePath("/posts/1"))).toBe("posts#show");
    expect(routes.recognizePath("/en/posts/1").locale).toBe("en");
  });

  it("optional part of segment", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts(/:id)", { to: "posts#index" });
    });
    expect(() => routes.recognizePath("/posts")).not.toThrow();
    expect(routes.recognizePath("/posts/1").id).toBe("1");
  });

  it("url generator for optional prefix dynamic segment", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("(/:locale)/posts", { to: "posts#index", as: "posts" });
    });
    expect(routes.pathFor({ locale: "en" }, "posts")).toBe("/en/posts");
    expect(routes.pathFor({}, "posts")).toBe("/posts");
  });

  it("url generator for optional suffix static and dynamic segment", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts(/:id)", { to: "posts#show", as: "post" });
    });
    expect(routes.pathFor({ id: "1" }, "post")).toBe("/posts/1");
    expect(routes.pathFor({}, "post")).toBe("/posts");
  });

  it("constraints block not carried to following routes", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.constraints({ id: /\d+/ }, () => {
        r.get("/posts/:id", { to: "posts#show" });
      });
      r.get("/articles/:id", { to: "articles#show" });
    });
    expect(() => routes.recognizePath("/posts/123")).not.toThrow();
    expect(() => routes.recognizePath("/articles/abc")).not.toThrow();
  });

  it("concerns", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.concern("commentable", (r) => {
        r.resources("comments");
      });
      r.resources("posts", (r) => {
        r.concerns("commentable");
      });
    });
    expect(() => routes.recognizePath("/posts/1/comments")).not.toThrow();
    expect(() => routes.recognizePath("/posts/1/comments", { method: "post" })).not.toThrow();
    expect(() => routes.recognizePath("/posts/1/comments/2")).not.toThrow();
  });
  it("trailing slash", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts", { to: "posts#index", as: "posts" });
    });
    expect(() => routes.recognizePath("/posts/")).not.toThrow();
  });

  it.skip("accepts a constraint object responding to call", () => {});

  it.skip("namespace with controller segment", () => {});

  it("namespace without controller segment", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.namespace("admin", (r) => {
        r.get("hello/:controllers/:action");
      });
    });
    const m = routes.recognizePath("/admin/hello/foo/new");
    expect(m["controllers"]).toBe("foo");
  });

  it("websocket", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.connect("chat/live", { to: "chat#live" });
    });
    expect(routes.recognizePath("/chat/live").action).toBe("live");
    expect(routes.recognizePath("/chat/live", { method: "connect" }).action).toBe("live");
  });

  it("bookmarks", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.scope("bookmark", { module: "bookmarks", as: "bookmark" }, (r) => {
        r.get("build", { action: "new", as: "new" });
        r.post("create", { action: "create", as: "" });
        r.put("update", { action: "update", as: "update" });
        r.get("remove", { action: "destroy", as: "remove" });
      });
    });
    expect(routes.recognizePath("/bookmark/build").controller).toBe("bookmarks");
    expect(routes.recognizePath("/bookmark/build").action).toBe("new");
    expect(routes.pathFor({}, "bookmark_new")).toBe("/bookmark/build");
    expect(routes.recognizePath("/bookmark/create", { method: "post" }).controller).toBe(
      "bookmarks",
    );
    expect(routes.recognizePath("/bookmark/create", { method: "post" }).action).toBe("create");
    expect(routes.recognizePath("/bookmark/update", { method: "put" }).action).toBe("update");
    expect(routes.pathFor({}, "bookmark_update")).toBe("/bookmark/update");
    expect(routes.recognizePath("/bookmark/remove").action).toBe("destroy");
    expect(routes.pathFor({}, "bookmark_remove")).toBe("/bookmark/remove");
  });

  it("pagemarks", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.scope("pagemark", { module: "pagemarks", as: "pagemark" }, (r) => {
        r.get("build", { action: "new", as: "new" });
        r.post("create", { action: "create", as: "" });
        r.put("update", { action: "update", as: "update" });
        r.get("remove", { action: "destroy", as: "remove" });
        r.get("", { action: "show", as: "show" });
      });
    });
    expect(routes.recognizePath("/pagemark/build").controller).toBe("pagemarks");
    expect(routes.recognizePath("/pagemark/build").action).toBe("new");
    expect(routes.pathFor({}, "pagemark_new")).toBe("/pagemark/build");
    expect(routes.recognizePath("/pagemark/create", { method: "post" }).controller).toBe(
      "pagemarks",
    );
    expect(routes.recognizePath("/pagemark/create", { method: "post" }).action).toBe("create");
    expect(routes.recognizePath("/pagemark/update", { method: "put" }).action).toBe("update");
    expect(routes.recognizePath("/pagemark/remove").action).toBe("destroy");
    expect(routes.pathFor({}, "pagemark_remove")).toBe("/pagemark/remove");
    expect(routes.recognizePath("/pagemark").action).toBe("show");
    expect(routes.pathFor({}, "pagemark_show")).toBe("/pagemark");
  });

  it.skip("admin", () => {});

  it("global", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.scope({ module: "global" }, (r) => {
        r.get("global/hide_notice", { action: "hide_notice", as: "global_hide_notice" });
        r.get("global/export", { action: "export", as: "export_request" });
        r.get("/export/:id/:file", {
          action: "export",
          as: "export_download",
          constraints: { file: /.*/ },
        });
      });
    });
    expect(routes.recognizePath("/global/export").controller).toBe("global");
    expect(routes.recognizePath("/global/export").action).toBe("export");
    expect(routes.recognizePath("/global/hide_notice").controller).toBe("global");
    expect(routes.recognizePath("/global/hide_notice").action).toBe("hide_notice");
    expect(routes.recognizePath("/export/123/foo.txt").action).toBe("export");
    expect(routes.pathFor({}, "export_request")).toBe("/global/export");
    expect(routes.pathFor({}, "global_hide_notice")).toBe("/global/hide_notice");
    expect(routes.pathFor({ id: "123", file: "foo.txt" }, "export_download")).toBe(
      "/export/123/foo.txt",
    );
  });

  it("local", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/local/dashboard", { to: "local#dashboard" });
    });
    expect(routes.recognizePath("/local/dashboard").action).toBe("dashboard");
  });

  it("url for with no side effects", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/projects/status(.:format)", { to: "projects#status" });
    });
    expect(() => routes.recognizePath("/projects/status")).not.toThrow();
  });

  it("url for does not modify controller", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/projects/status(.:format)", { to: "projects#status" });
    });
    expect(() => routes.recognizePath("/projects/status")).not.toThrow();
  });

  it("named route with no side effects", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("customers", (r) => {
        r.member((r) => {
          r.get("profile", { as: "profile" });
        });
      });
    });
    expect(() => routes.recognizePath("/customers/1/profile")).not.toThrow();
  });

  it.skip("projects", () => {});

  it.skip("projects with post action and new path on collection", () => {});

  it.skip("projects involvements", () => {});

  it.skip("projects posts", () => {});

  it.skip("path option override", () => {});

  it("namespace nested in resources", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("clients", (r) => {
        r.namespace("google", (r) => {
          r.resource("account", (r) => {
            r.namespace("secret", (r) => {
              r.resource("info");
            });
          });
        });
      });
    });
    expect(routes.recognizePath("/clients/1/google/account").controller).toBe("google/accounts");
    expect(routes.pathFor({ client_id: "1" }, "client_google_account")).toBe(
      "/clients/1/google/account",
    );
    expect(routes.recognizePath("/clients/1/google/account/secret/info").controller).toBe(
      "google/secret/infos",
    );
    expect(routes.pathFor({ client_id: "1" }, "client_google_account_secret_info")).toBe(
      "/clients/1/google/account/secret/info",
    );
  });

  it("namespaced shallow routes with module option", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.namespace("foo", { module: "bar" }, (r) => {
        r.resources("posts", { only: ["index", "show"] }, (r) => {
          r.resources("comments", { only: ["index", "show"], shallow: true });
        });
      });
    });
    expect(routes.pathFor({}, "foo_posts")).toBe("/foo/posts");
    expect(routeSpec(routes.recognizePath("/foo/posts"))).toBe("bar/posts#index");
    expect(routes.pathFor({ id: "1" }, "foo_post")).toBe("/foo/posts/1");
    expect(routeSpec(routes.recognizePath("/foo/posts/1"))).toBe("bar/posts#show");
    expect(routes.pathFor({ post_id: "1" }, "foo_post_comments")).toBe("/foo/posts/1/comments");
    expect(routeSpec(routes.recognizePath("/foo/posts/1/comments"))).toBe("bar/comments#index");
    expect(routes.pathFor({ id: "2" }, "foo_comment")).toBe("/foo/comments/2");
    expect(routeSpec(routes.recognizePath("/foo/comments/2"))).toBe("bar/comments#show");
  });

  it("namespaced shallow routes with path option", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.namespace("foo", { path: "bar" }, (r) => {
        r.resources("posts", { only: ["index", "show"] }, (r) => {
          r.resources("comments", { only: ["index", "show"], shallow: true });
        });
      });
    });
    expect(routes.pathFor({}, "foo_posts")).toBe("/bar/posts");
    expect(routeSpec(routes.recognizePath("/bar/posts"))).toBe("foo/posts#index");
    expect(routes.pathFor({ id: "1" }, "foo_post")).toBe("/bar/posts/1");
    expect(routeSpec(routes.recognizePath("/bar/posts/1"))).toBe("foo/posts#show");
    expect(routes.pathFor({ post_id: "1" }, "foo_post_comments")).toBe("/bar/posts/1/comments");
    expect(routeSpec(routes.recognizePath("/bar/posts/1/comments"))).toBe("foo/comments#index");
    expect(routes.pathFor({ id: "2" }, "foo_comment")).toBe("/bar/comments/2");
    expect(routeSpec(routes.recognizePath("/bar/comments/2"))).toBe("foo/comments#show");
  });

  it("namespaced shallow routes with as option", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.namespace("foo", { as: "bar" }, (r) => {
        r.resources("posts", { only: ["index", "show"] }, (r) => {
          r.resources("comments", { only: ["index", "show"], shallow: true });
        });
      });
    });
    expect(routes.pathFor({}, "bar_posts")).toBe("/foo/posts");
    expect(routeSpec(routes.recognizePath("/foo/posts"))).toBe("foo/posts#index");
    expect(routes.pathFor({ id: "1" }, "bar_post")).toBe("/foo/posts/1");
    expect(routeSpec(routes.recognizePath("/foo/posts/1"))).toBe("foo/posts#show");
    expect(routes.pathFor({ post_id: "1" }, "bar_post_comments")).toBe("/foo/posts/1/comments");
    expect(routeSpec(routes.recognizePath("/foo/posts/1/comments"))).toBe("foo/comments#index");
    expect(routes.pathFor({ id: "2" }, "bar_comment")).toBe("/foo/comments/2");
    expect(routeSpec(routes.recognizePath("/foo/comments/2"))).toBe("foo/comments#show");
  });

  it("namespaced shallow routes with shallow path option", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.namespace("foo", { shallowPath: "bar" }, (r) => {
        r.resources("posts", { only: ["index", "show"] }, (r) => {
          r.resources("comments", { only: ["index", "show"], shallow: true });
        });
      });
    });
    expect(routes.pathFor({}, "foo_posts")).toBe("/foo/posts");
    expect(routeSpec(routes.recognizePath("/foo/posts"))).toBe("foo/posts#index");
    expect(routes.pathFor({ id: "1" }, "foo_post")).toBe("/foo/posts/1");
    expect(routeSpec(routes.recognizePath("/foo/posts/1"))).toBe("foo/posts#show");
    expect(routes.pathFor({ post_id: "1" }, "foo_post_comments")).toBe("/foo/posts/1/comments");
    expect(routeSpec(routes.recognizePath("/foo/posts/1/comments"))).toBe("foo/comments#index");
    expect(routes.pathFor({ id: "2" }, "foo_comment")).toBe("/bar/comments/2");
    expect(routeSpec(routes.recognizePath("/bar/comments/2"))).toBe("foo/comments#show");
  });

  it("namespaced shallow routes with shallow prefix option", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.namespace("foo", { shallowPrefix: "bar" }, (r) => {
        r.resources("posts", { only: ["index", "show"] }, (r) => {
          r.resources("comments", { only: ["index", "show"], shallow: true });
        });
      });
    });
    expect(routes.pathFor({}, "foo_posts")).toBe("/foo/posts");
    expect(routeSpec(routes.recognizePath("/foo/posts"))).toBe("foo/posts#index");
    expect(routes.pathFor({ id: "1" }, "foo_post")).toBe("/foo/posts/1");
    expect(routeSpec(routes.recognizePath("/foo/posts/1"))).toBe("foo/posts#show");
    expect(routes.pathFor({ post_id: "1" }, "foo_post_comments")).toBe("/foo/posts/1/comments");
    expect(routeSpec(routes.recognizePath("/foo/posts/1/comments"))).toBe("foo/comments#index");
    expect(routes.pathFor({ id: "2" }, "bar_comment")).toBe("/foo/comments/2");
    expect(routeSpec(routes.recognizePath("/foo/comments/2"))).toBe("foo/comments#show");
  });

  it.skip("optional scoped root multiple choice", () => {});

  it.skip("scope with format option", () => {});

  it.skip("resources with format false from scope", () => {});

  it.skip("match with many paths containing a slash", () => {});

  it.skip("match shorthand with no scope", () => {});

  it.skip("match shorthand inside namespace", () => {});

  it.skip("match shorthand with multiple paths inside namespace", () => {});

  it.skip("match shorthand inside namespace with controller", () => {});

  it.skip("match shorthand inside scope with variables with controller", () => {});

  it.skip("match shorthand inside nested namespaces and scopes with controller", () => {});

  it.skip("not matching shorthand with dynamic parameters", () => {});

  it("dynamically generated helpers on collection do not clobber resources url helper", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("replies", (r) => {
        r.collection((r) => {
          r.get("page/:page", { to: "replies#index" });
          r.get(":page", { to: "replies#index" });
        });
      });
    });
    expect(routes.pathFor({}, "replies")).toBe("/replies");
  });

  it.skip("scoped controller with namespace and action", () => {});

  it.skip("convention match nested and with leading slash", () => {});

  it("convention with explicit end", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("sign_in", { to: "sessions#new", as: "sign_in" });
    });
    const m = routes.recognizePath("/sign_in");
    expect(m.controller).toBe("sessions");
    expect(m.action).toBe("new");
    expect(routes.pathFor({}, "sign_in")).toBe("/sign_in");
  });

  it.skip("redirect with complete url and status", () => {});

  it.skip("redirect with port", () => {});

  it("optional scoped root", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.scope("(:locale)", (r) => {
        r.root("projects#index");
      });
    });
    expect(routes.pathFor({ locale: "en" }, "root")).toBe("/en");
    const m = routes.recognizePath("/en");
    expect(m.controller).toBe("projects");
    expect(m.action).toBe("index");
  });

  it.skip("optional scoped path", () => {});

  it.skip("nested optional scoped path", () => {});

  it.skip("nested optional path shorthand", () => {});

  it("keyed default string params with match", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.match("/", { to: "pages#show", via: "get", defaults: { id: "home" } });
    });
    const m = routes.recognizePath("/");
    expect(m.id).toBe("home");
  });

  it.skip("default string params with match", () => {});

  it("keyed default string params with root", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.match("/", { to: "pages#show", via: "get", as: "root", defaults: { id: "home" } });
    });
    const m = routes.recognizePath("/");
    expect(m.id).toBe("home");
  });

  it.skip("default string params with root", () => {});

  it.skip("custom param", () => {});

  it.skip("custom param constraint", () => {});

  it.skip("colon containing custom param", () => {});

  it("invalid route name raises error", () => {
    const routes = new RouteSet();
    expect(() =>
      routes.draw((r) => {
        r.get("/products", { to: "products#index", as: "products " });
      }),
    ).toThrow(/Invalid route name/);
    expect(() =>
      routes.draw((r) => {
        r.get("/products", { to: "products#index", as: "products!" });
      }),
    ).toThrow(/Invalid route name/);
    expect(() =>
      routes.draw((r) => {
        r.get("/products", { to: "products#index", as: "products index" });
      }),
    ).toThrow(/Invalid route name/);
    expect(() =>
      routes.draw((r) => {
        r.get("/products", { to: "products#index", as: "1products" });
      }),
    ).toThrow(/Invalid route name/);
  });

  it.skip("duplicate route name raises error", () => {});

  it.skip("duplicate route name via resources raises error", () => {});
  it.skip("controller name with leading slash raise error", () => {});
  it("match with empty via", () => {
    const routes = new RouteSet();
    expect(() =>
      routes.draw((r) => {
        r.match("/foo/bar", { to: "files#show", via: [] });
      }),
    ).toThrow(ArgumentError);
  });
  it.skip("multiple roots raises error", () => {});
  it.skip("multiple namespaced roots", () => {});

  it.skip("resource new actions", () => {});
  it.skip("shallow false inside nested shallow resource", () => {});
  it.skip("shallow deeply nested resources", () => {});
  it.skip("direct children of shallow resources", () => {});
  it.skip("shallow nested resources within scope", () => {});
  it.skip("shallow option nested resources within scope", () => {});
  it.skip("shallow nested routes ignore module", () => {});
  it.skip("shallow custom param", () => {});
  it.skip("shallow path inside namespace is not added twice", () => {});
  it.skip("shallow path and prefix are not added to non shallow routes", () => {});
  it.skip("scope path is copied to shallow path", () => {});
  it.skip("scope as is copied to shallow prefix", () => {});
  it.skip("scope shallow prefix is not overwritten by as", () => {});
  it.skip("scope shallow path is not overwritten by path", () => {});

  it.skip("url generator for optional prefix static and dynamic segment", () => {});
  it.skip("url recognition for optional static segments", () => {});
  it.skip("except option should override scoped only", () => {});
  it.skip("only option should override scoped except", () => {});
  it.skip("only scope should override parent scope", () => {});
  it.skip("except scope should override parent scope", () => {});
  it.skip("except scope should override parent only scope", () => {});
  it.skip("only scope should override parent except scope", () => {});
  it.skip("resource constraints are pushed to scope", () => {});
  it.skip("custom resource actions defined using string", () => {});
  it.skip("named route check", () => {});
  it.skip("explicitly avoiding the named route", () => {});
  it.skip("nested route in nested resource", () => {});
  it.skip("root in deeply nested scope", () => {});
  it.skip("multiple positional args with the same name", () => {});
  it.skip("resource where as is empty", () => {});
  it.skip("resources where as is empty", () => {});
  it.skip("scope where as is empty", () => {});
  it.skip("multiple named roots", () => {});
  it.skip("nested routes under format resource", () => {});
  it.skip("passing action parameters to url helpers raises error if parameters are not permitted", () => {});
  it.skip("passing action parameters to url helpers is allowed if parameters are permitted", () => {});

  it.skip("redirect https", () => {});
  it.skip("redirect argument error", () => {});

  it.skip("greedy resource id regexp doesnt match edit and custom action", () => {});
  it.skip("path parameters is not stale", () => {});
  it.skip("action from path is frozen", () => {});
  it.skip("absolute controller namespace", () => {});
  it.skip("namespace as controller", () => {});
  it.skip("route with dashes in path", () => {});
  it.skip("shorthand route with dashes in path", () => {});
  it.skip("resource routes with dashes in path", () => {});
  it.skip("mix string to controller action", () => {});
  it.skip("mix string to controller", () => {});
  it.skip("mix string to action", () => {});
  it.skip("head fetch with mount on root", () => {});
  it("dynamic action segments are deprecated", async () => {
    await assertDeprecated(deprecator(), () => {
      new RouteSet().draw((r) => {
        r.get("/pages/:action", { controller: "pages" });
      });
    });
  });
  it.skip("routes with double colon", () => {});
});

describe("ActionController::Routing", () => {
  it("route generation allows passing non string values to generated helper", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", as: "post" });
    });
    expect(routes.pathFor({ id: 42 }, "post")).toBe("/posts/42");
  });

  it("id with dash", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/journey/:id", { to: "journey#show" });
    });
    const m = routes.recognizePath("/journey/faithfully-omg");
    expect(m.id).toBe("faithfully-omg");
  });

  it("regexp precedence", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", constraints: { id: /\d+/ } });
      r.get("/posts/:slug", { to: "posts#show_by_slug" });
    });
    const m1 = routes.recognizePath("/posts/123");
    expect(m1.action).toBe("show");
    const m2 = routes.recognizePath("/posts/hello");
    expect(m2.action).toBe("show_by_slug");
  });

  it("route generation escapes unsafe path characters", () => {
    expect(escapeSegment("a b/c")).toBe("a%20b%2Fc");
  });

  it("route recognition unescapes path components", () => {
    expect(unescapeUri("a%20b%2Fc")).toBe("a b/c");
  });

  it("dash with custom regexp", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/journey/:id", { to: "journey#show", constraints: { id: /\d+/ } });
    });
    expect(() => routes.recognizePath("/journey/123")).not.toThrow();
    expect(() => routes.recognizePath("/journey/abc")).toThrow(RoutingError);
  });

  it("pre dash", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show" });
    });
    const m = routes.recognizePath("/posts/omg-faithfully");
    expect(m.id).toBe("omg-faithfully");
  });

  it("pre dash with custom regexp", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", constraints: { id: /\d+/ } });
    });
    expect(() => routes.recognizePath("/posts/123")).not.toThrow();
    expect(() => routes.recognizePath("/posts/omg-123")).toThrow(RoutingError);
  });

  it("empty string match", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/", { to: "home#index" });
    });
    expect(routes.recognizePath("/").action).toBe("index");
  });

  it("symbols with dashes", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/my-route/:id", { to: "my_controller#show" });
    });
    const m = routes.recognizePath("/my-route/123");
    expect(m.id).toBe("123");
  });

  it("id encoding", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show" });
    });
    const m = routes.recognizePath("/posts/hello%20world");
    expect(m.id).toBe("hello world");
  });
});

describe("TestAppendingRoutes", () => {
  it("goodbye should be available", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/goodbye", { to: "goodbye#index" });
    });
    routes.draw((r) => {
      r.get("/hello", { to: "hello#index" });
    });
    expect(() => routes.recognizePath("/goodbye")).not.toThrow();
  });

  it("hello should not be overwritten", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/hello", { to: "hello#first" });
    });
    routes.draw((r) => {
      r.get("/hello", { to: "hello#second" });
    });
    expect(routes.recognizePath("/hello").action).toBe("first");
  });

  it("missing routes are still missing", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/hello", { to: "hello#index" });
    });
    expect(() => routes.recognizePath("/random")).toThrow(RoutingError);
  });
});

describe("TestDefaultScope", () => {
  it("default scope", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.scope("api", { as: "api" }, (r) => {
        r.resources("posts");
      });
    });
    expect(() => routes.recognizePath("/api/posts")).not.toThrow();
    expect(routes.pathFor({}, "api_posts")).toBe("/api/posts");
  });
});

describe("TestRecognizePath", () => {
  it("hash constraints dont leak between routes", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/hash/:foo", { to: "pages#show", constraints: { foo: /foo/ } });
      r.get("/hash/:bar", { to: "pages#show_bar" });
    });
    const m = routes.recognizePath("/hash/bar");
    expect(m.action).toBe("show_bar");
    expect(m.bar).toBe("bar");
  });

  it.skip("proc constraints dont leak between routes", () => {});

  it.skip("class constraints dont leak between routes", () => {});
});

describe("TestTildeAndMinusPaths", () => {
  it("recognizes tilde path", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/~user", { to: "users#show" });
    });
    expect(() => routes.recognizePath("/~user")).not.toThrow();
  });

  it("recognizes minus path", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/young-and-fine", { to: "pages#show" });
    });
    expect(() => routes.recognizePath("/young-and-fine")).not.toThrow();
  });
});

describe("TestUnicodePaths", () => {
  it("recognizes unicode path", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/ほげ", { to: "pages#show" });
    });
    expect(() => routes.recognizePath("/%E3%81%BB%E3%81%92")).not.toThrow();
  });
});

describe("TestUrlGenerationErrors", () => {
  it("URL helpers raise message with mixed parameters when generation fails", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id/comments/:comment_id", { to: "comments#show", as: "post_comment" });
    });
    expect(() => routes.pathFor({ id: 1 }, "post_comment")).toThrow(/comment_id/);
  });

  it("correct for empty UrlGenerationError", () => {
    const routes = new RouteSet();
    expect(() => routes.pathFor({}, "nonexistent")).toThrow(/No route matches/);
  });

  it("URL helpers raise a 'missing keys' error for a nil param with optimized helpers", () => {
    const Routes = new RouteSet();
    Routes.draw((app) => {
      app.get("/products/:id", { to: "products#show", as: "product" });
    });
    const message =
      'No route matches {:action=>"show", :controller=>"products", :id=>nil}, missing required keys: [:id]';

    const urlHelpers = Routes.urlHelpers() as unknown as Record<
      string,
      (...args: unknown[]) => string
    >;
    expect(() => urlHelpers.productPath(null)).toThrow(UrlGenerationError);
    expect(() => urlHelpers.productPath(null)).toThrow(message);
  });

  it.skip("URL helpers raise a 'constraint failure' error for a nil param with non-optimized helpers", () => {});

  it.skip("exceptions have suggestions for fix", () => {});
});

describe("TestAltApp", () => {
  it.skip("alt request without header", () => {});
  it.skip("alt request with matched header", () => {});
  it.skip("alt request with unmatched header", () => {});
});

describe("TestNamespaceWithControllerOption", () => {
  it.skip("missing controller", () => {});
  it.skip("missing controller with to", () => {});
  it.skip("implicit controller with to", () => {});
  it.skip("to is a symbol", () => {});
  it.skip("missing action with to", () => {});
  it.skip("valid controller options inside namespace", () => {});
  it.skip("resources with valid namespaced controller option", () => {});
  it.skip("warn with ruby constant syntax controller option", () => {});
  it.skip("warn with ruby constant syntax namespaced controller option", () => {});
  it.skip("warn with ruby constant syntax no colons", () => {});
});

describe("TestGlobRoutingMapper", () => {
  it.skip("glob constraint", () => {});
  it.skip("glob constraint skip route", () => {});
  it.skip("glob constraint skip all", () => {});
});

describe("TestOptimizedNamedRoutes", () => {
  const Routes = new RouteSet();
  Routes.draw((app) => {
    const ok = (_env: Record<string, unknown>) => [
      200,
      { "Content-Type": "text/plain" },
      bodyFromString(""),
    ];
    app.get("/foo", { to: ok, as: "foo" });
    app.get("/post(/:action(/:id))", { to: ok, as: "posts" });
    app.get("/:foo/:foo_type/bars/:id", { to: ok, as: "bar" });
    app.get("/projects/:id.:format", { to: ok, as: "project" });
    app.get("/pages/:id", { to: ok, as: "page" });
    app.get("/wiki/*page", { to: ok, as: "wiki" });
  });

  const urlHelpers = () =>
    Routes.urlHelpers() as unknown as Record<string, (...args: unknown[]) => string>;
  const included = (name: string, ...args: unknown[]): string =>
    (Routes.namedRoutes.pathHelpersModule.instanceMethod(name)!.value as NamedRouteHelper).call(
      {
        _routes: Routes,
        urlOptions: () => ({}),
        optimizeRoutesGeneration: () => Routes.isOptimizeRoutesGeneration(),
      },
      ...args,
    );

  it("enabled when not mounted and default_url_options is empty", () => {
    expect(Routes.urlHelpers().optimizeRoutesGeneration()).toBe(true);
  });

  it("named route called as singleton method", () => {
    expect(urlHelpers().fooPath()).toBe("/foo");
  });

  it("named route called on included module", () => {
    expect(included("fooPath")).toBe("/foo");
  });

  it("nested optional segments are removed", () => {
    expect(urlHelpers().postsPath()).toBe("/post");
    expect(included("postsPath")).toBe("/post");
  });

  it("segments with same prefix are replaced correctly", () => {
    expect(urlHelpers().barPath("foo", "baz", "1")).toBe("/foo/baz/bars/1");
    expect(included("barPath", "foo", "baz", "1")).toBe("/foo/baz/bars/1");
  });

  it("segments separated with a period are replaced correctly", () => {
    expect(urlHelpers().projectPath(1, "json")).toBe("/projects/1.json");
    expect(included("projectPath", 1, "json")).toBe("/projects/1.json");
  });

  it("segments with question marks are escaped", () => {
    expect(urlHelpers().pagePath("foo?bar")).toBe("/pages/foo%3Fbar");
    expect(included("pagePath", "foo?bar")).toBe("/pages/foo%3Fbar");
  });

  it("segments with slashes are escaped", () => {
    expect(urlHelpers().pagePath("foo/bar")).toBe("/pages/foo%2Fbar");
    expect(included("pagePath", "foo/bar")).toBe("/pages/foo%2Fbar");
  });

  it("glob segments with question marks are escaped", () => {
    expect(urlHelpers().wikiPath("foo?bar")).toBe("/wiki/foo%3Fbar");
    expect(included("wikiPath", "foo?bar")).toBe("/wiki/foo%3Fbar");
  });

  it("glob segments with slashes are not escaped", () => {
    expect(urlHelpers().wikiPath("foo/bar")).toBe("/wiki/foo/bar");
    expect(included("wikiPath", "foo/bar")).toBe("/wiki/foo/bar");
  });
});

describe("TestNamedRouteUrlHelpers", () => {
  it.skip("URL helpers do not ignore nil parameters when using non-optimized routes", () => {});
});

describe("TestUrlConstraints", () => {
  const Routes = new RouteSet();
  Routes.draw((app) => {
    const ok = (_env: Record<string, unknown>) => [
      200,
      { "Content-Type": "text/plain" },
      bodyFromString(""),
    ];

    app.constraints({ subdomain: "admin" }, () => {
      app.get("/", { to: ok, as: "admin_root" });
    });

    app.scope({ constraints: { protocol: "https://" } }, () => {
      app.get("/", { to: ok, as: "secure_root" });
    });

    app.get("/", { to: ok, as: "alternate_root", constraints: { port: 8080 } });

    app.get("/search", { to: ok, constraints: { subdomain: false } });

    app.get("/logs", { to: ok, constraints: { subdomain: true } });
  });

  let t: IntegrationTest;
  const urlHelper = (name: string) => (): string =>
    (Routes.namedRoutes.urlHelpersModule.instanceMethod(name)!.value as NamedRouteHelper).call({
      _routes: Routes,
      urlOptions: () => t.urlOptions(),
      optimizeRoutesGeneration: () => Routes.isOptimizeRoutesGeneration(),
    });
  const adminRootUrl = urlHelper("adminRootUrl");
  const secureRootUrl = urlHelper("secureRootUrl");
  const alternateRootUrl = urlHelper("alternateRootUrl");
  const searchUrl = urlHelper("searchUrl");
  const logsUrl = urlHelper("logsUrl");

  const get = (path: string): Promise<void> => t.get(path);
  const assertResponse = (type: string): void => t.assertResponse(type);

  beforeEach(() => {
    t = new IntegrationTest();
    t.routes = Routes;
    t.app = (env: Record<string, unknown>) => Routes.call(env);
  });

  it("constraints are copied to defaults when using constraints method", async () => {
    expect(adminRootUrl()).toBe("http://admin.example.com/");

    await get("http://admin.example.com/");
    assertResponse("success");
  });

  it("constraints are copied to defaults when using scope constraints hash", async () => {
    expect(secureRootUrl()).toBe("https://www.example.com/");

    await get("https://www.example.com/");
    assertResponse("success");
  });

  it("constraints are copied to defaults when using route constraints hash", async () => {
    expect(alternateRootUrl()).toBe("http://www.example.com:8080/");

    await get("http://www.example.com:8080/");
    assertResponse("success");
  });

  it("false constraint expressions check for absence of values", async () => {
    await get("http://example.com/search");
    assertResponse("success");
    expect(searchUrl()).toBe("http://example.com/search");

    await get("http://api.example.com/search");
    assertResponse("not_found");
  });

  it("true constraint expressions check for presence of values", async () => {
    await get("http://api.example.com/logs");
    assertResponse("success");
    expect(logsUrl()).toBe("http://api.example.com/logs");

    await get("http://example.com/logs");
    assertResponse("not_found");
  });
});

describe("TestInvalidUrls", () => {
  it.skip("invalid UTF-8 encoding returns a bad request", () => {});
  it.skip("params param_encoding uses ASCII 8bit", () => {});
  it.skip("does not encode params besides id", () => {});
});

describe("TestOptionalRootSegments", () => {
  it.skip("optional root segments", () => {});
});

describe("TestPortConstraints", () => {
  it.skip("integer port constraints", () => {});
  it.skip("string port constraints", () => {});
  it.skip("array port constraints", () => {});
  it.skip("regexp port constraints", () => {});
});

describe("TestFormatConstraints", () => {
  it.skip("string format constraints", () => {});
  it.skip("regexp format constraints", () => {});
  it.skip("enforce with format true with constraint", () => {});
  it.skip("enforce with string", () => {});
});

describe("TestCallableConstraintValidation", () => {
  it("constraint with object not callable", () => {
    expect(() => {
      new RouteSet().draw((r) => {
        const ok = () => [200, { "Content-Type": "text/plain" }, []];
        r.get("/test", { to: ok as never, constraints: new (class {})() as never });
      });
    }).toThrow(ArgumentError);
  });
});

describe("TestRouteDefaults", () => {
  it.skip("route options are required for url for", () => {});
  it.skip("route defaults are not required for url for", () => {});
});

describe("TestRackAppRouteGeneration", () => {
  it.skip("mounted application doesnt match unnamed route", () => {});
});

describe("TestRedirectRouteGeneration", () => {
  it.skip("redirect doesnt match unnamed route", () => {});
});

describe("TestErrorsInController", () => {
  it.skip("legit no method errors are not caught", () => {});
  it.skip("legit name errors are not caught", () => {});
  it.skip("legit routing not found responses", () => {});
});

describe("TestPartialDynamicPathSegments", () => {
  it("paths with partial dynamic segments are recognised", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/songs/song-:song", { to: "songs#show" });
      r.get("/songs/:song-song", { to: "songs#show2" });
      r.get("/:artist/song-:song", { to: "songs#artist_show" });
      r.get("/:artist/:song-song", { to: "songs#artist_show2" });
    });
    let m = routes.recognizePath("/songs/song-changes");
    expect(m.song).toBe("changes");
    m = routes.recognizePath("/songs/changes-song");
    expect(m.song).toBe("changes");
    m = routes.recognizePath("/david-bowie/song-changes");
    expect(m.artist).toBe("david-bowie");
    expect(m.song).toBe("changes");
    m = routes.recognizePath("/david-bowie/changes-song");
    expect(m.artist).toBe("david-bowie");
    expect(m.song).toBe("changes");
  });
});

describe("TestOptionalScopesWithOrWithoutParams", () => {
  it.skip("stays unscoped with or without params", () => {});
  it.skip("preserves scope with or without params", () => {});
});

describe("TestPathParameters", () => {
  it.skip("path parameters are not mutated", () => {});
});

describe("TestInternalRoutingParams", () => {
  it("paths with partial dynamic segments are recognised", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/test_internal/:internal", { to: "internal#internal" });
    });
    const m = routes.recognizePath("/test_internal/123");
    expect(m.internal).toBe("123");
    expect(m.controller).toBe("internal");
    expect(m.action).toBe("internal");
  });
});

describe("FlashRedirectTest", () => {
  it.skip("block redirect commits flash", () => {});
});

describe("TestRelativeUrlRootGeneration", () => {
  it.skip("url helpers", () => {});
  it.skip("optimized url helpers", () => {});
});

describe("TestHttpMethods", () => {
  it.skip("request method get can be matched", () => {});
});

describe("TestUriPathEscaping", () => {
  it("escapes slash in generated path segment", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/:segment", { to: "test#show", as: "segment" });
    });
    expect(routes.pathFor({ segment: "a b/c+d" }, "segment")).toBe("/a%20b%2Fc+d");
  });

  it("unescapes recognized path segment", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/:segment", { to: "test#show", as: "segment" });
    });
    const m = routes.recognizePath("/a%20b%2Fc+d");
    expect(m.segment).toBe("a b/c+d");
  });

  it("does not escape slash in generated path splat", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/*splat", { to: "test#show", as: "splat" });
    });
    expect(routes.pathFor({ splat: "a b/c+d" }, "splat")).toBe("/a%20b/c+d");
  });

  it("unescapes recognized path splat", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/*splat", { to: "test#show", as: "splat" });
    });
    const m = routes.recognizePath("/a%20b/c+d");
    expect(m.splat).toBe("a b/c+d");
  });
});

describe("TestMultipleNestedController", () => {
  it.skip("controller option which starts with '/' from multiple nested controller", () => {});
});

describe("TestRedirectInterpolation", () => {
  it.skip("redirect escapes interpolated parameters with redirect proc", () => {});
  it.skip("redirect escapes interpolated parameters with option proc", () => {});
  it.skip("path redirect escapes interpolated parameters correctly", () => {});
});

describe("TestConstraintsAccessingParameters", () => {
  it.skip("parameters are reset between constraint checks", () => {});
});

describe("TestDefaultUrlOptions", () => {
  it.skip("positional args with format false", () => {});
});
