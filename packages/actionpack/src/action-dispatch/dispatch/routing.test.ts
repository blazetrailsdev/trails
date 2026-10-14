import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { RouteSet, type DrawCallback, type NamedRouteHelper } from "../routing/route-set.js";
import { bodyFromString, bodyToString, MockRequest } from "@blazetrails/rack";
import { Response } from "../http/response.js";
import { controllerConstants, Request } from "../http/request.js";
import type { DispatchableControllerClass } from "../routing/dispatcher.js";
import { escapeSegment, unescapeUri } from "../journey/router/utils.js";
import { ArgumentError } from "@blazetrails/activemodel";
import {
  pluralize,
  assertDeprecated,
  assertNothingRaised,
  assertRaises,
  stub,
  underscore,
} from "@blazetrails/activesupport";
import {
  Encoding,
  include,
  rbConstGet,
  rbObjRespondTo,
  registerConstant,
} from "@blazetrails/ruby-compat";
import { CachingKeyGenerator, KeyGenerator } from "@blazetrails/activesupport/key-generator";
import { RotationConfiguration } from "@blazetrails/activesupport/messages/rotation-configuration";
import { Flash } from "../middleware/flash.js";
import { CookieStore } from "../middleware/session/cookie-store.js";
import { ShowExceptions } from "../middleware/show-exceptions.js";
import type { MiddlewareFactory } from "../middleware/stack.js";
import { Base } from "../../action-controller/base.js";
import { deprecator } from "../deprecator.js";
import { IntegrationTest } from "../testing/integration.js";
import { RoutedRackApp } from "../../test-helpers/abstract-unit.js";
import { RoutingError, UrlGenerationError } from "../../action-controller/metal/exceptions.js";
import {
  Parameters,
  UnfilteredParameters,
} from "../../action-controller/metal/strong-parameters.js";
import { Redirection } from "../routing/redirection.js";
import { UrlFor } from "../routing/url-for.js";
import { RoutingUrlFor } from "@blazetrails/actionview";

class StubController {
  static actionEncodingTemplate(): null {
    return null;
  }
}

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
    "invoices",
    "involvements",
    "journey",
    "local",
    "managers",
    "medical/taxis",
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
    "project",
    "projects",
    "purchases",
    "replies",
    "rooms",
    "search",
    "sections",
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

const routeSpec = (match: Record<string, unknown>): string => `${match.controller}#${match.action}`;

class EchoParamsController {
  static actionEncodingTemplate(): null {
    return null;
  }
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
  class TestRoutingMapper extends IntegrationTest {}
  registerConstant("TestRoutingMapper", TestRoutingMapper);

  let t: TestRoutingMapper & Record<string, (...args: unknown[]) => string>;
  beforeEach(({ testCase }) => {
    t = testCase as typeof t;
  });

  function draw(block: DrawCallback): void {
    IntegrationTest.stubControllers((routes) => {
      routes.defaultUrlOptions = { host: "www.example.com" };
      routes.draw(block);
      t.app = new RoutedRackApp(routes);
    });
  }
  const assertResponse = (type: string): void => t.assertResponse(type);

  async function withHttps(block: () => Promise<void>): Promise<void> {
    const oldHttps = t.isHttps();
    t.httpsBang();
    try {
      await block();
    } finally {
      t.httpsBang(oldHttps);
    }
  }

  function verifyRedirect(url: string, status = 301): void {
    expect(t.response.status).toBe(status);
    expect(t.response.headers.get("Location")).toBe(url);
    expect(t.response.body).toBe("");
  }

  class IpRestrictor {
    static matches(request: Request): boolean {
      return /192\.168\.1\.1\d\d/.test(request.ip!);
    }
  }

  class GrumpyRestrictor {
    static matches(_request: Request): boolean {
      return false;
    }
  }

  class YoutubeFavoritesRedirector {
    static call(params: Record<string, string>, _request: Request): string {
      return `http://www.youtube.com/watch?v=${params.youtube_id}`;
    }
  }

  it("logout", async () => {
    draw(function () {
      this.controller("sessions", () => {
        this.delete({ logout: ":destroy" });
      });
    });

    await t.delete("/logout");
    expect(t.response.body).toBe("sessions#destroy");

    expect(t.logoutPath()).toBe("/logout");
    expect(t.urlFor({ controller: "sessions", action: "destroy", onlyPath: true })).toBe("/logout");
  });

  it("login", async () => {
    draw(function () {
      this.defaultUrlOptions = { host: "rubyonrails.org" };

      this.controller("sessions", () => {
        this.get({ login: ":new" });
        this.post({ login: ":create" });
      });
    });

    await t.get("/login");
    expect(t.response.body).toBe("sessions#new");
    expect(t.loginPath()).toBe("/login");

    await t.post("/login");
    expect(t.response.body).toBe("sessions#create");

    expect(t.urlFor({ controller: "sessions", action: "create", onlyPath: true })).toBe("/login");
    expect(t.urlFor({ controller: "sessions", action: "new", onlyPath: true })).toBe("/login");

    expect(t.urlFor({ controller: "sessions", action: "create" })).toBe(
      "http://rubyonrails.org/login",
    );
    expect(t.loginUrl()).toBe("http://rubyonrails.org/login");
  });

  it("session singleton resource", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resource("session");
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
    routes.draw(function () {
      this.resources("projects");
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
    routes.draw(function () {
      this.namespace("admin", () => {
        this.resources("users");
      });
    });

    expect(routes.recognizePath("/admin/users").action).toBe("index");
    expect(routes.recognizePath("/admin/users/1").action).toBe("show");
    expect(routes.pathFor({}, "admin_users")).toBe("/admin/users");
    expect(routes.pathFor({ id: 1 }, "admin_user")).toBe("/admin/users/1");
  });

  it("root", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.root("pages#home");
    });
    const m = routes.recognizePath("/");
    expect(m.controller).toBe("pages");
    expect(m.action).toBe("home");
    expect(routes.pathFor({}, "root")).toBe("/");
  });

  it("scoped root", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.scope("/api", { as: "api" }, () => {
        this.get("/status", { to: "status#show", as: "status" });
      });
    });
    expect(() => routes.recognizePath("/api/status")).not.toThrow();
    expect(routes.pathFor({}, "api_status")).toBe("/api/status");
  });

  it("nested namespace", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.namespace("api", () => {
        this.namespace("v1", () => {
          this.resources("articles");
        });
      });
    });
    expect(routes.recognizePath("/api/v1/articles").action).toBe("index");
    expect(routes.pathFor({}, "api_v1_articles")).toBe("/api/v1/articles");
    expect(routes.pathFor({ id: 5 }, "api_v1_article")).toBe("/api/v1/articles/5");
  });

  it("nested resources", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("posts", () => {
        this.resources("comments");
      });
    });
    const m = routes.recognizePath("/posts/3/comments/7");
    expect(m.controller).toBe("comments");
    expect(m.action).toBe("show");
  });

  it("match with multiple via", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.match("/search", { to: "search#index", via: ["GET", "POST"], as: "search" });
    });
    expect(() => routes.recognizePath("/search")).not.toThrow();
    expect(() => routes.recognizePath("/search", { method: "post" })).not.toThrow();
    expect(() => routes.recognizePath("/search", { method: "delete" })).toThrow(RoutingError);
  });

  it("multiple draw calls append routes", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/a", { to: "a#index" });
    });
    routes.draw(function () {
      this.get("/b", { to: "b#index" });
    });
    expect(() => routes.recognizePath("/a")).not.toThrow();
    expect(() => routes.recognizePath("/b")).not.toThrow();
  });

  it("constraints on dynamic segments", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/posts/:id", { to: "posts#show", as: "post", constraints: { id: /\d+/ } });
    });
    expect(() => routes.recognizePath("/posts/42")).not.toThrow();
    expect(() => routes.recognizePath("/posts/abc")).toThrow(RoutingError);
  });

  it("named routes", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/about", { to: "pages#about", as: "about" });
    });
    expect(routes.pathFor({}, "about")).toBe("/about");
  });

  it("getRoutes lists all routes", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.root("pages#home");
      this.resources("posts");
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
    routes.draw(function () {
      this.get("/posts/:id", { to: "posts#show" });
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
    routes.draw(function () {
      this.get("/posts/:id", { to: "posts#show" });
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
    routes.draw(function () {
      this.resource("session", { except: ["new", "edit"] });
    });
    expect(routes.recognizePath("/session").action).toBe("show");
    expect(routes.recognizePath("/session", { method: "post" }).action).toBe("create");
    expect(routes.recognizePath("/session", { method: "delete" }).action).toBe("destroy");
    expect(() => routes.recognizePath("/session/new")).toThrow(RoutingError);
    expect(() => routes.recognizePath("/session/edit")).toThrow(RoutingError);
  });

  it("resource routes with only and except", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resource("post", { only: ["show", "update", "destroy"] });
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
    routes.draw(function () {
      this.resource("profile", { only: ["create", "update", "destroy"] });
    });
    expect(routes.recognizePath("/profile", { method: "post" }).action).toBe("create");
    expect(routes.recognizePath("/profile", { method: "put" }).action).toBe("update");
    expect(routes.recognizePath("/profile", { method: "delete" }).action).toBe("destroy");
    expect(() => routes.recognizePath("/profile")).toThrow(RoutingError);
  });

  it("resources routes only create update destroy", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("products", { only: ["create", "update", "destroy"] });
    });
    expect(routes.recognizePath("/products", { method: "post" }).action).toBe("create");
    expect(routes.recognizePath("/products/1", { method: "put" }).action).toBe("update");
    expect(routes.recognizePath("/products/1", { method: "delete" }).action).toBe("destroy");
    expect(() => routes.recognizePath("/products")).toThrow(RoutingError);
    expect(() => routes.recognizePath("/products/1")).toThrow(RoutingError);
  });

  it("projects involvements (nested resources)", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("projects", () => {
        this.resources("involvements");
        this.resources("attachments");
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
    routes.draw(function () {
      this.resources("projects", () => {
        this.resources("attachments");
      });
    });
    expect(routes.recognizePath("/projects/1/attachments").controller).toBe("attachments");
  });

  it("openid", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.match("openid/login", { to: "openid#login", via: ["GET", "POST"] });
    });
    expect(routes.recognizePath("/openid/login").controller).toBe("openid");
    expect(routes.recognizePath("/openid/login", { method: "post" }).controller).toBe("openid");
  });

  it("namespace with options", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.namespace("api", () => {
        this.namespace("v1", () => {
          this.resources("users");
        });
      });
    });
    expect(routes.recognizePath("/api/v1/users").action).toBe("index");
    expect(routes.pathFor({}, "api_v1_users")).toBe("/api/v1/users");
  });

  it("namespace containing numbers", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.namespace("api", () => {
        this.namespace("v2", () => {
          this.resources("articles");
        });
      });
    });
    expect(routes.recognizePath("/api/v2/articles").action).toBe("index");
    expect(routes.pathFor({}, "api_v2_articles")).toBe("/api/v2/articles");
  });

  it("namespaced roots", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.namespace("account", () => {
        this.root("account#index");
      });
    });
    expect(routes.recognizePath("/account").action).toBe("index");
    expect(routes.pathFor({}, "account_root")).toBe("/account");
  });

  it("resource does not modify passed options", () => {
    const options = { only: ["show", "create"] as ("show" | "create")[] };
    const routes = new RouteSet();
    routes.draw(function () {
      this.resource("user", options);
    });
    expect(options).toEqual({ only: ["show", "create"] });
  });

  it("resources does not modify passed options", () => {
    const options = { only: ["index", "show"] as ("index" | "show")[] };
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("users", options);
    });
    expect(options).toEqual({ only: ["index", "show"] });
  });

  it("scoped root as name", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.scope("/api", { as: "api" }, () => {
        this.root("api#index");
      });
    });
    expect(routes.pathFor({}, "api_root")).toBe("/api");
  });

  it("projects posts (nested resources)", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("projects", () => {
        this.resources("posts");
      });
    });
    expect(routes.recognizePath("/projects/1/posts").controller).toBe("posts");
    expect(routes.recognizePath("/projects/1/posts/2").action).toBe("show");
    expect(routes.recognizePath("/projects/1/posts", { method: "post" }).action).toBe("create");
  });

  it("root works in the resources scope", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("products", () => {
        this.root({ to: "products#root" });
      });
    });
    expect(routeSpec(routes.recognizePath("/products"))).toBe("products#root");
    expect(routes.pathFor({}, "products_root")).toBe("/products");
  });

  it("module scope", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.scope({ module: "api" }, () => {
        this.resource("token");
      });
    });
    expect(routes.recognizePath("/token").action).toBe("show");
    expect(routes.pathFor({}, "token")).toBe("/token");
  });

  it("path scope", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.scope("api", () => {
        this.resource("me");
      });
    });
    expect(routes.recognizePath("/api/me").action).toBe("show");
    expect(routes.pathFor({}, "me")).toBe("/api/me");
  });

  it("dynamic controller segments are deprecated", async () => {
    await assertDeprecated(deprecator(), () => {
      new RouteSet().draw(function () {
        this.get("/:controller", { action: "index" });
      });
    });
  });

  it("nested resources with constraints", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("posts", { constraints: { id: /\d+/ } }, () => {
        this.resources("comments");
      });
    });
    expect(() => routes.recognizePath("/posts/1/comments")).not.toThrow();
  });

  it("index", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/info", { to: "projects#info", as: "info" });
    });
    expect(routes.pathFor({}, "info")).toBe("/info");
    expect(routes.recognizePath("/info").controller).toBe("projects");
    expect(routes.recognizePath("/info").action).toBe("info");
  });

  it("normalize namespaced matches", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.namespace("account", () => {
        this.get("description", { action: "description", as: "description" });
      });
    });
    expect(routes.pathFor({}, "account_description")).toBe("/account/description");
    const m = routes.recognizePath("/account/description");
    expect(m.controller).toBe("account");
    expect(m.action).toBe("description");
  });

  it("session info nested singleton resource", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resource("session", () => {
        this.resource("info");
      });
    });
    expect(routes.recognizePath("/session/info").action).toBe("show");
  });

  it("member on resource", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("replies", () => {
        this.member(() => {
          this.put(":answer", { action: "mark_as_answer" });
          this.delete(":answer", { action: "unmark_as_answer" });
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
    routes.draw(function () {
      this.resources("replies", () => {
        this.member(() => {
          this.put(":answer", { action: "mark_as_answer" });
          this.delete(":answer", { action: "unmark_as_answer" });
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
    routes.draw(function () {
      this.resources("projects", () => {
        this.resources("participants");
      });
    });
    expect(routes.recognizePath("/projects/1/participants").controller).toBe("participants");
    expect(routes.recognizePath("/projects/1/participants/2").action).toBe("show");
  });

  it("projects companies", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("projects", () => {
        this.resources("companies");
      });
    });
    expect(routes.recognizePath("/projects/1/companies").controller).toBe("companies");
    expect(routes.recognizePath("/projects/1/companies/2").action).toBe("show");
  });

  it("project manager", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("projects", () => {
        this.resource("manager");
      });
    });
    expect(routes.recognizePath("/projects/1/manager").action).toBe("show");
  });

  it("project images", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("projects", () => {
        this.resources("images");
      });
    });
    expect(routes.recognizePath("/projects/1/images").controller).toBe("images");
    expect(routes.recognizePath("/projects/1/images/2").action).toBe("show");
    expect(routes.recognizePath("/projects/1/images", { method: "post" }).action).toBe("create");
  });

  it("projects people", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("projects", () => {
        this.resources("people");
      });
    });
    expect(routes.recognizePath("/projects/1/people").controller).toBe("people");
    expect(routes.recognizePath("/projects/1/people/2").action).toBe("show");
  });

  it("account namespace", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.namespace("account", () => {
        this.resources("subscriptions");
      });
    });
    expect(routes.recognizePath("/account/subscriptions").action).toBe("index");
    expect(routes.pathFor({}, "account_subscriptions")).toBe("/account/subscriptions");
    expect(routes.pathFor({ id: 1 }, "account_subscription")).toBe("/account/subscriptions/1");
  });

  it("resource constraints", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("products", { constraints: { id: /\d{4}/ } });
    });
    expect(routes.recognizePath("/products/1234").action).toBe("show");
    expect(() => routes.recognizePath("/products/abc")).toThrow(RoutingError);
  });

  it("url generator for generic route", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("whatever/:controller/:action", { to: "foo#bar" });
    });
    expect(() => routes.recognizePath("/whatever/foo/bar")).not.toThrow();
  });

  it("url generator for namespaced generic route", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("whatever/:controller/:action/:id", { to: "foo#bar", constraints: { id: /\d+/ } });
    });
    expect(() => routes.recognizePath("/whatever/foo/show/1")).not.toThrow();
    expect(() => routes.recognizePath("/whatever/foo/show/abc")).toThrow(RoutingError);
  });

  it("resources merges options from scope", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("products", { only: ["index", "show"] }, () => {
        this.resources("images", { only: ["index"] });
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
    routes.draw(function () {
      this.resource("account", { only: ["show"] });
    });
    expect(routes.recognizePath("/account").action).toBe("show");
    expect(() => routes.recognizePath("/account/new")).toThrow(RoutingError);
    expect(() => routes.recognizePath("/account/edit")).toThrow(RoutingError);
  });

  it("resource merges options from scope hash", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resource("account", { only: ["show"] });
    });
    expect(routes.recognizePath("/account").action).toBe("show");
    expect(() => routes.recognizePath("/account/new")).toThrow(RoutingError);
  });

  it("match without via", () => {
    const routes = new RouteSet();
    expect(() =>
      routes.draw(function () {
        this.match("/foo/bar", { to: "files#show" });
      }),
    ).toThrow(ArgumentError);
  });

  it("non greedy regexp", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/posts/:id", { to: "posts#show", constraints: { id: /\d+?/ } });
    });
    expect(() => routes.recognizePath("/posts/1")).not.toThrow();
  });

  it("default string params", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/posts", { to: "posts#index", defaults: { format: "json" } });
    });
    expect(routes.recognizePath("/posts").format).toBe("json");
  });

  it("default integer params", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/posts", { to: "posts#index", defaults: { page: "1" } });
    });
    expect(routes.recognizePath("/posts").page).toBe("1");
  });

  it("symbol scope", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.scope("api", () => {
        this.scope("v2", () => {
          this.resource("me");
        });
      });
    });
    expect(routes.recognizePath("/api/v2/me").action).toBe("show");
  });

  it("update person route", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("people");
    });
    expect(routes.recognizePath("/people/1", { method: "put" }).action).toBe("update");
    expect(routes.recognizePath("/people/1", { method: "patch" }).action).toBe("update");
  });

  it("update project person", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("projects", () => {
        this.resources("people");
      });
    });
    expect(routes.recognizePath("/projects/1/people/2", { method: "put" }).action).toBe("update");
  });

  it("forum products", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.namespace("forum", () => {
        this.resources("products");
      });
    });
    expect(routes.recognizePath("/forum/products").action).toBe("index");
    expect(routes.pathFor({}, "forum_products")).toBe("/forum/products");
  });

  it("articles with id", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("articles");
    });
    expect(routes.recognizePath("/articles/1").action).toBe("show");
    expect(routes.pathFor({ id: 1 }, "article")).toBe("/articles/1");
  });

  it("articles perma", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("articles", { constraints: { id: /\d+/ } });
    });
    expect(routes.recognizePath("/articles/42").action).toBe("show");
    expect(() => routes.recognizePath("/articles/abc")).toThrow(RoutingError);
  });

  it("appending routes", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/hello", { to: "hello#index" });
    });
    routes.draw(function () {
      this.get("/goodbye", { to: "goodbye#index" });
    });
    expect(() => routes.recognizePath("/hello")).not.toThrow();
    expect(() => routes.recognizePath("/goodbye")).not.toThrow();
    expect(() => routes.recognizePath("/random")).toThrow(RoutingError);
  });

  it("controller option with nesting and leading slash", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.namespace("foo", () => {
        this.namespace("bar", () => {
          this.get("baz", { to: "baz#index" });
        });
      });
    });
    expect(routes.recognizePath("/foo/bar/baz").action).toBe("index");
  });

  it("multiple nested controller", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.namespace("foo", () => {
        this.namespace("bar", () => {
          this.get("baz", { to: "baz#index" });
        });
      });
      this.get("pooh", { to: "pooh#index" });
    });
    expect(() => routes.recognizePath("/foo/bar/baz")).not.toThrow();
    expect(() => routes.recognizePath("/pooh")).not.toThrow();
  });

  it("sprockets", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/assets/*path", { to: "assets#show", as: "asset" });
    });
    expect(() => routes.recognizePath("/assets/application.js")).not.toThrow();
    expect(routes.pathFor({ path: "application.js" }, "asset")).toBe("/assets/application.js");
  });

  it("projects status", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/projects/status", { to: "projects#status" });
    });
    expect(routes.recognizePath("/projects/status").action).toBe("status");
  });

  it("access token rooms", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("access_tokens", () => {
        this.resources("rooms");
      });
    });
    expect(routes.recognizePath("/access_tokens/1/rooms").controller).toBe("rooms");
  });

  it("resources controller name is not pluralized", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("content");
    });
    expect(routes.recognizePath("/content").controller).toBe("content");
  });

  it("resources are not pluralized", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.namespace("transport", () => {
        this.resources("taxis");
      });
    });
    expect(routes.recognizePath("/transport/taxis").action).toBe("index");
    expect(routes.pathFor({}, "transport_taxis")).toBe("/transport/taxis");
    expect(routes.recognizePath("/transport/taxis/1").action).toBe("show");
    expect(routes.pathFor({ id: 1 }, "transport_taxi")).toBe("/transport/taxis/1");
    expect(routes.recognizePath("/transport/taxis/new").action).toBe("new");
    expect(routes.pathFor({}, "new_transport_taxi")).toBe("/transport/taxis/new");
    expect(routes.recognizePath("/transport/taxis/1/edit").action).toBe("edit");
    expect(routes.pathFor({ id: 1 }, "edit_transport_taxi")).toBe("/transport/taxis/1/edit");
  });

  it("singleton resources are not singularized", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.namespace("medical", () => {
        this.resource("taxis");
      });
    });
    expect(routes.recognizePath("/medical/taxis").action).toBe("show");
    expect(routes.recognizePath("/medical/taxis", { method: "post" }).action).toBe("create");
    expect(routes.recognizePath("/medical/taxis/new").action).toBe("new");
    expect(routes.recognizePath("/medical/taxis/edit").action).toBe("edit");
  });

  it("router removes invalid conditions", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/tickets", { to: "tickets#index", as: "tickets" });
    });
    expect(() => routes.recognizePath("/tickets")).not.toThrow();
    expect(routes.pathFor({}, "tickets")).toBe("/tickets");
  });

  it("route defined in resources scope level", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("customers", () => {
        this.get("export", { to: "customers#export" });
      });
    });
    expect(routes.recognizePath("/customers/1/export").action).toBe("export");
  });

  it("only should be read from scope", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("clubs", { only: ["index", "show"] });
    });
    expect(() => routes.recognizePath("/clubs")).not.toThrow();
    expect(() => routes.recognizePath("/clubs/1")).not.toThrow();
    expect(() => routes.recognizePath("/clubs/1/edit")).toThrow(RoutingError);
    expect(() => routes.recognizePath("/clubs", { method: "post" })).toThrow(RoutingError);
  });

  it("except should be read from scope", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("clubs", { except: ["new", "edit"] });
    });
    expect(() => routes.recognizePath("/clubs")).not.toThrow();
    expect(() => routes.recognizePath("/clubs/1")).not.toThrow();
    expect(routes.recognizePath("/clubs/new").action).toBe("show");
    expect(() => routes.recognizePath("/clubs/1/edit")).toThrow(RoutingError);
  });

  it("only option should override scope", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("posts", { only: ["index"] });
    });
    expect(() => routes.recognizePath("/posts")).not.toThrow();
    expect(() => routes.recognizePath("/posts/1")).toThrow(RoutingError);
  });

  it("except option should override scope", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("posts", { except: ["destroy"] });
    });
    expect(() => routes.recognizePath("/posts/1", { method: "delete" })).toThrow(RoutingError);
    expect(() => routes.recognizePath("/posts")).not.toThrow();
  });

  it("only option should not inherit", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("posts", { only: ["index", "show"] }, () => {
        this.resources("comments");
      });
    });
    expect(() => routes.recognizePath("/posts/1/comments")).not.toThrow();
    expect(() => routes.recognizePath("/posts/1/comments", { method: "post" })).not.toThrow();
    expect(() => routes.recognizePath("/posts/1/comments/new")).not.toThrow();
  });

  it("except option should not inherit", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("posts", { except: ["destroy"] }, () => {
        this.resources("comments");
      });
    });
    expect(() => routes.recognizePath("/posts/1/comments/2", { method: "delete" })).not.toThrow();
  });

  it("projects for api app", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("projects", { except: ["new", "edit"] });
    });
    expect(() => routes.recognizePath("/projects")).not.toThrow();
    expect(() => routes.recognizePath("/projects/1")).not.toThrow();
    expect(routes.recognizePath("/projects/new").action).toBe("show");
    expect(() => routes.recognizePath("/projects/1/edit")).toThrow(RoutingError);
  });

  it("constraints are merged from scope", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("movies", { constraints: { id: /\d{4}/ } });
    });
    expect(routes.recognizePath("/movies/0001").action).toBe("show");
    expect(() => routes.recognizePath("/movies/00001")).toThrow(RoutingError);
  });

  it("nested resource constraints", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("lists", { constraints: { id: /\d+/ } }, () => {
        this.resources("todos", { constraints: { id: /\d+/ } });
      });
    });
    expect(() => routes.recognizePath("/lists/1/todos/2")).not.toThrow();
    expect(() => routes.recognizePath("/lists/abc/todos/2")).toThrow(RoutingError);
  });

  it("URL helpers raise a missing keys error for a nil param", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/posts/:id", { to: "posts#show", as: "post" });
    });
    expect(() => routes.pathFor({}, "post")).toThrow(/missing required keys: \[:id\]/);
  });

  it("resource with slugs in ids", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("posts", { constraints: { id: /[a-z0-9-]+/ } });
    });
    expect(routes.recognizePath("/posts/hello-world").action).toBe("show");
    expect(routes.recognizePath("/posts/123-abc").id).toBe("123-abc");
  });

  it("named character classes in regexp constraints", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/purchases/:token/:filename", {
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
    routes.draw(function () {
      this.get("/pages", { to: "wiki_pages#index", as: "wiki_pages" });
      this.get("/pages/:id", { to: "wiki_pages#show", as: "wiki_page" });
    });
    expect(routes.pathFor({}, "wiki_pages")).toBe("/pages");
    expect(routes.pathFor({ id: "Ruby_on_Rails" }, "wiki_page")).toBe("/pages/Ruby_on_Rails");
  });

  it("login redirect", async () => {
    draw(function () {
      this.get("account/login", { to: this.redirect("/login") });
    });

    await t.get("/account/login");
    verifyRedirect("http://www.example.com/login");
  });

  it("logout redirect without to", async () => {
    draw(function () {
      this.get({ "account/logout": this.redirect("/logout"), as: "logout_redirect" });
    });

    expect(t.logoutRedirectPath()).toBe("/account/logout");
    await t.get("/account/logout");
    verifyRedirect("http://www.example.com/logout");
  });

  it("namespace redirect", async () => {
    draw(function () {
      this.namespace("private", () => {
        this.root({ to: this.redirect("/private/index") });
        this.get("index", { to: "private#index" });
      });
    });

    await t.get("/private");
    verifyRedirect("http://www.example.com/private/index");
  });

  it("redirect with failing constraint", async () => {
    draw(function () {
      this.get("hi", { to: this.redirect("/foo"), constraints: GrumpyRestrictor });
    });

    await t.get("/hi");
    expect(t.status).toBe(404);
  });

  it("redirect with passing constraint", async () => {
    draw(function () {
      this.get("hi", { to: this.redirect("/foo"), constraints: (_req: Request) => true });
    });

    await t.get("/hi");
    expect(t.status).toBe(301);
  });

  it("redirect modulo", async () => {
    draw(function () {
      this.get("account/modulo/:name", { to: this.redirect("/%{name}s") });
    });

    await t.get("/account/modulo/name");
    verifyRedirect("http://www.example.com/names");
  });

  it("redirect proc", async () => {
    draw(function () {
      this.get("account/proc/:name", {
        to: this.redirect((params, _req) => `/${pluralize(params.name)}`),
      });
    });

    await t.get("/account/proc/person");
    verifyRedirect("http://www.example.com/people");
  });

  it("redirect proc with request", async () => {
    draw(function () {
      this.get({ "account/proc_req": this.redirect((_params, req) => `/${req.method}`) });
    });

    await t.get("/account/proc_req");
    verifyRedirect("http://www.example.com/GET");
  });

  it("redirect hash with subdomain", async () => {
    draw(function () {
      this.get("mobile", { to: this.redirect({ subdomain: "mobile" }) });
    });

    await t.get("/mobile");
    verifyRedirect("http://mobile.example.com/mobile");
  });

  it("redirect hash with domain and path", async () => {
    draw(function () {
      this.get("documentation", {
        to: this.redirect({ domain: "example-documentation.com", path: "" }),
      });
    });

    await t.get("/documentation");
    verifyRedirect("http://www.example-documentation.com");
  });

  it("redirect hash with path", async () => {
    draw(function () {
      this.get("new_documentation", { to: this.redirect({ path: "/documentation/new" }) });
    });

    await t.get("/new_documentation");
    verifyRedirect("http://www.example.com/documentation/new");
  });

  it("redirect hash with host", async () => {
    draw(function () {
      this.get("super_new_documentation", { to: this.redirect({ host: "super-docs.com" }) });
    });

    await t.get("/super_new_documentation?section=top");
    verifyRedirect("http://super-docs.com/super_new_documentation?section=top");
  });

  it("redirect hash path substitution", async () => {
    draw(function () {
      this.get("stores/:name", { to: this.redirect({ subdomain: "stores", path: "/%{name}" }) });
    });

    await t.get("/stores/iernest");
    verifyRedirect("http://stores.example.com/iernest");
  });

  it("redirect hash path substitution with catch all", async () => {
    draw(function () {
      this.get("stores/:name(*rest)", {
        to: this.redirect({ subdomain: "stores", path: "/%{name}%{rest}" }),
      });
    });

    await t.get("/stores/iernest/products");
    verifyRedirect("http://stores.example.com/iernest/products");
  });

  it("redirect class", async () => {
    draw(function () {
      this.get("youtube_favorites/:youtube_id/:name", {
        to: this.redirect(YoutubeFavoritesRedirector),
      });
    });

    await t.get("/youtube_favorites/oHg5SJYRHA0/rick-rolld");
    verifyRedirect("http://www.youtube.com/watch?v=oHg5SJYRHA0");
  });

  it("resources for uncountable names", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("sheep");
    });
    expect(() => routes.recognizePath("/sheep")).not.toThrow();
    expect(() => routes.recognizePath("/sheep/1")).not.toThrow();
  });

  it("path names", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("posts", { pathNames: { new: "novo", edit: "editar" } });
    });
    expect(() => routes.recognizePath("/posts/novo")).not.toThrow();
    expect(routes.recognizePath("/posts/novo").action).toBe("new");
    expect(() => routes.recognizePath("/posts/1/editar")).not.toThrow();
    expect(routes.recognizePath("/posts/1/editar").action).toBe("edit");
  });

  it("projects with resources path names", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("projects", { pathNames: { new: "nuevo" } }, () => {
        this.resources("tasks", { pathNames: { new: "nueva" } });
      });
    });
    expect(routes.recognizePath("/projects/nuevo").action).toBe("new");
    expect(routes.recognizePath("/projects/1/tasks/nueva").action).toBe("new");
  });

  it("shallow nested resources", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("posts", () => {
        this.resources("comments", { shallow: true });
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
    routes.draw(function () {
      this.resource("account", () => {
        this.resources("posts", { shallow: true });
      });
    });
    expect(() => routes.recognizePath("/account/posts")).not.toThrow();
    expect(() => routes.recognizePath("/posts/1")).not.toThrow();
    expect(routes.recognizePath("/posts/1").action).toBe("show");
  });

  it("custom resource routes are scoped", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("posts", () => {
        this.get("preview", { to: "posts#preview", as: "preview" });
      });
    });
    const m = routes.recognizePath("/posts/1/preview");
    expect(m.action).toBe("preview");
  });

  it("glob parameter accepts regexp", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/posts/*path", { to: "posts#show" });
    });
    const m = routes.recognizePath("/posts/2024/01/hello");
    expect(m.path).toBe("2024/01/hello");
  });

  it("optional scoped root hierarchy", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("(/:locale)/posts", { to: "posts#index" });
      this.get("(/:locale)/posts/:id", { to: "posts#show" });
    });
    expect(routeSpec(routes.recognizePath("/posts"))).toBe("posts#index");
    expect(routeSpec(routes.recognizePath("/posts/1"))).toBe("posts#show");
    expect(routes.recognizePath("/en/posts/1").locale).toBe("en");
  });

  it("optional part of segment", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/posts(/:id)", { to: "posts#index" });
    });
    expect(() => routes.recognizePath("/posts")).not.toThrow();
    expect(routes.recognizePath("/posts/1").id).toBe("1");
  });

  it("url generator for optional prefix dynamic segment", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("(/:locale)/posts", { to: "posts#index", as: "posts" });
    });
    expect(routes.pathFor({ locale: "en" }, "posts")).toBe("/en/posts");
    expect(routes.pathFor({}, "posts")).toBe("/posts");
  });

  it("url generator for optional suffix static and dynamic segment", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/posts(/:id)", { to: "posts#show", as: "post" });
    });
    expect(routes.pathFor({ id: "1" }, "post")).toBe("/posts/1");
    expect(routes.pathFor({}, "post")).toBe("/posts");
  });

  it("constraints block not carried to following routes", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.constraints({ id: /\d+/ }, () => {
        this.get("/posts/:id", { to: "posts#show" });
      });
      this.get("/articles/:id", { to: "articles#show" });
    });
    expect(() => routes.recognizePath("/posts/123")).not.toThrow();
    expect(() => routes.recognizePath("/articles/abc")).not.toThrow();
  });

  it("concerns", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.concern("commentable", (r) => {
        r.resources("comments");
      });
      this.resources("posts", () => {
        this.concerns("commentable");
      });
    });
    expect(() => routes.recognizePath("/posts/1/comments")).not.toThrow();
    expect(() => routes.recognizePath("/posts/1/comments", { method: "post" })).not.toThrow();
    expect(() => routes.recognizePath("/posts/1/comments/2")).not.toThrow();
  });
  it("trailing slash", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/posts", { to: "posts#index", as: "posts" });
    });
    expect(() => routes.recognizePath("/posts/")).not.toThrow();
  });

  it("accepts a constraint object responding to call", async () => {
    const constraint = class {
      call(): boolean {
        return true;
      }
      matches(): boolean {
        return false;
      }
    };

    draw(function () {
      this.get("/", { to: "home#show", constraints: new constraint() });
    });

    await assertNothingRaised(() => t.get("/"));
  });

  it("namespace with controller segment", async () => {
    expect(() => {
      draw(function () {
        this.namespace("admin", () => {
          deprecator().silence(() => {
            this.get("/:controller(/:action(/:id(.:format)))");
          });
        });
      });
    }).toThrow(ArgumentError);
  });

  it("namespace without controller segment", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.namespace("admin", () => {
        this.get("hello/:controllers/:action");
      });
    });
    const m = routes.recognizePath("/admin/hello/foo/new");
    expect(m["controllers"]).toBe("foo");
  });

  it("websocket", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.connect("chat/live", { to: "chat#live" });
    });
    expect(routes.recognizePath("/chat/live").action).toBe("live");
    expect(routes.recognizePath("/chat/live", { method: "connect" }).action).toBe("live");
  });

  it("bookmarks", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.scope("bookmark", { controller: "bookmarks", as: "bookmark" }, () => {
        this.get(":new", { path: "build" });
        this.post(":create", { path: "create", as: "" });
        this.put(":update");
        this.get(":remove", { action: "destroy", as: "remove" });
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
    routes.draw(function () {
      this.scope("pagemark", { module: "pagemarks", as: "pagemark" }, () => {
        this.get("build", { action: "new", as: "new" });
        this.post("create", { action: "create", as: "" });
        this.put("update", { action: "update", as: "update" });
        this.get("remove", { action: "destroy", as: "remove" });
        this.get("", { action: "show", as: "show" });
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

  it("admin", async () => {
    draw(function () {
      this.constraints({ ip: /192\.168\.1\.\d\d\d/ }, () => {
        this.get({ admin: "queenbee#index" });
      });

      this.constraints(IpRestrictor, () => {
        this.get({ "admin/accounts": "queenbee#accounts" });
      });

      this.get({ "admin/passwords": "queenbee#passwords", constraints: IpRestrictor });
    });

    await t.get("/admin", { headers: { REMOTE_ADDR: "192.168.1.100" } });
    expect(t.response.body).toBe("queenbee#index");

    await t.get("/admin", { headers: { REMOTE_ADDR: "10.0.0.100" } });
    expect(t.response.headers.get("x-cascade")).toBe("pass");

    await t.get("/admin/accounts", { headers: { REMOTE_ADDR: "192.168.1.100" } });
    expect(t.response.body).toBe("queenbee#accounts");

    await t.get("/admin/accounts", { headers: { REMOTE_ADDR: "10.0.0.100" } });
    expect(t.response.headers.get("x-cascade")).toBe("pass");

    await t.get("/admin/passwords", { headers: { REMOTE_ADDR: "192.168.1.100" } });
    expect(t.response.body).toBe("queenbee#passwords");

    await t.get("/admin/passwords", { headers: { REMOTE_ADDR: "10.0.0.100" } });
    expect(t.response.headers.get("x-cascade")).toBe("pass");
  });

  it("global", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.scope({ module: "global" }, () => {
        this.get("global/hide_notice", { action: "hide_notice", as: "global_hide_notice" });
        this.get("global/export", { action: "export", as: "export_request" });
        this.get("/export/:id/:file", {
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
    routes.draw(function () {
      this.get("/local/dashboard", { to: "local#dashboard" });
    });
    expect(routes.recognizePath("/local/dashboard").action).toBe("dashboard");
  });

  it("url for with no side effects", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/projects/status(.:format)", { to: "projects#status" });
    });
    expect(() => routes.recognizePath("/projects/status")).not.toThrow();
  });

  it("url for does not modify controller", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/projects/status(.:format)", { to: "projects#status" });
    });
    expect(() => routes.recognizePath("/projects/status")).not.toThrow();
  });

  it("named route with no side effects", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("customers", () => {
        this.member(() => {
          this.get("profile", { as: "profile" });
        });
      });
    });
    expect(() => routes.recognizePath("/customers/1/profile")).not.toThrow();
  });

  it("projects", async () => {
    draw(function () {
      this.resources("projects", { controller: "project" });
    });

    await t.get("/projects");
    expect(t.response.body).toBe("project#index");
    expect(t.projectsPath()).toBe("/projects");

    await t.post("/projects");
    expect(t.response.body).toBe("project#create");

    await t.get("/projects.xml");
    expect(t.response.body).toBe("project#index");
    expect(t.projectsPath({ format: "xml" })).toBe("/projects.xml");

    await t.get("/projects/new");
    expect(t.response.body).toBe("project#new");
    expect(t.newProjectPath()).toBe("/projects/new");

    await t.get("/projects/new.xml");
    expect(t.response.body).toBe("project#new");
    expect(t.newProjectPath({ format: "xml" })).toBe("/projects/new.xml");

    await t.get("/projects/1");
    expect(t.response.body).toBe("project#show");
    expect(t.projectPath({ id: "1" })).toBe("/projects/1");

    await t.get("/projects/1.xml");
    expect(t.response.body).toBe("project#show");
    expect(t.projectPath({ id: "1", format: "xml" })).toBe("/projects/1.xml");

    await t.get("/projects/1/edit");
    expect(t.response.body).toBe("project#edit");
    expect(t.editProjectPath({ id: "1" })).toBe("/projects/1/edit");
  });

  it("projects with post action and new path on collection", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("projects", { controller: "project" }, () => {
        this.post("new", { action: "new", on: "collection", as: "new" });
      });
    });
    const params = routes.recognizePath("/projects/new", { method: "post" });
    expect(`${params.controller}#${params.action}`).toBe("project#new");
    expect(routes.pathFor({}, "new_projects")).toBe("/projects/new");
  });

  it.skip("projects involvements", () => {});

  it("projects posts", async () => {
    draw(function () {
      this.resources("projects", () => {
        this.resources("posts", () => {
          this.get(":archive", { on: "collection" });
          this.get(":toggle_view", { on: "collection" });
          this.post(":preview", { on: "member" });

          this.resource("subscription");

          this.resources("comments", () => {
            this.post(":preview", { on: "collection" });
          });
        });
      });
    });

    await t.get("/projects/1/posts");
    expect(t.response.body).toBe("posts#index");
    expect(t.projectPostsPath({ project_id: "1" })).toBe("/projects/1/posts");

    await t.get("/projects/1/posts/archive");
    expect(t.response.body).toBe("posts#archive");
    expect(t.archiveProjectPostsPath({ project_id: "1" })).toBe("/projects/1/posts/archive");

    await t.get("/projects/1/posts/toggle_view");
    expect(t.response.body).toBe("posts#toggle_view");
    expect(t.toggleViewProjectPostsPath({ project_id: "1" })).toBe("/projects/1/posts/toggle_view");

    await t.post("/projects/1/posts/1/preview");
    expect(t.response.body).toBe("posts#preview");
    expect(t.previewProjectPostPath({ project_id: "1", id: "1" })).toBe(
      "/projects/1/posts/1/preview",
    );

    await t.get("/projects/1/posts/1/subscription");
    expect(t.response.body).toBe("subscriptions#show");
    expect(t.projectPostSubscriptionPath({ project_id: "1", post_id: "1" })).toBe(
      "/projects/1/posts/1/subscription",
    );

    await t.get("/projects/1/posts/1/comments");
    expect(t.response.body).toBe("comments#index");
    expect(t.projectPostCommentsPath({ project_id: "1", post_id: "1" })).toBe(
      "/projects/1/posts/1/comments",
    );

    await t.post("/projects/1/posts/1/comments/preview");
    expect(t.response.body).toBe("comments#preview");
    expect(t.previewProjectPostCommentsPath({ project_id: "1", post_id: "1" })).toBe(
      "/projects/1/posts/1/comments/preview",
    );
  });

  it("path option override", async () => {
    draw(function () {
      this.scope("pt", { as: "pt" }, () => {
        this.resources("projects", { pathNames: { new: "novo" }, path: "projetos" }, () => {
          this.put(":close", { on: "member", path: "fechar" });
          this.get(":open", { on: "new", path: "abrir" });
        });
      });
    });

    await t.get("/pt/projetos/novo/abrir");
    expect(t.response.body).toBe("projects#open");
    expect(t.openNewPtProjectPath()).toBe("/pt/projetos/novo/abrir");

    await t.put("/pt/projetos/1/fechar");
    expect(t.response.body).toBe("projects#close");
    expect(t.closePtProjectPath(1)).toBe("/pt/projetos/1/fechar");
  });

  it("namespace nested in resources", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("clients", () => {
        this.namespace("google", () => {
          this.resource("account", () => {
            this.namespace("secret", () => {
              this.resource("info");
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
    routes.draw(function () {
      this.namespace("foo", { module: "bar" }, () => {
        this.resources("posts", { only: ["index", "show"] }, () => {
          this.resources("comments", { only: ["index", "show"], shallow: true });
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
    routes.draw(function () {
      this.namespace("foo", { path: "bar" }, () => {
        this.resources("posts", { only: ["index", "show"] }, () => {
          this.resources("comments", { only: ["index", "show"], shallow: true });
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
    routes.draw(function () {
      this.namespace("foo", { as: "bar" }, () => {
        this.resources("posts", { only: ["index", "show"] }, () => {
          this.resources("comments", { only: ["index", "show"], shallow: true });
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
    routes.draw(function () {
      this.namespace("foo", { shallowPath: "bar" }, () => {
        this.resources("posts", { only: ["index", "show"] }, () => {
          this.resources("comments", { only: ["index", "show"], shallow: true });
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
    routes.draw(function () {
      this.namespace("foo", { shallowPrefix: "bar" }, () => {
        this.resources("posts", { only: ["index", "show"] }, () => {
          this.resources("comments", { only: ["index", "show"], shallow: true });
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

  it("optional scoped root multiple choice", async () => {
    draw(function () {
      this.scope("(:locale)", () => {
        this.scope("(p/:platform)", () => {
          this.scope("(b/:browser)", () => {
            this.root({ to: "projects#index" });
          });
        });
      });
    });

    expect(t.rootPath({ locale: "en" })).toBe("/en");
    expect(t.rootPath({ platform: "osx" })).toBe("/p/osx");
    expect(t.rootPath({ locale: "en", platform: "osx" })).toBe("/en/p/osx");
    expect(t.rootPath({ browser: "chrome" })).toBe("/b/chrome");
    expect(t.rootPath({ locale: "en", browser: "chrome" })).toBe("/en/b/chrome");
    expect(t.rootPath({ platform: "osx", browser: "chrome" })).toBe("/p/osx/b/chrome");
    expect(t.rootPath({ locale: "en", platform: "osx", browser: "chrome" })).toBe(
      "/en/p/osx/b/chrome",
    );

    await t.get("/en");
    expect(t.response.body).toBe("projects#index");

    await t.get("/p/osx");
    expect(t.response.body).toBe("projects#index");

    await t.get("/en/p/osx");
    expect(t.response.body).toBe("projects#index");

    await t.get("/b/chrome");
    expect(t.response.body).toBe("projects#index");

    await t.get("/en/b/chrome");
    expect(t.response.body).toBe("projects#index");

    await t.get("/p/osx/b/chrome");
    expect(t.response.body).toBe("projects#index");

    await t.get("/en/p/osx/b/chrome");
    expect(t.response.body).toBe("projects#index");
  });

  it("scope with format option", async () => {
    draw(function () {
      this.get("direct/index", { as: "no_format_direct", format: false });

      this.scope({ format: false }, () => {
        this.get("scoped/index", { as: "no_format_scoped" });
      });
    });

    expect(t.noFormatDirectPath()).toBe("/direct/index");
    expect(t.noFormatDirectPath({ format: "html" })).toBe("/direct/index?format=html");

    expect(t.noFormatScopedPath()).toBe("/scoped/index");
    expect(t.noFormatScopedPath({ format: "html" })).toBe("/scoped/index?format=html");

    await t.get("/scoped/index");
    expect(t.response.body).toBe("scoped#index");

    await t.get("/scoped/index.html");
    expect(t.response.body).toBe("Not Found");
  });

  it("resources with format false from scope", async () => {
    draw(function () {
      this.scope({ format: false }, () => {
        this.resources("posts");
        this.resource("user");
      });
    });

    await t.get("/posts");
    assertResponse("success");
    expect(t.response.body).toBe("posts#index");
    expect(t.postsPath()).toBe("/posts");

    await t.get("/posts.html");
    assertResponse("not_found");
    expect(t.response.body).toBe("Not Found");
    expect(t.postsPath({ format: "html" })).toBe("/posts?format=html");

    await t.get("/user");
    assertResponse("success");
    expect(t.response.body).toBe("users#show");
    expect(t.userPath()).toBe("/user");

    await t.get("/user.html");
    assertResponse("not_found");
    expect(t.response.body).toBe("Not Found");
    expect(t.userPath({ format: "html" })).toBe("/user?format=html");
  });

  it("match with many paths containing a slash", async () => {
    await assertDeprecated(deprecator(), () => {
      draw(function () {
        this.get("get/first", "get/second", "get/third", { to: "get#show" });
      });
    });

    await t.get("/get/first");
    expect(t.response.body).toBe("get#show");

    await t.get("/get/second");
    expect(t.response.body).toBe("get#show");

    await t.get("/get/third");
    expect(t.response.body).toBe("get#show");
  });

  it("match shorthand with no scope", async () => {
    draw(function () {
      this.get("account/overview");
    });

    expect(t.accountOverviewPath()).toBe("/account/overview");
    await t.get("/account/overview");
    expect(t.response.body).toBe("account#overview");
  });

  it("match shorthand inside namespace", async () => {
    draw(function () {
      this.namespace("account", () => {
        this.get("shorthand");
      });
    });

    expect(t.accountShorthandPath()).toBe("/account/shorthand");
    await t.get("/account/shorthand");
    expect(t.response.body).toBe("account#shorthand");
  });

  it("match shorthand with multiple paths inside namespace", async () => {
    await assertDeprecated(deprecator(), () => {
      draw(function () {
        this.namespace("proposals", () => {
          this.put("activate", "inactivate");
        });
      });
    });

    await t.put("/proposals/activate");
    expect(t.response.body).toBe("proposals#activate");

    await t.put("/proposals/inactivate");
    expect(t.response.body).toBe("proposals#inactivate");
  });

  it("match shorthand inside namespace with controller", async () => {
    draw(function () {
      this.namespace("api", () => {
        this.get("products/list");
      });
    });

    expect(t.apiProductsListPath()).toBe("/api/products/list");
    await t.get("/api/products/list");
    expect(t.response.body).toBe("api/products#list");
  });

  it("match shorthand inside scope with variables with controller", async () => {
    draw(function () {
      this.scope(":locale", () => {
        this.match("questions/new", { via: ["get"] });
      });
    });

    await t.get("/de/questions/new");
    expect(t.response.body).toBe("questions#new");
    expect(t.request.params["locale"]).toBe("de");
  });

  it("match shorthand inside nested namespaces and scopes with controller", async () => {
    draw(function () {
      this.namespace("api", () => {
        this.namespace("v3", () => {
          this.scope(":locale", () => {
            this.get("products/list");
          });
        });
      });
    });

    await t.get("/api/v3/en/products/list");
    expect(t.response.body).toBe("api/v3/products#list");
  });

  it("not matching shorthand with dynamic parameters", async () => {
    draw(function () {
      deprecator().silence(() => {
        this.get(":controller/:action/admin");
      });
    });

    await t.get("/finances/overview/admin");
    expect(t.response.body).toBe("finances#overview");
  });

  it("dynamically generated helpers on collection do not clobber resources url helper", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("replies", () => {
        this.collection(() => {
          this.get("page/:page", { to: "replies#index" });
          this.get("/:page", { to: "replies#index" });
        });
      });
    });
    expect(routes.pathFor({}, "replies")).toBe("/replies");
  });

  it("scoped controller with namespace and action", async () => {
    draw(function () {
      this.namespace("account", () => {
        deprecator().silence(() => {
          this.get(":action/callback", {
            action: /twitter|github/,
            controller: "callbacks",
            as: "callback",
          });
        });
      });
    });

    expect(t.accountCallbackPath("twitter")).toBe("/account/twitter/callback");
    await t.get("/account/twitter/callback");
    expect(t.response.body).toBe("account/callbacks#twitter");

    await t.get("/account/whatever/callback");
    expect(t.response.body).toBe("Not Found");
  });

  it("convention match nested and with leading slash", async () => {
    draw(function () {
      this.get("/account/nested/overview");
    });

    expect(t.accountNestedOverviewPath()).toBe("/account/nested/overview");
    await t.get("/account/nested/overview");
    expect(t.response.body).toBe("account/nested#overview");
  });

  it("convention with explicit end", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("sign_in", { to: "sessions#new", as: "sign_in" });
    });
    const m = routes.recognizePath("/sign_in");
    expect(m.controller).toBe("sessions");
    expect(m.action).toBe("new");
    expect(routes.pathFor({}, "sign_in")).toBe("/sign_in");
  });

  it("redirect with complete url and status", async () => {
    draw(function () {
      this.get({ "account/google": this.redirect("http://www.google.com/", { status: 302 }) });
    });

    await t.get("/account/google");
    verifyRedirect("http://www.google.com/", 302);
  });

  it("redirect with port", async () => {
    draw(function () {
      this.get("account/login", { to: this.redirect("/login") });
    });

    const previousHost = t.host;
    t.host = "www.example.com:3000";
    try {
      await t.get("/account/login");
      verifyRedirect("http://www.example.com:3000/login");
    } finally {
      t.host = previousHost;
    }
  });

  it("optional scoped root", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.scope("(:locale)", () => {
        this.root("projects#index");
      });
    });
    expect(routes.pathFor({ locale: "en" }, "root")).toBe("/en");
    const m = routes.recognizePath("/en");
    expect(m.controller).toBe("projects");
    expect(m.action).toBe("index");
  });

  it("optional scoped path", async () => {
    draw(function () {
      this.scope("(:locale)", { locale: /en|pl/ }, () => {
        this.resources("descriptions");
      });
    });

    expect(t.descriptionsPath("en")).toBe("/en/descriptions");
    expect(t.descriptionsPath(null)).toBe("/descriptions");
    expect(t.descriptionPath("en", 1)).toBe("/en/descriptions/1");
    expect(t.descriptionPath(null, 1)).toBe("/descriptions/1");

    await t.get("/en/descriptions");
    expect(t.response.body).toBe("descriptions#index");

    await t.get("/descriptions");
    expect(t.response.body).toBe("descriptions#index");

    await t.get("/en/descriptions/1");
    expect(t.response.body).toBe("descriptions#show");

    await t.get("/descriptions/1");
    expect(t.response.body).toBe("descriptions#show");
  });

  it("nested optional scoped path", async () => {
    draw(function () {
      this.namespace("admin", () => {
        this.scope("(:locale)", { locale: /en|pl/ }, () => {
          this.resources("descriptions");
        });
      });
    });

    expect(t.adminDescriptionsPath("en")).toBe("/admin/en/descriptions");
    expect(t.adminDescriptionsPath(null)).toBe("/admin/descriptions");
    expect(t.adminDescriptionPath("en", 1)).toBe("/admin/en/descriptions/1");
    expect(t.adminDescriptionPath(null, 1)).toBe("/admin/descriptions/1");

    await t.get("/admin/en/descriptions");
    expect(t.response.body).toBe("admin/descriptions#index");

    await t.get("/admin/descriptions");
    expect(t.response.body).toBe("admin/descriptions#index");

    await t.get("/admin/en/descriptions/1");
    expect(t.response.body).toBe("admin/descriptions#show");

    await t.get("/admin/descriptions/1");
    expect(t.response.body).toBe("admin/descriptions#show");
  });

  it("nested optional path shorthand", async () => {
    draw(function () {
      this.scope("(:locale)", { locale: /en|pl/ }, () => {
        this.get("registrations/new");
      });
    });

    await t.get("/registrations/new");
    expect(t.request.params["locale"]).toBeUndefined();

    await t.get("/en/registrations/new");
    expect(t.request.params["locale"]).toBe("en");
  });

  it("keyed default string params with match", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.match("/", { to: "pages#show", via: ":get", defaults: { id: "home" } });
    });
    const m = routes.recognizePath("/");
    expect(m.id).toBe("home");
  });

  it("default string params with match", async () => {
    draw(function () {
      this.match("/", { to: "pages#show", via: "get", id: "home" });
    });

    await t.get("/");
    expect(t.request.params["id"]).toBe("home");
  });

  it("keyed default string params with root", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.match("/", { to: "pages#show", via: ":get", as: "root", defaults: { id: "home" } });
    });
    const m = routes.recognizePath("/");
    expect(m.id).toBe("home");
  });

  it("default string params with root", async () => {
    draw(function () {
      this.root({ to: "pages#show", id: "home" });
    });

    await t.get("/");
    expect(t.request.params["id"]).toBe("home");
  });

  it("custom param", async () => {
    draw(function () {
      this.resources("profiles", { param: "username" }, () => {
        this.get("details", { on: "member" });
        this.resources("messages");
      });
    });

    await t.get("/profiles/bob");
    expect(t.response.body).toBe("profiles#show");
    expect(t.request.params["username"]).toBe("bob");

    await t.get("/profiles/bob/details");
    expect(t.request.params["username"]).toBe("bob");

    await t.get("/profiles/bob/messages/34");
    expect(t.request.params["profile_username"]).toBe("bob");
    expect(t.request.params["id"]).toBe("34");
  });

  it("custom param constraint", async () => {
    draw(function () {
      this.resources("profiles", { param: "username", username: /[a-z]+/ }, () => {
        this.get("details", { on: "member" });
        this.resources("messages");
      });
    });

    await t.get("/profiles/bob1");
    expect(t.response.status).toBe(404);

    await t.get("/profiles/bob1/details");
    expect(t.response.status).toBe(404);

    await t.get("/profiles/bob1/messages/34");
    expect(t.response.status).toBe(404);
  });

  it("colon containing custom param", async () => {
    const ex = await assertRaises([ArgumentError], {}, () => {
      draw(function () {
        this.resources("profiles", { param: "username/:is_admin" });
      });
    });

    expect(ex.message).toMatch(/:param option can't contain colon/);
  });

  it("invalid route name raises error", () => {
    const routes = new RouteSet();
    expect(() =>
      routes.draw(function () {
        this.get("/products", { to: "products#index", as: "products " });
      }),
    ).toThrow(/Invalid route name/);
    expect(() =>
      routes.draw(function () {
        this.get("/products", { to: "products#index", as: "products!" });
      }),
    ).toThrow(/Invalid route name/);
    expect(() =>
      routes.draw(function () {
        this.get("/products", { to: "products#index", as: "products index" });
      }),
    ).toThrow(/Invalid route name/);
    expect(() =>
      routes.draw(function () {
        this.get("/products", { to: "products#index", as: "1products" });
      }),
    ).toThrow(/Invalid route name/);
  });

  it("duplicate route name raises error", async () => {
    await assertRaises([ArgumentError], {}, () => {
      draw(function () {
        this.get("/collision", { to: "collision#show", as: "collision" });
        this.get("/duplicate", { to: "duplicate#show", as: "collision" });
      });
    });
  });

  it("duplicate route name via resources raises error", async () => {
    await assertRaises([ArgumentError], {}, () => {
      draw(function () {
        this.resources("collisions");
        this.get("/collision", { to: "collision#show", as: "collision" });
      });
    });
  });
  it("controller name with leading slash raise error", async () => {
    await assertRaises([ArgumentError], {}, () => {
      draw(function () {
        this.get("/feeds/:service", { to: "/feeds#show" });
      });
    });

    await assertRaises([ArgumentError], {}, () => {
      draw(function () {
        this.get("/feeds/:service", { controller: "/feeds", action: "show" });
      });
    });

    await assertRaises([ArgumentError], {}, () => {
      draw(function () {
        this.get("/api/feeds/:service", { to: "/api/feeds#show" });
      });
    });

    await assertRaises([ArgumentError], {}, () => {
      draw(function () {
        this.resources("feeds", { controller: "/feeds" });
      });
    });
  });
  it("match with empty via", () => {
    const routes = new RouteSet();
    expect(() =>
      routes.draw(function () {
        this.match("/foo/bar", { to: "files#show", via: [] });
      }),
    ).toThrow(ArgumentError);
  });
  it("multiple roots raises error", async () => {
    const ex = await assertRaises([ArgumentError], {}, () => {
      draw(function () {
        this.root("pages#index", { constraints: { host: "www.example.com" } });
        this.root("admin/pages#index", { constraints: { host: "admin.example.com" } });
      });
    });
    expect(ex.message).toMatch(/Invalid route name, already in use: 'root'/);
  });
  it("multiple namespaced roots", () => {
    draw(function () {
      this.namespace("foo", () => {
        this.root("test#index");
      });

      this.root("test#index");

      this.namespace("bar", () => {
        this.root("test#index");
      });
    });

    expect(t.fooRootPath()).toBe("/foo");
    expect(t.rootPath()).toBe("/");
    expect(t.barRootPath()).toBe("/bar");
  });

  it.skip("resource new actions", () => {});

  it("shallow false inside nested shallow resource", async () => {
    draw(function () {
      this.resources("blogs", { shallow: true }, () => {
        this.resources("posts", () => {
          this.resources("comments", { shallow: false });
          this.resources("tags");
        });
      });
    });

    await t.get("/posts/1/comments");
    expect(t.response.body).toBe("comments#index");
    expect(t.postCommentsPath("1")).toBe("/posts/1/comments");

    await t.get("/posts/1/comments/new");
    expect(t.response.body).toBe("comments#new");
    expect(t.newPostCommentPath("1")).toBe("/posts/1/comments/new");

    await t.get("/posts/1/comments/2");
    expect(t.response.body).toBe("comments#show");
    expect(t.postCommentPath("1", "2")).toBe("/posts/1/comments/2");

    await t.get("/posts/1/comments/2/edit");
    expect(t.response.body).toBe("comments#edit");
    expect(t.editPostCommentPath("1", "2")).toBe("/posts/1/comments/2/edit");

    await t.get("/tags/3");
    expect(t.response.body).toBe("tags#show");
    expect(t.tagPath("3")).toBe("/tags/3");
  });

  it("shallow deeply nested resources", async () => {
    draw(function () {
      this.resources("blogs", () => {
        this.resources("posts", () => {
          this.resources("comments", { shallow: true });
        });
      });
    });

    await t.get("/comments/1");
    expect(t.response.body).toBe("comments#show");

    expect(t.commentPath("1")).toBe("/comments/1");
    expect(t.newBlogPath()).toBe("/blogs/new");
    expect(t.newBlogPostPath({ blog_id: 1 })).toBe("/blogs/1/posts/new");
    expect(t.newBlogPostCommentPath({ blog_id: 1, post_id: 2 })).toBe(
      "/blogs/1/posts/2/comments/new",
    );
  });

  it("direct children of shallow resources", async () => {
    draw(function () {
      this.resources("blogs", () => {
        this.resources("posts", { shallow: true }, () => {
          this.resources("comments");
        });
      });
    });

    await t.post("/posts/1/comments");
    expect(t.response.body).toBe("comments#create");
    expect(t.postCommentsPath("1")).toBe("/posts/1/comments");

    await t.get("/posts/2/comments/new");
    expect(t.response.body).toBe("comments#new");
    expect(t.newPostCommentPath("2")).toBe("/posts/2/comments/new");

    await t.get("/posts/1/comments");
    expect(t.response.body).toBe("comments#index");
    expect(t.postCommentsPath("1")).toBe("/posts/1/comments");
  });

  it("shallow nested resources within scope", async () => {
    draw(function () {
      this.scope("/hello", () => {
        this.shallow(() => {
          this.resources("notes", () => {
            this.resources("trackbacks");
          });
        });
      });
    });

    await t.get("/hello/notes/1/trackbacks");
    expect(t.response.body).toBe("trackbacks#index");
    expect(t.noteTrackbacksPath({ note_id: 1 })).toBe("/hello/notes/1/trackbacks");

    await t.get("/hello/notes/1/edit");
    expect(t.response.body).toBe("notes#edit");
    expect(t.editNotePath({ id: "1" })).toBe("/hello/notes/1/edit");

    await t.get("/hello/notes/1/trackbacks/new");
    expect(t.response.body).toBe("trackbacks#new");
    expect(t.newNoteTrackbackPath({ note_id: 1 })).toBe("/hello/notes/1/trackbacks/new");

    await t.get("/hello/trackbacks/1");
    expect(t.response.body).toBe("trackbacks#show");
    expect(t.trackbackPath({ id: "1" })).toBe("/hello/trackbacks/1");

    await t.get("/hello/trackbacks/1/edit");
    expect(t.response.body).toBe("trackbacks#edit");
    expect(t.editTrackbackPath({ id: "1" })).toBe("/hello/trackbacks/1/edit");

    await t.put("/hello/trackbacks/1");
    expect(t.response.body).toBe("trackbacks#update");

    await t.post("/hello/notes/1/trackbacks");
    expect(t.response.body).toBe("trackbacks#create");

    await t.delete("/hello/trackbacks/1");
    expect(t.response.body).toBe("trackbacks#destroy");

    await t.get("/hello/notes");
    expect(t.response.body).toBe("notes#index");

    await t.post("/hello/notes");
    expect(t.response.body).toBe("notes#create");

    await t.get("/hello/notes/new");
    expect(t.response.body).toBe("notes#new");
    expect(t.newNotePath()).toBe("/hello/notes/new");

    await t.get("/hello/notes/1");
    expect(t.response.body).toBe("notes#show");
    expect(t.notePath({ id: 1 })).toBe("/hello/notes/1");

    await t.put("/hello/notes/1");
    expect(t.response.body).toBe("notes#update");

    await t.delete("/hello/notes/1");
    expect(t.response.body).toBe("notes#destroy");
  });

  it("shallow option nested resources within scope", async () => {
    draw(function () {
      this.scope("/hello", () => {
        this.resources("notes", { shallow: true }, () => {
          this.resources("trackbacks");
        });
      });
    });

    await t.get("/hello/notes/1/trackbacks");
    expect(t.response.body).toBe("trackbacks#index");
    expect(t.noteTrackbacksPath({ note_id: 1 })).toBe("/hello/notes/1/trackbacks");

    await t.get("/hello/notes/1/edit");
    expect(t.response.body).toBe("notes#edit");
    expect(t.editNotePath({ id: "1" })).toBe("/hello/notes/1/edit");

    await t.get("/hello/notes/1/trackbacks/new");
    expect(t.response.body).toBe("trackbacks#new");
    expect(t.newNoteTrackbackPath({ note_id: 1 })).toBe("/hello/notes/1/trackbacks/new");

    await t.get("/hello/trackbacks/1");
    expect(t.response.body).toBe("trackbacks#show");
    expect(t.trackbackPath({ id: "1" })).toBe("/hello/trackbacks/1");

    await t.get("/hello/trackbacks/1/edit");
    expect(t.response.body).toBe("trackbacks#edit");
    expect(t.editTrackbackPath({ id: "1" })).toBe("/hello/trackbacks/1/edit");

    await t.put("/hello/trackbacks/1");
    expect(t.response.body).toBe("trackbacks#update");

    await t.post("/hello/notes/1/trackbacks");
    expect(t.response.body).toBe("trackbacks#create");

    await t.delete("/hello/trackbacks/1");
    expect(t.response.body).toBe("trackbacks#destroy");

    await t.get("/hello/notes");
    expect(t.response.body).toBe("notes#index");

    await t.post("/hello/notes");
    expect(t.response.body).toBe("notes#create");

    await t.get("/hello/notes/new");
    expect(t.response.body).toBe("notes#new");
    expect(t.newNotePath()).toBe("/hello/notes/new");

    await t.get("/hello/notes/1");
    expect(t.response.body).toBe("notes#show");
    expect(t.notePath({ id: 1 })).toBe("/hello/notes/1");

    await t.put("/hello/notes/1");
    expect(t.response.body).toBe("notes#update");

    await t.delete("/hello/notes/1");
    expect(t.response.body).toBe("notes#destroy");
  });

  it("shallow nested routes ignore module", async () => {
    draw(function () {
      this.scope({ module: "api" }, () => {
        this.resources("errors", { shallow: true }, () => {
          this.resources("notices");
        });
      });
    });

    await t.get("/errors/1/notices");
    expect(t.response.body).toBe("api/notices#index");
    expect(t.errorNoticesPath({ error_id: "1" })).toBe("/errors/1/notices");

    await t.get("/notices/1");
    expect(t.response.body).toBe("api/notices#show");
    expect(t.noticePath({ id: "1" })).toBe("/notices/1");
  });

  it("shallow custom param", async () => {
    draw(function () {
      this.resources("orders", () => {
        this.constraints({ download: /[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/ }, () => {
          this.resources("downloads", { param: "download", shallow: true });
        });
      });
    });

    await t.get("/downloads/0c0c0b68-d24b-11e1-a861-001ff3fffe6f.zip");
    expect(t.response.body).toBe("downloads#show");
    expect(t.request.params["download"]).toBe("0c0c0b68-d24b-11e1-a861-001ff3fffe6f");
  });
  it("shallow path inside namespace is not added twice", async () => {
    draw(function () {
      this.namespace("admin", () => {
        this.shallow(() => {
          this.resources("posts", () => {
            this.resources("comments");
          });
        });
      });
    });

    await t.get("/admin/posts/1/comments");
    expect(t.response.body).toBe("admin/comments#index");
    expect(t.adminPostCommentsPath("1")).toBe("/admin/posts/1/comments");
  });
  it("shallow path and prefix are not added to non shallow routes", async () => {
    draw(function () {
      this.scope({ shallowPath: "projects", shallowPrefix: "project" }, () => {
        this.resources("projects", () => {
          this.resources("files", { controller: "project_files", shallow: true });
        });
      });
    });

    await t.get("/projects");
    expect(t.response.body).toBe("projects#index");
    expect(t.projectsPath()).toBe("/projects");

    await t.get("/projects/new");
    expect(t.response.body).toBe("projects#new");
    expect(t.newProjectPath()).toBe("/projects/new");

    await t.post("/projects");
    expect(t.response.body).toBe("projects#create");

    await t.get("/projects/1");
    expect(t.response.body).toBe("projects#show");
    expect(t.projectPath("1")).toBe("/projects/1");

    await t.get("/projects/1/edit");
    expect(t.response.body).toBe("projects#edit");
    expect(t.editProjectPath("1")).toBe("/projects/1/edit");

    await t.patch("/projects/1");
    expect(t.response.body).toBe("projects#update");

    await t.delete("/projects/1");
    expect(t.response.body).toBe("projects#destroy");

    await t.get("/projects/1/files");
    expect(t.response.body).toBe("project_files#index");
    expect(t.projectFilesPath("1")).toBe("/projects/1/files");

    await t.get("/projects/1/files/new");
    expect(t.response.body).toBe("project_files#new");
    expect(t.newProjectFilePath("1")).toBe("/projects/1/files/new");

    await t.post("/projects/1/files");
    expect(t.response.body).toBe("project_files#create");

    await t.get("/projects/files/2");
    expect(t.response.body).toBe("project_files#show");
    expect(t.projectFilePath("2")).toBe("/projects/files/2");

    await t.get("/projects/files/2/edit");
    expect(t.response.body).toBe("project_files#edit");
    expect(t.editProjectFilePath("2")).toBe("/projects/files/2/edit");

    await t.patch("/projects/files/2");
    expect(t.response.body).toBe("project_files#update");

    await t.delete("/projects/files/2");
    expect(t.response.body).toBe("project_files#destroy");
  });
  it("scope path is copied to shallow path", () => {
    draw(function () {
      this.scope({ path: "foo" }, () => {
        this.resources("posts", () => {
          this.resources("comments", { shallow: true });
        });
      });
    });

    expect(t.commentPath("1")).toBe("/foo/comments/1");
  });
  it("scope as is copied to shallow prefix", () => {
    draw(function () {
      this.scope({ as: "foo" }, () => {
        this.resources("posts", () => {
          this.resources("comments", { shallow: true });
        });
      });
    });

    expect(t.fooCommentPath("1")).toBe("/comments/1");
  });
  it("scope shallow prefix is not overwritten by as", () => {
    draw(function () {
      this.scope({ as: "foo", shallowPrefix: "bar" }, () => {
        this.resources("posts", () => {
          this.resources("comments", { shallow: true });
        });
      });
    });

    expect(t.barCommentPath("1")).toBe("/comments/1");
  });
  it("scope shallow path is not overwritten by path", () => {
    draw(function () {
      this.scope({ path: "foo", shallowPath: "bar" }, () => {
        this.resources("posts", () => {
          this.resources("comments", { shallow: true });
        });
      });
    });

    expect(t.commentPath("1")).toBe("/bar/comments/1");
  });

  it("url generator for optional prefix static and dynamic segment", async () => {
    draw(function () {
      this.get("(/user/:username)/photos", { to: "photos#index" });
    });

    await t.get("/user/bob/photos");
    expect(t.response.body).toBe("photos#index");
    expect(t.urlFor({ controller: "photos", action: "index", username: "bob" })).toBe(
      "http://www.example.com/user/bob/photos",
    );

    await t.get("/photos");
    expect(t.response.body).toBe("photos#index");
    expect(t.urlFor({ controller: "photos", action: "index", username: null })).toBe(
      "http://www.example.com/photos",
    );
  });

  it("url recognition for optional static segments", async () => {
    draw(function () {
      this.scope("(groups)", () => {
        this.scope("(discussions)", () => {
          this.resources("messages");
        });
      });
    });

    await t.get("/groups/discussions/messages");
    expect(t.response.body).toBe("messages#index");

    await t.get("/groups/discussions/messages/1");
    expect(t.response.body).toBe("messages#show");

    await t.get("/groups/messages");
    expect(t.response.body).toBe("messages#index");

    await t.get("/groups/messages/1");
    expect(t.response.body).toBe("messages#show");

    await t.get("/discussions/messages");
    expect(t.response.body).toBe("messages#index");

    await t.get("/discussions/messages/1");
    expect(t.response.body).toBe("messages#show");

    await t.get("/messages");
    expect(t.response.body).toBe("messages#index");

    await t.get("/messages/1");
    expect(t.response.body).toBe("messages#show");
  });

  it("except option should override scoped only", async () => {
    draw(function () {
      this.scope({ only: "show" }, () => {
        this.namespace("only", () => {
          this.resources("sectors", { only: "index" }, () => {
            this.resources("managers", { except: ["show", "update", "destroy"] });
          });
        });
      });
    });

    await t.get("/only/sectors/1/managers");
    expect(t.response.body).toBe("only/managers#index");
    expect(t.onlySectorManagersPath({ sector_id: "1" })).toBe("/only/sectors/1/managers");

    await t.get("/only/sectors/1/managers/2");
    expect(t.response.body).toBe("Not Found");
    await assertRaises([TypeError], {}, () => {
      t.onlySectorManagerPath({ sector_id: "1", id: "2" });
    });
  });

  it("only option should override scoped except", async () => {
    draw(function () {
      this.scope({ except: "index" }, () => {
        this.namespace("except", () => {
          this.resources("sectors", { except: ["show", "update", "destroy"] }, () => {
            this.resources("managers", { only: "index" });
          });
        });
      });
    });

    await t.get("/except/sectors/1/managers");
    expect(t.response.body).toBe("except/managers#index");
    expect(t.exceptSectorManagersPath({ sector_id: "1" })).toBe("/except/sectors/1/managers");

    await t.get("/except/sectors/1/managers/2");
    expect(t.response.body).toBe("Not Found");
    await assertRaises([TypeError], {}, () => {
      t.exceptSectorManagerPath({ sector_id: "1", id: "2" });
    });
  });

  it("only scope should override parent scope", async () => {
    draw(function () {
      this.scope({ only: "show" }, () => {
        this.namespace("only", () => {
          this.resources("sectors", { only: "index" }, () => {
            this.resources("companies", () => {
              this.scope({ only: "index" }, () => {
                this.resources("divisions");
              });
            });
          });
        });
      });
    });

    await t.get("/only/sectors/1/companies/2/divisions");
    expect(t.response.body).toBe("only/divisions#index");
    expect(t.onlySectorCompanyDivisionsPath({ sector_id: "1", company_id: "2" })).toBe(
      "/only/sectors/1/companies/2/divisions",
    );

    await t.get("/only/sectors/1/companies/2/divisions/3");
    expect(t.response.body).toBe("Not Found");
    await assertRaises([TypeError], {}, () => {
      t.onlySectorCompanyDivisionPath({ sector_id: "1", company_id: "2", id: "3" });
    });
  });

  it("except scope should override parent scope", async () => {
    draw(function () {
      this.scope({ except: "index" }, () => {
        this.namespace("except", () => {
          this.resources("sectors", { except: ["show", "update", "destroy"] }, () => {
            this.resources("companies", () => {
              this.scope({ except: ["show", "update", "destroy"] }, () => {
                this.resources("divisions");
              });
            });
          });
        });
      });
    });

    await t.get("/except/sectors/1/companies/2/divisions");
    expect(t.response.body).toBe("except/divisions#index");
    expect(t.exceptSectorCompanyDivisionsPath({ sector_id: "1", company_id: "2" })).toBe(
      "/except/sectors/1/companies/2/divisions",
    );

    await t.get("/except/sectors/1/companies/2/divisions/3");
    expect(t.response.body).toBe("Not Found");
    await assertRaises([TypeError], {}, () => {
      t.exceptSectorCompanyDivisionPath({ sector_id: "1", company_id: "2", id: "3" });
    });
  });

  it("except scope should override parent only scope", async () => {
    draw(function () {
      this.scope({ only: "show" }, () => {
        this.namespace("only", () => {
          this.resources("sectors", { only: "index" }, () => {
            this.resources("companies", () => {
              this.scope({ except: ["show", "update", "destroy"] }, () => {
                this.resources("departments");
              });
            });
          });
        });
      });
    });

    await t.get("/only/sectors/1/companies/2/departments");
    expect(t.response.body).toBe("only/departments#index");
    expect(t.onlySectorCompanyDepartmentsPath({ sector_id: "1", company_id: "2" })).toBe(
      "/only/sectors/1/companies/2/departments",
    );

    await t.get("/only/sectors/1/companies/2/departments/3");
    expect(t.response.body).toBe("Not Found");
    await assertRaises([TypeError], {}, () => {
      t.onlySectorCompanyDepartmentPath({ sector_id: "1", company_id: "2", id: "3" });
    });
  });

  it("only scope should override parent except scope", async () => {
    draw(function () {
      this.scope({ except: "index" }, () => {
        this.namespace("except", () => {
          this.resources("sectors", { except: ["show", "update", "destroy"] }, () => {
            this.resources("companies", () => {
              this.scope({ only: "index" }, () => {
                this.resources("departments");
              });
            });
          });
        });
      });
    });

    await t.get("/except/sectors/1/companies/2/departments");
    expect(t.response.body).toBe("except/departments#index");
    expect(t.exceptSectorCompanyDepartmentsPath({ sector_id: "1", company_id: "2" })).toBe(
      "/except/sectors/1/companies/2/departments",
    );

    await t.get("/except/sectors/1/companies/2/departments/3");
    expect(t.response.body).toBe("Not Found");
    await assertRaises([TypeError], {}, () => {
      t.exceptSectorCompanyDepartmentPath({ sector_id: "1", company_id: "2", id: "3" });
    });
  });

  it.skip("resource constraints are pushed to scope", () => {});

  it("custom resource actions defined using string", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("customers", () => {
        this.resources("invoices", () => {
          this.get("aged/:months", { on: "collection", action: "aged", as: "aged" });
        });

        this.get("inactive", { on: "collection" });
        this.post("deactivate", { on: "member" });
        this.get("old", { on: "collection", as: "stale" });
      });
    });

    let params = routes.recognizePath("/customers/inactive");
    expect(`${params.controller}#${params.action}`).toBe("customers#inactive");
    expect(routes.pathFor({}, "inactive_customers")).toBe("/customers/inactive");

    params = routes.recognizePath("/customers/1/deactivate", { method: "post" });
    expect(`${params.controller}#${params.action}`).toBe("customers#deactivate");
    expect(routes.pathFor({ id: "1" }, "deactivate_customer")).toBe("/customers/1/deactivate");

    params = routes.recognizePath("/customers/old");
    expect(`${params.controller}#${params.action}`).toBe("customers#old");
    expect(routes.pathFor({}, "stale_customers")).toBe("/customers/old");

    params = routes.recognizePath("/customers/1/invoices/aged/3");
    expect(`${params.controller}#${params.action}`).toBe("invoices#aged");
    expect(routes.pathFor({ customer_id: "1", months: "3" }, "aged_customer_invoices")).toBe(
      "/customers/1/invoices/aged/3",
    );
  });
  it("named route check", () => {
    let before: boolean | undefined;
    let after: boolean | undefined;

    draw(function () {
      before = this.hasNamedRoute("hello");
      this.get("/hello", { as: "hello", to: "hello#world" });
      after = this.hasNamedRoute("hello");
    });

    expect(before).toBeFalsy();
    expect(after).toBeTruthy();
  });
  it("explicitly avoiding the named route", () => {
    draw(function () {
      this.scope({ as: "routes" }, () => {
        this.get("/c/:id", { as: "collision", to: "collision#show" });
        this.get("/collision", { to: "collision#show" });
        this.get("/no_collision", { to: "collision#show", as: null });
      });
    });

    expect(rbObjRespondTo(t, "routesNoCollisionPath")).toBeFalsy();
  });
  it("nested route in nested resource", async () => {
    draw(function () {
      this.resources("posts", { only: ["index", "show"] }, () => {
        this.resources("comments", { except: "destroy" }, () => {
          this.get({ views: "comments#views", as: "views" });
        });
      });
    });

    await t.get("/posts/1/comments/2/views");
    expect(t.response.body).toBe("comments#views");
    expect(t.postCommentViewsPath({ post_id: "1", comment_id: "2" })).toBe(
      "/posts/1/comments/2/views",
    );
  });
  it("root in deeply nested scope", async () => {
    draw(function () {
      this.resources("posts", { only: ["index", "show"] }, () => {
        this.namespace("admin", () => {
          this.root({ to: "index#index" });
        });
      });
    });

    await t.get("/posts/1/admin");
    expect(t.response.body).toBe("admin/index#index");
    expect(t.postAdminRootPath({ post_id: "1" })).toBe("/posts/1/admin");
  });
  it("multiple positional args with the same name", async () => {
    draw(function () {
      this.get({ "/downloads/:id/:id.tar": "downloads#show", as: "download", format: false });
    });

    const expectedParams = {
      controller: "downloads",
      action: "show",
      id: "1",
    };

    await t.get("/downloads/1/1.tar");
    expect(t.response.body).toBe("downloads#show");
    expect(t.request.pathParameters).toEqual(expectedParams);
    expect(t.downloadPath("1")).toBe("/downloads/1/1.tar");
    expect(t.downloadPath("1", "1")).toBe("/downloads/1/1.tar");
  });
  it("resource where as is empty", () => {
    draw(function () {
      this.resource("post", { as: "" });

      this.scope("post", { as: "post" }, () => {
        this.resource("comment", { as: "" });
      });
    });

    expect(t.newPath()).toBe("/post/new");
    expect(t.newPostPath()).toBe("/post/comment/new");
  });
  it("resources where as is empty", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("posts", { as: "" });

      this.scope("posts", { as: "posts" }, () => {
        this.resources("comments", { as: "" });
      });
    });

    expect(routes.pathFor({}, "new")).toBe("/posts/new");
    expect(routes.pathFor({}, "new_posts")).toBe("/posts/comments/new");
  });
  it("scope where as is empty", () => {
    draw(function () {
      this.scope("post", { as: "" }, () => {
        this.resource("user");
        this.resources("comments");
      });
    });

    expect(t.newUserPath()).toBe("/post/user/new");
    expect(t.newCommentPath()).toBe("/post/comments/new");
  });
  it("multiple named roots", async () => {
    draw(function () {
      this.namespace("foo", () => {
        this.root("pages#index", { constraints: { host: "www.example.com" } });
        this.root("admin/pages#index", {
          constraints: { host: "admin.example.com" },
          as: "admin_root",
        });
      });

      this.root("pages#index", { constraints: { host: "www.example.com" } });
      this.root("admin/pages#index", {
        constraints: { host: "admin.example.com" },
        as: "admin_root",
      });
    });

    await t.get("http://www.example.com/foo");
    expect(t.response.body).toBe("foo/pages#index");

    await t.get("http://admin.example.com/foo");
    expect(t.response.body).toBe("foo/admin/pages#index");

    await t.get("http://www.example.com/");
    expect(t.response.body).toBe("pages#index");

    await t.get("http://admin.example.com/");
    expect(t.response.body).toBe("admin/pages#index");
  });
  it("nested routes under format resource", async () => {
    draw(function () {
      this.resources("formats", () => {
        this.resources("items");
      });
    });

    await t.get("/formats/1/items.json");
    expect(t.response.status).toBe(200);
    expect(t.response.body).toBe("items#index");
    expect(t.formatItemsPath(1, "json")).toBe("/formats/1/items.json");

    await t.get("/formats/1/items/2.json");
    expect(t.response.status).toBe(200);
    expect(t.response.body).toBe("items#show");
    expect(t.formatItemPath(1, 2, "json")).toBe("/formats/1/items/2.json");
  });
  it("passing action parameters to url helpers raises error if parameters are not permitted", async () => {
    draw(function () {
      this.root({ to: "projects#index" });
    });
    const params = new Parameters({ id: "1" });

    await assertRaises([UnfilteredParameters], {}, () => {
      t.rootPath(params);
    });
  });
  it("passing action parameters to url helpers is allowed if parameters are permitted", () => {
    draw(function () {
      this.root({ to: "projects#index" });
    });
    const params = new Parameters({ id: "1" });
    params.permitBang();

    expect(t.rootPath(params)).toBe("/?id=1");
  });

  it("redirect https", async () => {
    draw(function () {
      this.get("secure", { to: this.redirect("/secure/login") });
    });

    await withHttps(async () => {
      await t.get("/secure");
      verifyRedirect("https://www.example.com/secure/login");
    });
  });

  it("redirect argument error", async () => {
    const routes = new (class {
      redirect = Redirection.redirect;
    })();
    await assertRaises([ArgumentError], {}, () => {
      routes.redirect(new Object() as never);
    });
  });

  it("greedy resource id regexp doesnt match edit and custom action", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("sections", { id: /.+/ }, () => {
        this.get(":preview", { on: "member" });
      });
    });

    let params = routes.recognizePath("/sections/1/edit");
    expect(`${params.controller}#${params.action}`).toBe("sections#edit");
    expect(routes.pathFor({ id: "1" }, "edit_section")).toBe("/sections/1/edit");

    params = routes.recognizePath("/sections/1/preview");
    expect(`${params.controller}#${params.action}`).toBe("sections#preview");
    expect(routes.pathFor({ id: "1" }, "preview_section")).toBe("/sections/1/preview");
  });
  it("path parameters is not stale", async () => {
    draw(function () {
      this.scope(
        "/countries/:country",
        {
          constraints: (params: Record<string, string>, _req: Request) =>
            ["all", "France"].includes(params.country),
        },
        () => {
          this.get("/", { to: "countries#index" });
          this.get("/cities", { to: "countries#cities" });
        },
      );

      this.get("/countries/:country/(*other)", {
        to: this.redirect((params, _req) =>
          params.other != null ? `/countries/all/${params.other}` : "/countries/all",
        ),
      });
    });

    await t.get("/countries/France");
    expect(t.response.body).toBe("countries#index");

    await t.get("/countries/France/cities");
    expect(t.response.body).toBe("countries#cities");

    await t.get("/countries/UK");
    verifyRedirect("http://www.example.com/countries/all");

    await t.get("/countries/UK/cities");
    verifyRedirect("http://www.example.com/countries/all/cities");
  });

  it("action from path is frozen", async () => {
    draw(function () {
      this.get({ search: "search" });
    });

    await t.get("/search");
    expect(Object.isFrozen(t.request.params["action"])).toBeTruthy();
  });
  it("absolute controller namespace", async () => {
    draw(function () {
      this.namespace("foo", () => {
        this.get("/", { to: "/bar#index", as: "root" });
      });
    });

    await t.get("/foo");
    expect(t.response.body).toBe("bar#index");
    expect(t.fooRootPath()).toBe("/foo");
  });
  it("namespace as controller", async () => {
    draw(function () {
      this.namespace("foo", () => {
        this.get("/", { to: "/bar#index", as: "root" });
      });
    });

    await t.get("/foo");
    expect(t.response.body).toBe("bar#index");
    expect(t.fooRootPath()).toBe("/foo");
  });
  it("route with dashes in path", async () => {
    draw(function () {
      this.get("/contact-us", { to: "pages#contact_us" });
    });

    await t.get("/contact-us");
    expect(t.response.body).toBe("pages#contact_us");
    expect(t.contactUsPath()).toBe("/contact-us");
  });
  it("shorthand route with dashes in path", async () => {
    draw(function () {
      this.get("/about-us/index");
    });

    await t.get("/about-us/index");
    expect(t.response.body).toBe("about_us#index");
    expect(t.aboutUsIndexPath()).toBe("/about-us/index");
  });
  it("resource routes with dashes in path", async () => {
    draw(function () {
      this.resources("photos", { only: ["show"] }, () => {
        this.get("user-favorites", { on: "collection" });
        this.get("preview-photo", { on: "member" });
        this.get("summary-text");
      });
    });

    await t.get("/photos/user-favorites");
    expect(t.response.body).toBe("photos#user_favorites");
    expect(t.userFavoritesPhotosPath()).toBe("/photos/user-favorites");

    await t.get("/photos/1/preview-photo");
    expect(t.response.body).toBe("photos#preview_photo");
    expect(t.previewPhotoPhotoPath("1")).toBe("/photos/1/preview-photo");

    await t.get("/photos/1/summary-text");
    expect(t.response.body).toBe("photos#summary_text");
    expect(t.photoSummaryTextPath("1")).toBe("/photos/1/summary-text");

    await t.get("/photos/1");
    expect(t.response.body).toBe("photos#show");
    expect(t.photoPath("1")).toBe("/photos/1");
  });
  it("mix string to controller action", async () => {
    draw(function () {
      this.get("/projects", { controller: "project_files", action: "index", to: "comments#index" });
    });
    await t.get("/projects");
    expect(t.response.body).toBe("comments#index");
  });
  it("mix string to controller", async () => {
    draw(function () {
      this.get("/projects", { controller: "project_files", to: "comments#index" });
    });
    await t.get("/projects");
    expect(t.response.body).toBe("comments#index");
  });
  it("mix string to action", async () => {
    draw(function () {
      this.get("/projects", { action: "index", to: "comments#index" });
    });
    await t.get("/projects");
    expect(t.response.body).toBe("comments#index");
  });
  it("head fetch with mount on root", async () => {
    draw(function () {
      this.get({ "/home": "test#index" });
      this.mount((env: Record<string, unknown>) => [200, {}, [env["REQUEST_METHOD"]]], {
        at: "/",
      });
    });

    await t.head("/home");
    assertResponse("ok");
    expect(t.response.body).toBe("test#index");

    await t.head("/foobar");
    assertResponse("ok");
    expect(t.response.body).toBe("HEAD");
  });
  it("dynamic action segments are deprecated", async () => {
    await assertDeprecated(deprecator(), () => {
      new RouteSet().draw(function () {
        this.get("/pages/:action", { controller: "pages" });
      });
    });
  });
  it("routes with double colon", async () => {
    draw(function () {
      this.get("/sort::sort", { to: "sessions#sort" });
    });

    await t.get("/sort:asc");
    expect(t.request.params["sort"]).toBe("asc");
    expect(t.response.body).toBe("sessions#sort");
  });
});

describe("ActionController::Routing", () => {
  it("route generation allows passing non string values to generated helper", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/posts/:id", { to: "posts#show", as: "post" });
    });
    expect(routes.pathFor({ id: 42 }, "post")).toBe("/posts/42");
  });

  it("id with dash", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/journey/:id", { to: "journey#show" });
    });
    const m = routes.recognizePath("/journey/faithfully-omg");
    expect(m.id).toBe("faithfully-omg");
  });

  it("regexp precedence", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/posts/:id", { to: "posts#show", constraints: { id: /\d+/ } });
      this.get("/posts/:slug", { to: "posts#show_by_slug" });
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
    routes.draw(function () {
      this.get("/journey/:id", { to: "journey#show", constraints: { id: /\d+/ } });
    });
    expect(() => routes.recognizePath("/journey/123")).not.toThrow();
    expect(() => routes.recognizePath("/journey/abc")).toThrow(RoutingError);
  });

  it("pre dash", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/posts/:id", { to: "posts#show" });
    });
    const m = routes.recognizePath("/posts/omg-faithfully");
    expect(m.id).toBe("omg-faithfully");
  });

  it("pre dash with custom regexp", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/posts/:id", { to: "posts#show", constraints: { id: /\d+/ } });
    });
    expect(() => routes.recognizePath("/posts/123")).not.toThrow();
    expect(() => routes.recognizePath("/posts/omg-123")).toThrow(RoutingError);
  });

  it("empty string match", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/", { to: "home#index" });
    });
    expect(routes.recognizePath("/").action).toBe("index");
  });

  it("symbols with dashes", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/my-route/:id", { to: "my_controller#show" });
    });
    const m = routes.recognizePath("/my-route/123");
    expect(m.id).toBe("123");
  });

  it("id encoding", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/posts/:id", { to: "posts#show" });
    });
    const m = routes.recognizePath("/posts/hello%20world");
    expect(m.id).toBe("hello world");
  });
});

describe("TestAppendingRoutes", () => {
  it("goodbye should be available", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/goodbye", { to: "goodbye#index" });
    });
    routes.draw(function () {
      this.get("/hello", { to: "hello#index" });
    });
    expect(() => routes.recognizePath("/goodbye")).not.toThrow();
  });

  it("hello should not be overwritten", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/hello", { to: "hello#first" });
    });
    routes.draw(function () {
      this.get("/hello", { to: "hello#second" });
    });
    expect(routes.recognizePath("/hello").action).toBe("first");
  });

  it("missing routes are still missing", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/hello", { to: "hello#index" });
    });
    expect(() => routes.recognizePath("/random")).toThrow(RoutingError);
  });
});

describe("TestDefaultScope", () => {
  class PostsController extends EchoParamsController {
    static override async dispatch(
      action: string,
      req: Request,
    ): Promise<[number, Record<string, string>, ReturnType<typeof bodyFromString>]> {
      const body = `${req.pathParameters["controller"]}#${action}`;
      return [200, { "content-type": "text/plain" }, bodyFromString(body)];
    }
  }

  const DefaultScopeRoutes = new RouteSet();
  DefaultScopeRoutes.defaultScope = { module: "blog" };
  DefaultScopeRoutes.draw(function () {
    this.resources("posts");
  });

  beforeEach(() => {
    controllerConstants.set(
      "blog/posts",
      PostsController as unknown as DispatchableControllerClass,
    );
  });
  afterEach(() => {
    controllerConstants.delete("blog/posts");
  });

  it("default scope", async () => {
    const [, , body] = await DefaultScopeRoutes.call(MockRequest.envFor("/posts"));
    expect(await bodyToString(body)).toBe("blog/posts#index");
  });
});

describe("TestRecognizePath", () => {
  class PageConstraint {
    readonly key: string;
    readonly pattern: RegExp;

    constructor(key: string, pattern: RegExp) {
      this.key = key;
      this.pattern = pattern;
    }

    matches(request: Request): boolean {
      return this.pattern.test(String(request.pathParameters[this.key]));
    }
  }

  const Routes = IntegrationTest.stubControllers((routes) => {
    routes.draw(function () {
      this.get("/hash/:foo", { to: "pages#show", constraints: { foo: /foo/ } });
      this.get("/hash/:bar", { to: "pages#show", constraints: { bar: /bar/ } });

      this.get("/proc/:foo", {
        to: "pages#show",
        constraints: (r: Request) => /foo/.test(String(r.pathParameters.foo)),
      });
      this.get("/proc/:bar", {
        to: "pages#show",
        constraints: (r: Request) => /bar/.test(String(r.pathParameters.bar)),
      });

      this.get("/class/:foo", { to: "pages#show", constraints: new PageConstraint("foo", /foo/) });
      this.get("/class/:bar", { to: "pages#show", constraints: new PageConstraint("bar", /bar/) });
    });
    return routes;
  });

  it("hash constraints dont leak between routes", () => {
    const expectedParams = { controller: "pages", action: "show", bar: "bar" };
    const actualParams = recognizePath("/hash/bar");

    expect(actualParams).toEqual(expectedParams);
  });

  it("proc constraints dont leak between routes", () => {
    const expectedParams = { controller: "pages", action: "show", bar: "bar" };
    const actualParams = recognizePath("/proc/bar");

    expect(actualParams).toEqual(expectedParams);
  });

  it("class constraints dont leak between routes", () => {
    const expectedParams = { controller: "pages", action: "show", bar: "bar" };
    const actualParams = recognizePath("/class/bar");

    expect(actualParams).toEqual(expectedParams);
  });

  function recognizePath(path: string) {
    return Routes.recognizePath(path);
  }
});

describe("TestTildeAndMinusPaths", () => {
  it("recognizes tilde path", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/~user", { to: "users#show" });
    });
    expect(() => routes.recognizePath("/~user")).not.toThrow();
  });

  it("recognizes minus path", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/young-and-fine", { to: "pages#show" });
    });
    expect(() => routes.recognizePath("/young-and-fine")).not.toThrow();
  });
});

describe("TestUnicodePaths", () => {
  it("recognizes unicode path", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/ほげ", { to: "pages#show" });
    });
    expect(() => routes.recognizePath("/%E3%81%BB%E3%81%92")).not.toThrow();
  });
});

describe("TestUrlGenerationErrors", () => {
  it("URL helpers raise message with mixed parameters when generation fails", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/posts/:id/comments/:comment_id", { to: "comments#show", as: "post_comment" });
    });
    expect(() => routes.pathFor({ id: 1 }, "post_comment")).toThrow(/comment_id/);
  });

  it("correct for empty UrlGenerationError", () => {
    const routes = new RouteSet();
    expect(() => routes.pathFor({}, "nonexistent")).toThrow(/No route matches/);
  });

  it("URL helpers raise a 'missing keys' error for a nil param with optimized helpers", () => {
    const Routes = new RouteSet();
    Routes.draw(function () {
      this.get("/products/:id", { to: "products#show", as: "product" });
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

  it("URL helpers raise a 'constraint failure' error for a nil param with non-optimized helpers", async () => {
    const Routes = new RouteSet();
    Routes.draw(function () {
      this.get("/products/:id", { to: "products#show", as: "product" });
    });
    const message =
      'No route matches {:action=>"show", :controller=>"products", :id=>nil}, possible unmatched constraints: [:id]';

    const urlHelpers = Routes.urlHelpers() as unknown as Record<
      string,
      (...args: unknown[]) => string
    >;
    const error = await assertRaises([UrlGenerationError], {}, () =>
      urlHelpers.productPath({ id: null }),
    );
    expect(error.message).toMatch(message);
  });

  it("exceptions have suggestions for fix", async () => {
    const Routes = new RouteSet();
    Routes.draw(function () {
      this.get("/products/:id", { to: "products#show", as: "product" });
    });
    const urlHelpers = Routes.urlHelpers() as unknown as Record<
      string,
      (...args: unknown[]) => string
    >;
    const error = await assertRaises([UrlGenerationError], {}, () =>
      urlHelpers.productPath(null, { id: "url-tested" }),
    );
    expect((error as UrlGenerationError & { detailedMessage(): string }).detailedMessage()).toMatch(
      "Did you mean?",
    );
  });
});

describe("TestAltApp", () => {
  class AltRequest extends Request {
    constructor(env: Record<string, unknown>) {
      super(env);
      this.pathParameters = {};
      this.pathInfo = "/";
      this.scriptName = "";
    }

    override get requestMethod(): string {
      return "GET";
    }

    override get ip(): string {
      return "127.0.0.1";
    }

    get xHeader(): string {
      return (this.env["HTTP_X_HEADER"] as string | undefined) ?? "";
    }
  }

  class XHeader {
    call(_env: Record<string, unknown>) {
      return [200, { "Content-Type": "text/html" }, bodyFromString("XHeader")];
    }
  }

  class AltApp {
    call(_env: Record<string, unknown>) {
      return [200, { "Content-Type": "text/html" }, bodyFromString("Alternative App")];
    }
  }

  const AltRoutes = new (class extends RouteSet {
    override requestClass(): typeof AltRequest {
      return AltRequest;
    }
  })();
  AltRoutes.draw(function () {
    this.get("/", { to: new XHeader(), constraints: { xHeader: /HEADER/ } });
    this.get("/", { to: new AltApp() });
  });

  const APP = IntegrationTest.buildApp(AltRoutes);
  class TestAltApp extends IntegrationTest {
    override get app(): unknown {
      return APP;
    }
  }
  registerConstant("TestAltApp", TestAltApp);

  let t: TestAltApp;
  beforeEach(({ testCase }) => {
    t = testCase as TestAltApp;
  });

  it("alt request without header", async () => {
    await t.get("/");
    expect(t.response.body).toBe("Alternative App");
  });

  it("alt request with matched header", async () => {
    await t.get("/", { headers: { HTTP_X_HEADER: "HEADER" } });
    expect(t.response.body).toBe("XHeader");
  });

  it("alt request with unmatched header", async () => {
    await t.get("/", { headers: { HTTP_X_HEADER: "NON_MATCH" } });
    expect(t.response.body).toBe("Alternative App");
  });
});

describe("TestNamespaceWithControllerOption", () => {
  class StorageFilesController extends Base {
    async index(): Promise<void> {
      await this.render({ plain: "admin/storage_files#index" });
    }
  }

  class TestNamespaceWithControllerOption extends IntegrationTest {}
  registerConstant("TestNamespaceWithControllerOption", TestNamespaceWithControllerOption);

  let t: TestNamespaceWithControllerOption;
  beforeEach(({ testCase }) => {
    controllerConstants.set("admin/storage_files", StorageFilesController);
    t = testCase as TestNamespaceWithControllerOption;
  });
  afterEach(() => {
    controllerConstants.delete("admin/storage_files");
  });

  function draw(block: DrawCallback): void {
    const routes = new RouteSet();
    routes.draw(block);
    t.app = IntegrationTest.buildApp(routes);
    t.routes = routes;
  }
  const assertRouting = (path: string, options: Record<string, unknown>) =>
    t.assertRouting(path, options);

  it("missing controller", async () => {
    const ex = await assertRaises([ArgumentError], {}, () => {
      draw(function () {
        this.get("/foo/bar", { action: ":index" });
      });
    });
    expect(ex.message).toMatch(/Missing :controller/);
  });

  it("missing controller with to", async () => {
    const ex = await assertRaises([ArgumentError], {}, () => {
      draw(function () {
        this.get("/foo/bar", { to: "foo" });
      });
    });
    expect(ex.message).toMatch(/Missing :controller/);
  });

  it("implicit controller with to", async () => {
    draw(function () {
      this.controller("foo", () => {
        this.get("/foo/bar", { to: "bar" });
      });
    });
    await assertRouting("/foo/bar", { controller: "foo", action: "bar" });
  });

  it("to is a symbol", async () => {
    const ex = await assertRaises([ArgumentError], {}, () => {
      draw(function () {
        this.get("/foo/bar", { to: ":foo" });
      });
    });
    expect(ex.message).toMatch(/:to must respond to/);
  });

  it("missing action with to", async () => {
    const ex = await assertRaises([ArgumentError], {}, () => {
      draw(function () {
        this.get("/foo/bar", { to: "foo#" });
      });
    });
    expect(ex.message).toMatch(/Missing :action/);
  });

  it("valid controller options inside namespace", async () => {
    draw(function () {
      this.namespace("admin", () => {
        this.resources("storage_files", { controller: "storage_files" });
      });
    });

    await t.get("/admin/storage_files");
    expect(t.response.body).toBe("admin/storage_files#index");
  });

  it("resources with valid namespaced controller option", async () => {
    draw(function () {
      this.resources("storage_files", { controller: "admin/storage_files" });
    });

    await t.get("/storage_files");
    expect(t.response.body).toBe("admin/storage_files#index");
  });

  it("warn with ruby constant syntax controller option", async () => {
    const e = await assertRaises([ArgumentError], {}, () => {
      draw(function () {
        this.namespace("admin", () => {
          this.resources("storage_files", { controller: "StorageFiles" });
        });
      });
    });

    expect(e.message).toMatch("'admin/StorageFiles' is not a supported controller name");
  });

  it("warn with ruby constant syntax namespaced controller option", async () => {
    const e = await assertRaises([ArgumentError], {}, () => {
      draw(function () {
        this.resources("storage_files", { controller: "Admin::StorageFiles" });
      });
    });

    expect(e.message).toMatch("'Admin::StorageFiles' is not a supported controller name");
  });

  it("warn with ruby constant syntax no colons", async () => {
    const e = await assertRaises([ArgumentError], {}, () => {
      draw(function () {
        this.resources("storage_files", { controller: "Admin" });
      });
    });

    expect(e.message).toMatch("'Admin' is not a supported controller name");
  });
});

describe("TestGlobRoutingMapper", () => {
  const Routes = new RouteSet();
  Routes.draw(function () {
    const ok = (_env: Record<string, unknown>) => [
      200,
      { "Content-Type": "text/plain" },
      bodyFromString(""),
    ];

    this.get("/*id", { to: this.redirect("/not_cars"), constraints: { id: /dummy/ } });
    this.get("/cars", { to: ok });
  });

  const APP = IntegrationTest.buildApp(Routes);
  class TestGlobRoutingMapper extends IntegrationTest {
    override get app(): unknown {
      return APP;
    }
  }
  registerConstant("TestGlobRoutingMapper", TestGlobRoutingMapper);

  let t: TestGlobRoutingMapper;
  beforeEach(({ testCase }) => {
    t = testCase as TestGlobRoutingMapper;
  });

  it("glob constraint", async () => {
    await t.get("/dummy");
    expect(t.response.code).toBe("301");
    expect(t.response.header.get("Location")!.match("/[^/]+$")![0]).toBe("/not_cars");
  });

  it("glob constraint skip route", async () => {
    await t.get("/cars");
    expect(t.response.code).toBe("200");
  });

  it("glob constraint skip all", async () => {
    await t.get("/missing");
    expect(t.response.code).toBe("404");
  });
});

describe("TestOptimizedNamedRoutes", () => {
  const Routes = new RouteSet();
  Routes.draw(function () {
    const ok = (_env: Record<string, unknown>) => [
      200,
      { "Content-Type": "text/plain" },
      bodyFromString(""),
    ];
    this.get("/foo", { to: ok, as: "foo" });
    this.get("/post(/:action(/:id))", { to: ok, as: "posts" });
    this.get("/:foo/:foo_type/bars/:id", { to: ok, as: "bar" });
    this.get("/projects/:id.:format", { to: ok, as: "project" });
    this.get("/pages/:id", { to: ok, as: "page" });
    this.get("/wiki/*page", { to: ok, as: "wiki" });
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
  class CategoriesController extends Base {
    async show(): Promise<void> {
      await this.render({ plain: "categories#show" });
    }
  }

  class ProductsController extends Base {
    async show(): Promise<void> {
      await this.render({ plain: "products#show" });
    }
  }

  const Routes = new RouteSet();
  Routes.draw(function () {
    this.scope({ module: "test_named_route_url_helpers" }, () => {
      this.get("/categories/:id", { to: "categories#show", as: "category" });
      this.get("/products/:id", { to: "products#show", as: "product" });
    });
  });

  const APP = IntegrationTest.buildApp(Routes);

  class TestNamedRouteUrlHelpers extends IntegrationTest {
    override get app(): unknown {
      return APP;
    }

    declare productPath: (...args: unknown[]) => string;
  }
  include(TestNamedRouteUrlHelpers, Routes.urlHelpers());
  registerConstant("TestNamedRouteUrlHelpers", TestNamedRouteUrlHelpers);

  let t: TestNamedRouteUrlHelpers;
  beforeEach(({ testCase }) => {
    controllerConstants.set("test_named_route_url_helpers/categories", CategoriesController);
    controllerConstants.set("test_named_route_url_helpers/products", ProductsController);
    t = testCase as TestNamedRouteUrlHelpers;
  });

  const assertResponse = (type: string): void => t.assertResponse(type);

  it("URL helpers do not ignore nil parameters when using non-optimized routes", async () => {
    await stub(Routes, "isOptimizeRoutesGeneration", false, undefined, async () => {
      await t.get("/categories/1");
      assertResponse("success");
      await assertRaises([UrlGenerationError], {}, () => t.productPath(null));
    });
  });
});

describe("TestUrlConstraints", () => {
  const Routes = new RouteSet();
  Routes.draw(function () {
    const ok = (_env: Record<string, unknown>) => [
      200,
      { "Content-Type": "text/plain" },
      bodyFromString(""),
    ];

    this.constraints({ subdomain: "admin" }, () => {
      this.get("/", { to: ok, as: "admin_root" });
    });

    this.scope({ constraints: { protocol: "https://" } }, () => {
      this.get("/", { to: ok, as: "secure_root" });
    });

    this.get("/", { to: ok, as: "alternate_root", constraints: { port: 8080 } });

    this.get("/search", { to: ok, constraints: { subdomain: false } });

    this.get("/logs", { to: ok, constraints: { subdomain: true } });
  });

  const APP = IntegrationTest.buildApp(Routes);
  class TestUrlConstraints extends IntegrationTest {
    override get app(): unknown {
      return APP;
    }

    declare adminRootUrl: () => string;
    declare secureRootUrl: () => string;
    declare alternateRootUrl: () => string;
    declare searchUrl: () => string;
    declare logsUrl: () => string;
  }
  include(TestUrlConstraints, Routes.urlHelpers());
  registerConstant("TestUrlConstraints", TestUrlConstraints);

  let t: TestUrlConstraints;
  const get = (path: string): Promise<void> => t.get(path);
  const assertResponse = (type: string): void => t.assertResponse(type);

  beforeEach(({ testCase }) => {
    t = testCase as TestUrlConstraints;
  });

  it("constraints are copied to defaults when using constraints method", async () => {
    expect(t.adminRootUrl()).toBe("http://admin.example.com/");

    await get("http://admin.example.com/");
    assertResponse("success");
  });

  it("constraints are copied to defaults when using scope constraints hash", async () => {
    expect(t.secureRootUrl()).toBe("https://www.example.com/");

    await get("https://www.example.com/");
    assertResponse("success");
  });

  it("constraints are copied to defaults when using route constraints hash", async () => {
    expect(t.alternateRootUrl()).toBe("http://www.example.com:8080/");

    await get("http://www.example.com:8080/");
    assertResponse("success");
  });

  it("false constraint expressions check for absence of values", async () => {
    await get("http://example.com/search");
    assertResponse("success");
    expect(t.searchUrl()).toBe("http://example.com/search");

    await get("http://api.example.com/search");
    assertResponse("not_found");
  });

  it("true constraint expressions check for presence of values", async () => {
    await get("http://api.example.com/logs");
    assertResponse("success");
    expect(t.logsUrl()).toBe("http://api.example.com/logs");

    await get("http://example.com/logs");
    assertResponse("not_found");
  });
});

describe("TestInvalidUrls", () => {
  class FooController extends Base {
    static {
      this.paramEncoding("show", "id", Encoding.ASCII_8BIT);
    }

    async show(): Promise<void> {
      await this.render({ plain: "foo#show" });
    }
  }

  class TestInvalidUrls extends IntegrationTest {}
  registerConstant("TestInvalidUrls", TestInvalidUrls);

  let t: TestInvalidUrls;
  beforeEach(({ testCase }) => {
    controllerConstants.set("test_invalid_urls/foo", FooController);
    t = testCase as TestInvalidUrls;
  });
  afterEach(() => {
    controllerConstants.delete("test_invalid_urls/foo");
  });
  const get = (path: string) => t.get(path);
  const assertResponse = (type: string): void => t.assertResponse(type);

  it("invalid UTF-8 encoding returns a bad request", async () => {
    await t.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.get("/bar/:id", { to: this.redirect("/foo/show/%{id}") });

        const ok = (_env: Record<string, unknown>) => [
          200,
          { "Content-Type": "text/plain" },
          bodyFromString(""),
        ];
        this.get("/foobar/:id", { to: ok });

        deprecator().silence(() => {
          this.get("/:controller(/:action(/:id))");
        });
      });

      await get("/%E2%EF%BF%BD%A6");
      assertResponse("bad_request");

      await get("/foo/%E2%EF%BF%BD%A6");
      assertResponse("bad_request");

      await get("/bar/%E2%EF%BF%BD%A6");
      assertResponse("bad_request");

      await get("/foobar/%E2%EF%BF%BD%A6");
      assertResponse("bad_request");
    });
  });

  it("params param_encoding uses ASCII 8bit", async () => {
    await t.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.get("/foo/show(/:id)", { to: "test_invalid_urls/foo#show" });
        this.get("/bar/show(/:id)", { controller: "test_invalid_urls/foo", action: "show" });
      });

      await get("/foo/show/%E2%EF%BF%BD%A6");
      assertResponse("ok");

      await get("/bar/show/%E2%EF%BF%BD%A6");
      assertResponse("ok");
    });
  });

  it("does not encode params besides id", async () => {
    await t.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.get("/foo/show(/:id)", { to: "test_invalid_urls/foo#show" });
        this.get("/bar/show(/:id)", { controller: "test_invalid_urls/foo", action: "show" });
      });

      await get("/foo/show/%E2%EF%BF%BD%A6?something_else=%E2%EF%BF%BD%A6");
      assertResponse("bad_request");

      await get("/foo/show/%E2%EF%BF%BD%A6?something_else=%E2%EF%BF%BD%A6");
      assertResponse("bad_request");
    });
  });
});

describe("TestOptionalRootSegments", () => {
  const Routes = IntegrationTest.stubControllers((routes) => {
    routes.draw(function () {
      this.get("/(page/:page)", { to: "pages#index", as: "root" });
    });
    return routes;
  });

  const APP = IntegrationTest.buildApp(Routes);

  class TestOptionalRootSegments extends IntegrationTest {
    override get app(): unknown {
      return APP;
    }

    declare rootPath: (...args: unknown[]) => string;
  }
  include(TestOptionalRootSegments, Routes.urlHelpers());
  registerConstant("TestOptionalRootSegments", TestOptionalRootSegments);

  let t: TestOptionalRootSegments;
  beforeEach(({ testCase }) => {
    t = testCase as TestOptionalRootSegments;
  });

  it("optional root segments", async () => {
    await t.get("/");
    expect(t.response.body).toBe("pages#index");
    expect(t.rootPath()).toBe("/");

    await t.get("/page/1");
    expect(t.response.body).toBe("pages#index");
    expect(t.request.params.page).toBe("1");
    expect(t.rootPath("1")).toBe("/page/1");
    expect(t.rootPath({ page: "1" })).toBe("/page/1");
  });
});

describe("TestPortConstraints", () => {
  const Routes = new RouteSet();
  Routes.draw(function () {
    const ok = (_env: Record<string, unknown>) => [
      200,
      { "Content-Type": "text/plain" },
      bodyFromString(""),
    ];

    this.get("/integer", { to: ok, constraints: { port: 8080 } });
    this.get("/string", { to: ok, constraints: { port: "8080" } });
    this.get("/array/:idx", { to: ok, constraints: { port: [8080], idx: ["first", "last"] } });
    this.get("/regexp", { to: ok, constraints: { port: /8080/ } });
  });

  const APP = IntegrationTest.buildApp(Routes);
  class TestPortConstraints extends IntegrationTest {
    override get app(): unknown {
      return APP;
    }
  }
  registerConstant("TestPortConstraints", TestPortConstraints);

  let t: TestPortConstraints;
  beforeEach(({ testCase }) => {
    t = testCase as TestPortConstraints;
  });

  const assertResponse = (type: string): void => t.assertResponse(type);

  it("integer port constraints", async () => {
    await t.get("http://www.example.com/integer");
    assertResponse("not_found");

    await t.get("http://www.example.com:8080/integer");
    assertResponse("success");
  });

  it("string port constraints", async () => {
    await t.get("http://www.example.com/string");
    assertResponse("not_found");

    await t.get("http://www.example.com:8080/string");
    assertResponse("success");
  });

  it("array port constraints", async () => {
    await t.get("http://www.example.com/array");
    assertResponse("not_found");

    await t.get("http://www.example.com:8080/array/middle");
    assertResponse("not_found");

    await t.get("http://www.example.com:8080/array/first");
    assertResponse("success");
  });

  it("regexp port constraints", async () => {
    await t.get("http://www.example.com/regexp");
    assertResponse("not_found");

    await t.get("http://www.example.com:8080/regexp");
    assertResponse("success");
  });
});

describe("TestFormatConstraints", () => {
  const Routes = new RouteSet();
  Routes.draw(function () {
    const ok = (_env: Record<string, unknown>) => [
      200,
      { "Content-Type": "text/plain" },
      bodyFromString(""),
    ];

    this.get("/string", { to: ok, constraints: { format: "json" } });
    this.get("/regexp", { to: ok, constraints: { format: /json/ } });
    this.get("/json_only", { to: ok, format: true, constraints: { format: /json/ } });
    this.get("/xml_only", { to: ok, format: "xml" });
  });

  const APP = IntegrationTest.buildApp(Routes);
  class TestFormatConstraints extends IntegrationTest {
    override get app(): unknown {
      return APP;
    }
  }
  registerConstant("TestFormatConstraints", TestFormatConstraints);

  let t: TestFormatConstraints;
  beforeEach(({ testCase }) => {
    t = testCase as TestFormatConstraints;
  });

  const assertResponse = (type: string): void => t.assertResponse(type);

  it("string format constraints", async () => {
    await t.get("http://www.example.com/string");
    assertResponse("success");

    await t.get("http://www.example.com/string.json");
    assertResponse("success");

    await t.get("http://www.example.com/string.html");
    assertResponse("not_found");
  });

  it("regexp format constraints", async () => {
    await t.get("http://www.example.com/regexp");
    assertResponse("success");

    await t.get("http://www.example.com/regexp.json");
    assertResponse("success");

    await t.get("http://www.example.com/regexp.html");
    assertResponse("not_found");
  });

  it("enforce with format true with constraint", async () => {
    await t.get("http://www.example.com/json_only.json");
    assertResponse("success");

    await t.get("http://www.example.com/json_only.html");
    assertResponse("not_found");

    await t.get("http://www.example.com/json_only");
    assertResponse("not_found");
  });

  it("enforce with string", async () => {
    await t.get("http://www.example.com/xml_only.xml");
    assertResponse("success");

    await t.get("http://www.example.com/xml_only");
    assertResponse("success");

    await t.get("http://www.example.com/xml_only.json");
    assertResponse("not_found");
  });
});

describe("TestCallableConstraintValidation", () => {
  it("constraint with object not callable", () => {
    expect(() => {
      new RouteSet().draw(function () {
        const ok = () => [200, { "Content-Type": "text/plain" }, []];
        this.get("/test", { to: ok as never, constraints: new (class {})() as never });
      });
    }).toThrow(ArgumentError);
  });
});

describe("TestRouteDefaults", () => {
  const Routes = IntegrationTest.stubControllers((routes) => {
    routes.draw(function () {
      this.resources("posts", { bucket_type: "post" });
      this.resources("projects", { defaults: { bucket_type: "project" } });
    });
    return routes;
  });

  const APP = IntegrationTest.buildApp(Routes);

  class TestRouteDefaults extends IntegrationTest {
    override get app(): unknown {
      return APP;
    }
  }
  include(TestRouteDefaults, Routes.urlHelpers());
  registerConstant("TestRouteDefaults", TestRouteDefaults);

  let t: TestRouteDefaults;
  beforeEach(({ testCase }) => {
    t = testCase as TestRouteDefaults;
  });

  it("route options are required for url for", async () => {
    await assertRaises([UrlGenerationError], {}, () => {
      t.urlFor({ controller: "posts", action: "show", id: 1, onlyPath: true });
    });

    expect(
      t.urlFor({ controller: "posts", action: "show", id: 1, bucket_type: "post", onlyPath: true }),
    ).toBe("/posts/1");
  });

  it("route defaults are not required for url for", () => {
    expect(t.urlFor({ controller: "projects", action: "show", id: 1, onlyPath: true })).toBe(
      "/projects/1",
    );
  });
});

describe("TestRackAppRouteGeneration", () => {
  const Routes = IntegrationTest.stubControllers((routes) => {
    routes.draw(function () {
      const rackApp = (_env: Record<string, unknown>) => [
        200,
        { "Content-Type": "text/plain" },
        [],
      ];
      this.mount(rackApp, { at: "/account", as: "account" });
      this.mount(rackApp, { at: "/:locale/account", as: "localized_account" });
    });
    return routes;
  });

  const APP = IntegrationTest.buildApp(Routes);

  class TestRackAppRouteGeneration extends IntegrationTest {
    override get app(): unknown {
      return APP;
    }
  }
  include(TestRackAppRouteGeneration, Routes.urlHelpers());
  registerConstant("TestRackAppRouteGeneration", TestRackAppRouteGeneration);

  let t: TestRackAppRouteGeneration;
  beforeEach(({ testCase }) => {
    t = testCase as TestRackAppRouteGeneration;
  });

  it("mounted application doesnt match unnamed route", async () => {
    await assertRaises([UrlGenerationError], {}, () => {
      expect(t.urlFor({ controller: "products", action: "index", onlyPath: true })).toBe(
        "/account?controller=products",
      );
    });

    await assertRaises([UrlGenerationError], {}, () => {
      expect(
        t.urlFor({ controller: "products", action: "index", locale: "de", onlyPath: true }),
      ).toBe("/de/account?controller=products");
    });
  });
});

describe("TestRedirectRouteGeneration", () => {
  const Routes = IntegrationTest.stubControllers((routes) => {
    routes.draw(function () {
      this.get("/account", { to: this.redirect("/myaccount"), as: "account" });
      this.get("/:locale/account", {
        to: this.redirect("/%{locale}/myaccount"),
        as: "localized_account",
      });
    });
    return routes;
  });

  const APP = IntegrationTest.buildApp(Routes);

  class TestRedirectRouteGeneration extends IntegrationTest {
    override get app(): unknown {
      return APP;
    }
  }
  include(TestRedirectRouteGeneration, Routes.urlHelpers());
  registerConstant("TestRedirectRouteGeneration", TestRedirectRouteGeneration);

  let t: TestRedirectRouteGeneration;
  beforeEach(({ testCase }) => {
    t = testCase as TestRedirectRouteGeneration;
  });

  it("redirect doesnt match unnamed route", async () => {
    await assertRaises([UrlGenerationError], {}, () => {
      expect(t.urlFor({ controller: "products", action: "index", onlyPath: true })).toBe(
        "/account?controller=products",
      );
    });

    await assertRaises([UrlGenerationError], {}, () => {
      expect(
        t.urlFor({ controller: "products", action: "index", locale: "de", onlyPath: true }),
      ).toBe("/de/account?controller=products");
    });
  });
});

describe("TestErrorsInController", () => {
  class PostsController extends Base {
    async foo(): Promise<void> {
      (null as unknown as { iDoNotExist(): void }).iDoNotExist();
    }

    async bar(): Promise<void> {
      rbConstGet(PostsController, "NonExistingClass");
    }
  }

  const Routes = new RouteSet();
  Routes.draw(function () {
    deprecator().silence(() => {
      this.get("/:controller(/:action)");
    });
  });

  const APP = IntegrationTest.buildApp(Routes);

  class TestErrorsInController extends IntegrationTest {
    override get app(): unknown {
      return APP;
    }
  }
  registerConstant("TestErrorsInController", TestErrorsInController);

  let t: TestErrorsInController;
  beforeEach(({ testCase }) => {
    controllerConstants.set("posts", PostsController);
    t = testCase as TestErrorsInController;
  });
  afterEach(() => {
    controllerConstants.delete("posts");
  });

  it("legit no method errors are not caught", async () => {
    await t.get("/posts/foo");
    expect(t.response.status).toBe(500);
  });

  it("legit name errors are not caught", async () => {
    await t.get("/posts/bar");
    expect(t.response.status).toBe(500);
  });

  it("legit routing not found responses", async () => {
    await t.get("/posts/baz");
    expect(t.response.status).toBe(404);

    await t.get("/i_do_not_exist");
    expect(t.response.status).toBe(404);
  });
});

describe("TestPartialDynamicPathSegments", () => {
  it("paths with partial dynamic segments are recognised", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/songs/song-:song", { to: "songs#show" });
      this.get("/songs/:song-song", { to: "songs#show2" });
      this.get("/:artist/song-:song", { to: "songs#artist_show" });
      this.get("/:artist/:song-song", { to: "songs#artist_show2" });
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
  const Routes = new RouteSet();
  Routes.draw(function () {
    this.scope({ module: "test_optional_scopes_with_or_without_params" }, () => {
      this.scope("(:locale)", { locale: /en|es/ }, () => {
        this.get("home", { controller: "home", action: "index" });
        this.get("with_param/:foo", { to: "home#withParam", as: "with_param" });
        this.get("without_param", { to: "home#withoutParam" });
      });
    });
  });

  class HomeController extends Base {
    async index(): Promise<void> {
      await this.render({
        inline: "<%= withParamPath({ foo: 'bar' }) %> | <%= withoutParamPath() %>",
      });
    }

    async withParam(): Promise<void> {}
    async withoutParam(): Promise<void> {}
  }
  include(HomeController, Routes.urlHelpers());

  const APP = IntegrationTest.buildApp(Routes);

  class TestOptionalScopesWithOrWithoutParams extends IntegrationTest {
    override get app(): unknown {
      return APP;
    }
  }
  registerConstant("TestOptionalScopesWithOrWithoutParams", TestOptionalScopesWithOrWithoutParams);

  let t: TestOptionalScopesWithOrWithoutParams;
  beforeEach(({ testCase }) => {
    controllerConstants.set("test_optional_scopes_with_or_without_params/home", HomeController);
    t = testCase as TestOptionalScopesWithOrWithoutParams;
  });

  it("stays unscoped with or without params", async () => {
    await t.get("/home");
    expect(t.response.body).toBe("/with_param/bar | /without_param");
  });

  it("preserves scope with or without params", async () => {
    await t.get("/es/home");
    expect(t.response.body).toBe("/es/with_param/bar | /es/without_param");
  });
});

describe("TestPathParameters", () => {
  const Routes = new RouteSet();
  Routes.draw(function () {
    this.scope({ module: "test_path_parameters" }, () => {
      this.scope(":locale", { locale: /en|ar/ }, () => {
        this.root({ to: "home#index" });
        this.get("/about", { to: "pages#about" });
      });
    });

    deprecator().silence(() => {
      this.get(":controller(/:action/(:id))");
    });
  });

  class HomeController extends Base {
    async index(): Promise<void> {
      await this.render({ inline: "<%= rootPath() %>" });
    }
  }
  include(HomeController, Routes.urlHelpers());

  class PagesController extends Base {
    async about(): Promise<void> {
      await this.render({
        inline: "<%= rootPath({ locale: 'ar' }) %> | <%= urlFor({ locale: 'ar' }) %>",
      });
    }
  }
  include(PagesController, Routes.urlHelpers());

  const APP = IntegrationTest.buildApp(Routes);

  class TestPathParameters extends IntegrationTest {
    override get app(): unknown {
      return APP;
    }
  }
  registerConstant("TestPathParameters", TestPathParameters);

  let t: TestPathParameters;
  beforeEach(({ testCase }) => {
    controllerConstants.set("test_path_parameters/home", HomeController);
    controllerConstants.set("test_path_parameters/pages", PagesController);
    t = testCase as TestPathParameters;
  });

  it("path parameters are not mutated", async () => {
    await t.get("/en/about");
    expect(t.response.body).toBe("/ar | /ar/about");
  });
});

describe("TestInternalRoutingParams", () => {
  it("paths with partial dynamic segments are recognised", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/test_internal/:internal", { to: "internal#internal" });
    });
    const m = routes.recognizePath("/test_internal/123");
    expect(m.internal).toBe("123");
    expect(m.controller).toBe("internal");
    expect(m.action).toBe("internal");
  });
});

describe("FlashRedirectTest", () => {
  const SessionKey = "_myapp_session";
  const Generator = new CachingKeyGenerator(
    new KeyGenerator("b3c631c314c0bbca50c1b2843150fe33", { iterations: 1000 }),
  );
  const Rotations = new RotationConfiguration();
  const SIGNED_COOKIE_SALT = "signed cookie";
  const ENCRYPTED_SIGNED_COOKIE_SALT = "signed encrypted cookie";

  class KeyGeneratorMiddleware {
    private app: (env: Record<string, unknown>) => unknown;

    constructor(app: (env: Record<string, unknown>) => unknown) {
      this.app = app;
    }

    call(env: Record<string, unknown>): unknown {
      env["action_dispatch.key_generator"] ??= Generator;
      env["action_dispatch.cookies_rotations"] ??= Rotations;
      env["action_dispatch.signed_cookie_salt"] = SIGNED_COOKIE_SALT;
      env["action_dispatch.encrypted_signed_cookie_salt"] = ENCRYPTED_SIGNED_COOKIE_SALT;

      return this.app(env);
    }
  }

  class FooController extends Base {
    async bar(): Promise<void> {
      await this.render({ plain: (this.flash.get("foo") as string | undefined) || "foo" });
    }
  }

  const Routes = new RouteSet();
  Routes.draw(function () {
    this.get("/foo", {
      to: this.redirect((_params, req) => {
        req.flash!.set("foo", "bar");
        return "/bar";
      }),
    });
    this.get("/bar", { to: "flash_redirect_test/foo#bar" });
  });

  const APP = IntegrationTest.buildApp(Routes, (middleware) => {
    middleware.use(KeyGeneratorMiddleware as unknown as MiddlewareFactory);
    middleware.use(CookieStore as MiddlewareFactory, { key: SessionKey });
    middleware.use(Flash as unknown as MiddlewareFactory);
    middleware.delete(ShowExceptions as MiddlewareFactory);
  });

  class FlashRedirectTest extends IntegrationTest {
    override get app(): unknown {
      return APP;
    }
  }
  include(FlashRedirectTest, Routes.urlHelpers());
  registerConstant("FlashRedirectTest", FlashRedirectTest);

  let t: FlashRedirectTest;
  beforeEach(({ testCase }) => {
    controllerConstants.set("flash_redirect_test/foo", FooController);
    t = testCase as FlashRedirectTest;
  });

  it("block redirect commits flash", async () => {
    await t.get("/foo", { env: { "action_dispatch.key_generator": Generator } });
    t.assertResponse("redirect");

    await t.followRedirectBang();
    expect(t.response.body).toBe("bar");
  });
});

describe("TestRelativeUrlRootGeneration", () => {
  const config = new RouteSet.Config("/blog", false);

  const Routes = IntegrationTest.stubControllers(config, (routes) => {
    routes.draw(function () {
      this.get("/", { to: "posts#index", as: "posts" });
      this.get("/:id", { to: "posts#show", as: "post" });
    });
    return routes;
  });

  const APP = IntegrationTest.buildApp(Routes);

  class TestRelativeUrlRootGeneration extends IntegrationTest {
    override get app(): unknown {
      return APP;
    }

    declare postsPath: (...args: unknown[]) => string;
    declare postPath: (...args: unknown[]) => string;
  }
  include(TestRelativeUrlRootGeneration, Routes.urlHelpers());
  registerConstant("TestRelativeUrlRootGeneration", TestRelativeUrlRootGeneration);

  let t: TestRelativeUrlRootGeneration;
  beforeEach(({ testCase }) => {
    t = testCase as TestRelativeUrlRootGeneration;
  });

  const urlHelpers = () =>
    Routes.urlHelpers() as unknown as Record<string, (...args: unknown[]) => string>;

  it("url helpers", () => {
    expect(t.postsPath({})).toBe("/blog/");
    expect(urlHelpers().postsPath({})).toBe("/blog/");

    expect(t.postPath({ id: "1" })).toBe("/blog/1");
    expect(urlHelpers().postPath({ id: "1" })).toBe("/blog/1");
  });

  it("optimized url helpers", () => {
    expect(t.postsPath()).toBe("/blog/");
    expect(urlHelpers().postsPath()).toBe("/blog/");

    expect(t.postPath("1")).toBe("/blog/1");
    expect(urlHelpers().postPath("1")).toBe("/blog/1");
  });
});

describe("TestHttpMethods", () => {
  const RFC2616 = ["OPTIONS", "GET", "HEAD", "POST", "PUT", "DELETE", "TRACE", "CONNECT"];
  const RFC2518 = ["PROPFIND", "PROPPATCH", "MKCOL", "COPY", "MOVE", "LOCK", "UNLOCK"];
  const RFC3253 = [
    "VERSION-CONTROL",
    "REPORT",
    "CHECKOUT",
    "CHECKIN",
    "UNCHECKOUT",
    "MKWORKSPACE",
    "UPDATE",
    "LABEL",
    "MERGE",
    "BASELINE-CONTROL",
    "MKACTIVITY",
  ];
  const RFC3648 = ["ORDERPATCH"];
  const RFC3744 = ["ACL"];
  const RFC5323 = ["SEARCH"];
  const RFC4791 = ["MKCALENDAR"];
  const RFC5789 = ["PATCH"];

  class TestHttpMethods extends IntegrationTest {
    simpleApp(response: string) {
      return (_env: Record<string, unknown>) => [
        200,
        { "Content-Type": "text/plain" },
        bodyFromString(response),
      ];
    }
  }
  registerConstant("TestHttpMethods", TestHttpMethods);

  let t: TestHttpMethods;
  beforeEach(({ testCase }) => {
    t = testCase as TestHttpMethods;
    const s = t;
    const routes = new RouteSet();
    t.app = new RoutedRackApp(routes);

    routes.draw(function () {
      for (const method of [
        ...RFC2616,
        ...RFC2518,
        ...RFC3253,
        ...RFC3648,
        ...RFC3744,
        ...RFC5323,
        ...RFC4791,
        ...RFC5789,
      ]) {
        this.match({ "/": s.simpleApp(method), via: `:${underscore(method)}` });
      }
    });
  });

  for (const method of [
    ...RFC2616,
    ...RFC2518,
    ...RFC3253,
    ...RFC3648,
    ...RFC3744,
    ...RFC5323,
    ...RFC4791,
    ...RFC5789,
  ]) {
    it(`request method ${underscore(method)} can be matched`, async () => {
      await t.get("/", { headers: { REQUEST_METHOD: method } });
      expect(t.response.body).toBe(method);
    });
  }
});

describe("TestUriPathEscaping", () => {
  it("escapes slash in generated path segment", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/:segment", { to: "test#show", as: "segment" });
    });
    expect(routes.pathFor({ segment: "a b/c+d" }, "segment")).toBe("/a%20b%2Fc+d");
  });

  it("unescapes recognized path segment", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/:segment", { to: "test#show", as: "segment" });
    });
    const m = routes.recognizePath("/a%20b%2Fc+d");
    expect(m.segment).toBe("a b/c+d");
  });

  it("does not escape slash in generated path splat", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/*splat", { to: "test#show", as: "splat" });
    });
    expect(routes.pathFor({ splat: "a b/c+d" }, "splat")).toBe("/a%20b/c+d");
  });

  it("unescapes recognized path splat", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/*splat", { to: "test#show", as: "splat" });
    });
    const m = routes.recognizePath("/a%20b/c+d");
    expect(m.splat).toBe("a b/c+d");
  });
});

describe("TestMultipleNestedController", () => {
  include(RoutingUrlFor as unknown as new (...args: never[]) => unknown, UrlFor);

  const Routes = new RouteSet();
  Routes.draw(function () {
    this.namespace("foo", () => {
      this.namespace("bar", () => {
        this.get({ baz: "baz#index" });
      });
    });
    this.get({ pooh: "pooh#index" });
  });

  class BazController extends Base {
    async index(): Promise<void> {
      await this.render({ inline: "<%= urlFor({ controller: '/pooh', action: 'index' }) %>" });
    }
  }
  include(BazController, Routes.urlHelpers());

  const APP = IntegrationTest.buildApp(Routes);
  class TestMultipleNestedController extends IntegrationTest {
    override get app(): unknown {
      return APP;
    }
  }
  registerConstant("TestMultipleNestedController", TestMultipleNestedController);

  let t: TestMultipleNestedController;
  beforeEach(({ testCase }) => {
    controllerConstants.set("foo/bar/baz", BazController);
    t = testCase as TestMultipleNestedController;
  });
  afterEach(() => {
    controllerConstants.delete("foo/bar/baz");
  });

  it("controller option which starts with '/' from multiple nested controller", async () => {
    await t.get("/foo/bar/baz");
    expect(t.response.body).toBe("/pooh");
  });
});

describe("TestRedirectInterpolation", () => {
  const Routes = new RouteSet();
  Routes.draw(function () {
    const ok = (_env: Record<string, unknown>) => [
      200,
      { "Content-Type": "text/plain" },
      bodyFromString(""),
    ];

    this.get("/foo/:id", { to: this.redirect("/foo/bar/%{id}") });
    this.get("/bar/:id", { to: this.redirect({ path: "/foo/bar/%{id}" }) });
    this.get("/baz/:id", { to: this.redirect("/baz?id=%{id}&foo=?&bar=1#id-%{id}") });
    this.get("/foo/bar/:id", { to: ok });
    this.get("/baz", { to: ok });
  });

  const APP = IntegrationTest.buildApp(Routes);
  class TestRedirectInterpolation extends IntegrationTest {
    override get app(): unknown {
      return APP;
    }
  }
  registerConstant("TestRedirectInterpolation", TestRedirectInterpolation);

  let t: TestRedirectInterpolation;
  beforeEach(({ testCase }) => {
    t = testCase as TestRedirectInterpolation;
  });

  function verifyRedirect(url: string, status = 301): void {
    expect(t.response.status).toBe(status);
    expect(t.response.headers.get("Location")).toBe(url);
    expect(t.response.body).toBe("");
  }

  it("redirect escapes interpolated parameters with redirect proc", async () => {
    await t.get("/foo/1%3E");
    verifyRedirect("http://www.example.com/foo/bar/1%3E");
  });

  it("redirect escapes interpolated parameters with option proc", async () => {
    await t.get("/bar/1%3E");
    verifyRedirect("http://www.example.com/foo/bar/1%3E");
  });

  it("path redirect escapes interpolated parameters correctly", async () => {
    await t.get("/foo/1%201");
    verifyRedirect("http://www.example.com/foo/bar/1%201");

    await t.get("/baz/1%201");
    verifyRedirect("http://www.example.com/baz?id=1+1&foo=?&bar=1#id-1%201");
  });
});

describe("TestConstraintsAccessingParameters", () => {
  const Routes = new RouteSet();
  Routes.draw(function () {
    const ok = (_env: Record<string, unknown>) => [
      200,
      { "Content-Type": "text/plain" },
      bodyFromString(""),
    ];

    this.get("/:foo", { to: ok, constraints: (r: Request) => r.params.foo === "foo" });
    this.get("/:bar", { to: ok });
  });

  const APP = IntegrationTest.buildApp(Routes);
  class TestConstraintsAccessingParameters extends IntegrationTest {
    override get app(): unknown {
      return APP;
    }
  }
  registerConstant("TestConstraintsAccessingParameters", TestConstraintsAccessingParameters);

  let t: TestConstraintsAccessingParameters;
  beforeEach(({ testCase }) => {
    t = testCase as TestConstraintsAccessingParameters;
  });

  it("parameters are reset between constraint checks", async () => {
    await t.get("/bar");
    expect(t.request.params.foo).toBeUndefined();
    expect(t.request.params.bar).toBe("bar");
  });
});

describe("TestDefaultUrlOptions", () => {
  class PostsController extends Base {
    async archive(): Promise<void> {
      await this.render({ plain: "posts#archive" });
    }
  }

  const Routes = new RouteSet();
  Routes.draw(function () {
    this.defaultUrlOptions = { locale: "en" };
    this.scope(":locale", { format: false }, () => {
      this.get("/posts/:year/:month/:day", { to: "posts#archive", as: "archived_posts" });
    });
  });

  const APP = IntegrationTest.buildApp(Routes);

  class TestDefaultUrlOptions extends IntegrationTest {
    override get app(): unknown {
      return APP;
    }

    declare archivedPostsPath: (...args: unknown[]) => string;
  }
  include(TestDefaultUrlOptions, Routes.urlHelpers());
  registerConstant("TestDefaultUrlOptions", TestDefaultUrlOptions);

  let t: TestDefaultUrlOptions;
  beforeEach(({ testCase }) => {
    controllerConstants.set("posts", PostsController);
    t = testCase as TestDefaultUrlOptions;
  });

  it("positional args with format false", () => {
    expect(t.archivedPostsPath(2014, 12, 13)).toBe("/en/posts/2014/12/13");
  });
});
