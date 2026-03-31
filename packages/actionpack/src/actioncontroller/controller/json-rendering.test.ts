import { describe, it, expect } from "vitest";
import { RouteSet } from "../../actiondispatch/routing/route-set.js";
import { Request } from "../../actiondispatch/request.js";
import { Response } from "../../actiondispatch/response.js";
import { Base } from "../base.js";
import { API } from "../api.js";
import { bodyToString } from "@blazetrails/rack";

describe("Controller JSON rendering integration", () => {
  it("renders JSON from a controller action", async () => {
    class PostsController extends Base {
      async index() {
        this.render({ json: { posts: [{ id: 1, title: "Hello" }] } });
      }
    }

    const c = new PostsController();
    await c.dispatch("index", new Request(), new Response());
    const [status, headers, body] = c.toRackResponse();

    expect(status).toBe(200);
    expect(headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(JSON.parse(await bodyToString(body))).toEqual({
      posts: [{ id: 1, title: "Hello" }],
    });
  });

  it("accesses path parameters via params", async () => {
    class PostsController extends Base {
      async show() {
        const id = this.params.get("id");
        this.render({ json: { id } });
      }
    }

    const c = new PostsController();
    await c.dispatch(
      "show",
      new Request({
        REQUEST_METHOD: "GET",
        PATH_INFO: "/posts/42",
        "action_dispatch.request.path_parameters": {
          controller: "posts",
          action: "show",
          id: "42",
        },
      }),
      new Response(),
    );

    expect(JSON.parse(c.body)).toEqual({ id: "42" });
  });

  it("accesses query parameters via params", async () => {
    class PostsController extends Base {
      async index() {
        const page = this.params.get("page");
        this.render({ json: { page } });
      }
    }

    const c = new PostsController();
    await c.dispatch(
      "index",
      new Request({
        REQUEST_METHOD: "GET",
        PATH_INFO: "/posts",
        QUERY_STRING: "page=3",
      }),
      new Response(),
    );

    expect(JSON.parse(c.body)).toEqual({ page: "3" });
  });

  it("parses JSON request body into params", async () => {
    class PostsController extends Base {
      async create() {
        const title = this.params.get("title");
        this.render({ json: { title }, status: "created" });
      }
    }

    const c = new PostsController();
    await c.dispatch(
      "create",
      new Request({
        REQUEST_METHOD: "POST",
        PATH_INFO: "/posts",
        CONTENT_TYPE: "application/json",
        "rack.input": JSON.stringify({ title: "New Post" }),
      }),
      new Response(),
    );

    expect(c.status).toBe(201);
    expect(JSON.parse(c.body)).toEqual({ title: "New Post" });
  });

  it("works end-to-end with RouteSet dispatch", async () => {
    class PostsController extends Base {
      async show() {
        const id = this.params.get("id");
        this.render({ json: { id, found: true } });
      }
    }

    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("posts");
    });
    routes.setDispatcher(async (controller, action, params, env) => {
      const req = new Request(env);
      const res = new Response();
      const c = new PostsController();
      await c.dispatch(action, req, res);
      return c.toRackResponse();
    });

    const [status, headers, body] = await routes.call({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/posts/7",
    });

    expect(status).toBe(200);
    expect(headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(JSON.parse(await bodyToString(body))).toEqual({ id: "7", found: true });
  });

  it("returns 404 for unmatched routes", async () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("posts");
    });

    const [status, , body] = await routes.call({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/nope",
    });

    expect(status).toBe(404);
    expect(await bodyToString(body)).toContain("No route matches");
  });

  it("API controller renders JSON", async () => {
    class ApiPostsController extends API {
      async index() {
        this.render({ json: [{ id: 1 }, { id: 2 }] });
      }
    }

    const c = new ApiPostsController();
    await c.dispatch("index", new Request(), new Response());

    expect(c.status).toBe(200);
    expect(JSON.parse(c.body)).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("renders with custom status codes", async () => {
    class PostsController extends Base {
      async create() {
        this.render({ json: { created: true }, status: 201 });
      }
      async destroy() {
        this.head("no_content");
      }
    }

    const c1 = new PostsController();
    await c1.dispatch("create", new Request(), new Response());
    expect(c1.status).toBe(201);

    const c2 = new PostsController();
    await c2.dispatch("destroy", new Request(), new Response());
    expect(c2.status).toBe(204);
    expect(c2.body).toBe("");
  });

  it("merges path params, query params, and body params", async () => {
    class PostsController extends Base {
      async update() {
        this.render({
          json: {
            id: this.params.get("id"),
            title: this.params.get("title"),
            page: this.params.get("page"),
          },
        });
      }
    }

    const c = new PostsController();
    await c.dispatch(
      "update",
      new Request({
        REQUEST_METHOD: "PATCH",
        PATH_INFO: "/posts/5",
        QUERY_STRING: "page=2",
        CONTENT_TYPE: "application/json",
        "rack.input": JSON.stringify({ title: "Updated" }),
        "action_dispatch.request.path_parameters": {
          controller: "posts",
          action: "update",
          id: "5",
        },
      }),
      new Response(),
    );

    expect(JSON.parse(c.body)).toEqual({
      id: "5",
      title: "Updated",
      page: "2",
    });
  });

  it("path params take precedence over query/body params", async () => {
    class PostsController extends Base {
      async show() {
        this.render({ json: { id: this.params.get("id") } });
      }
    }

    const c = new PostsController();
    await c.dispatch(
      "show",
      new Request({
        REQUEST_METHOD: "GET",
        PATH_INFO: "/posts/5",
        QUERY_STRING: "id=999",
        "action_dispatch.request.path_parameters": {
          controller: "posts",
          action: "show",
          id: "5",
        },
      }),
      new Response(),
    );

    expect(JSON.parse(c.body)).toEqual({ id: "5" });
  });

  it("parses nested query parameters", async () => {
    class PostsController extends Base {
      async index() {
        const user = this.params.get("user");
        this.render({ json: { user } });
      }
    }

    const c = new PostsController();
    await c.dispatch(
      "index",
      new Request({
        REQUEST_METHOD: "GET",
        PATH_INFO: "/posts",
        QUERY_STRING: "user[name]=dean&user[role]=admin",
      }),
      new Response(),
    );

    expect(JSON.parse(c.body)).toEqual({
      user: { name: "dean", role: "admin" },
    });
  });
});
