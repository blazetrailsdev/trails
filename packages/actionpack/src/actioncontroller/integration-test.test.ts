import { describe, it, expect, beforeEach } from "vitest";
import { IntegrationTest } from "./integration-test.js";
import { Base } from "./base.js";

// ==========================================================================
// Test controllers
// ==========================================================================

class PostsController extends Base {
  async index() {
    this.render({ json: [{ id: 1 }, { id: 2 }] });
  }

  async show() {
    const id = this.params.get("id");
    if (!id) {
      return this.head(404);
    }
    this.render({ json: { id } });
  }

  async create() {
    const title = this.params.get("title");
    this.flash.set("notice", "Post created!");
    this.session.lastPost = title;
    this.status = "created";
    this.render({ json: { title, created: true } });
  }

  async update() {
    const id = this.params.get("id");
    this.render({ json: { id, updated: true } });
  }

  async destroy() {
    this.head(204);
  }

  async redirectToIndex() {
    this.redirectTo("/posts");
  }

  async renderHtml() {
    this.render({ html: "<h1>Posts</h1>" });
  }

  async serverError() {
    this.status = 500;
    this.render({ json: { error: "internal" } });
  }

  async customHeader() {
    this.setHeader("X-Custom", "integration-test");
    this.render({ plain: "ok" });
  }

  async readSession() {
    const lastPost = this.session.lastPost ?? "none";
    this.render({ json: { lastPost } });
  }

  async setCookie() {
    this.response.setHeader("set-cookie", "token=abc123; Path=/");
    this.render({ plain: "cookie set" });
  }

  async readCookie() {
    const cookie = this.request.env.HTTP_COOKIE ?? "none";
    this.render({ plain: String(cookie) });
  }
}

class CommentsController extends Base {
  async index() {
    const postId = this.params.get("post_id");
    this.render({ json: { postId, comments: [] } });
  }

  async create() {
    const postId = this.params.get("post_id");
    this.status = "created";
    this.render({ json: { postId, created: true } });
  }
}

class AdminPostsController extends Base {
  async index() {
    this.render({ json: { admin: true, posts: [] } });
  }
}

class SessionsController extends Base {
  async create() {
    this.session.userId = 42;
    this.redirectTo("/posts");
  }

  async show() {
    const userId = this.session.userId ?? null;
    this.render({ json: { userId } });
  }

  async destroy() {
    this.session.userId = undefined;
    this.head(204);
  }
}

// ==========================================================================
// action_dispatch/integration_test.rb
// ==========================================================================
describe("ActionDispatch::IntegrationTest", () => {
  let app: IntegrationTest;

  beforeEach(() => {
    app = new IntegrationTest();
    app.routes.draw((r) => {
      // Custom routes before resources so they match before :id
      r.get("/posts/html", { to: "posts#renderHtml", as: "posts_html" });
      r.get("/posts/error", { to: "posts#serverError", as: "posts_error" });
      r.get("/posts/redirect", { to: "posts#redirectToIndex", as: "posts_redirect" });
      r.get("/posts/header", { to: "posts#customHeader", as: "posts_header" });
      r.get("/posts/session", { to: "posts#readSession", as: "posts_session" });
      r.get("/posts/set-cookie", { to: "posts#setCookie", as: "posts_set_cookie" });
      r.get("/posts/read-cookie", { to: "posts#readCookie", as: "posts_read_cookie" });
      r.resources("posts", {}, (posts) => {
        posts.resources("comments");
      });
      r.namespace("admin", (admin) => {
        admin.resources("posts");
      });
      r.resource("session");
    });
    app.registerController("posts", PostsController);
    app.registerController("comments", CommentsController);
    app.registerController("admin/posts", AdminPostsController);
    app.registerController("sessions", SessionsController);
  });

  describe("basic requests", () => {
    it("GET /posts returns 200", async () => {
      await app.get("/posts");
      app.assertResponse("success");
      app.assertResponse(200);
    });

    it("GET /posts returns JSON", async () => {
      await app.get("/posts");
      app.assertContentType("application/json");
      expect(app.parsedBody).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it("GET /posts/:id returns show", async () => {
      await app.get("/posts/42");
      app.assertResponse(200);
      expect(app.parsedBody).toEqual({ id: "42" });
    });

    it("POST /posts creates resource", async () => {
      await app.post("/posts", { params: { title: "Test" } });
      app.assertResponse("created");
      expect(app.parsedBody).toEqual({ title: "Test", created: true });
    });

    it("PUT /posts/:id updates resource", async () => {
      await app.put("/posts/5", { params: { title: "Updated" } });
      app.assertResponse("success");
      expect((app.parsedBody as any).updated).toBe(true);
    });

    it("PATCH /posts/:id updates resource", async () => {
      await app.patch("/posts/5");
      app.assertResponse("success");
    });

    it("DELETE /posts/:id destroys resource", async () => {
      await app.delete("/posts/1");
      app.assertResponse("no_content");
    });
  });

  describe("routing", () => {
    it("routes to correct controller and action", async () => {
      await app.get("/posts");
      expect(app.controller).toBeInstanceOf(PostsController);
    });

    it("nested resources work", async () => {
      await app.get("/posts/1/comments");
      app.assertResponse("success");
      expect((app.parsedBody as any).postId).toBe("1");
    });

    it("nested resource POST works", async () => {
      await app.post("/posts/3/comments", { params: { body: "Nice" } });
      app.assertResponse("created");
      expect((app.parsedBody as any).postId).toBe("3");
    });

    it("namespaced resources work", async () => {
      await app.get("/admin/posts");
      app.assertResponse("success");
      expect((app.parsedBody as any).admin).toBe(true);
    });

    it("singular resource works", async () => {
      await app.get("/session");
      app.assertResponse("success");
    });

    it("unmatched route returns 404", async () => {
      await app.get("/nonexistent");
      app.assertResponse(404);
    });

    it("unregistered controller throws", async () => {
      app.routes.draw((r) => {
        r.get("/unknown", { to: "unknown#index" });
      });
      await expect(app.get("/unknown")).rejects.toThrow(/No controller registered/);
    });
  });

  describe("redirects", () => {
    it("redirect sets location header", async () => {
      await app.get("/posts/redirect");
      app.assertResponse("redirect");
      app.assertRedirectedTo("/posts");
    });

    it("followRedirect follows the redirect", async () => {
      await app.get("/posts/redirect");
      await app.followRedirect();
      app.assertResponse("success");
      expect(app.parsedBody).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it("followRedirect throws when no redirect", async () => {
      await app.get("/posts");
      await expect(app.followRedirect()).rejects.toThrow(/No redirect to follow/);
    });

    it("assertRedirectedTo with regex", async () => {
      await app.get("/posts/redirect");
      app.assertRedirectedTo(/posts/);
    });
  });

  describe("content types", () => {
    it("JSON content type", async () => {
      await app.get("/posts");
      app.assertContentType("application/json");
    });

    it("HTML content type", async () => {
      await app.get("/posts/html");
      app.assertContentType("text/html");
    });
  });

  describe("headers", () => {
    it("assertHeader checks response headers", async () => {
      await app.get("/posts/header");
      app.assertHeader("x-custom", "integration-test");
    });

    it("assertHeader with regex", async () => {
      await app.get("/posts/header");
      app.assertHeader("x-custom", /integration/);
    });
  });

  describe("session persistence", () => {
    it("session persists across requests", async () => {
      await app.post("/posts", { params: { title: "Persisted" } });
      await app.get("/posts/session");
      expect((app.parsedBody as any).lastPost).toBe("Persisted");
    });

    it("login flow with session", async () => {
      // Log in
      await app.post("/session");
      app.assertResponse("redirect");

      // Check session
      await app.get("/session");
      expect((app.parsedBody as any).userId).toBe(42);

      // Log out
      await app.delete("/session");
      app.assertResponse("no_content");
    });

    it("reset clears session", async () => {
      await app.post("/posts", { params: { title: "Before Reset" } });
      app.reset();
      await app.get("/posts/session");
      expect((app.parsedBody as any).lastPost).toBe("none");
    });
  });

  describe("cookie persistence", () => {
    it("cookies persist across requests", async () => {
      await app.get("/posts/set-cookie");
      expect(app.cookieJar.token).toBe("abc123");

      await app.get("/posts/read-cookie");
      expect(app.responseBody).toContain("token=abc123");
    });

    it("reset clears cookies", async () => {
      await app.get("/posts/set-cookie");
      app.reset();
      await app.get("/posts/read-cookie");
      expect(app.responseBody).not.toContain("token=abc123");
    });
  });

  describe("flash", () => {
    it("flash is accessible after request", async () => {
      await app.post("/posts", { params: { title: "Flash!" } });
      app.assertFlash("notice", "Post created!");
    });

    it("assertFlash throws when not set", async () => {
      await app.get("/posts");
      expect(() => app.assertFlash("notice")).toThrow(/Expected flash/);
    });
  });

  describe("response body", () => {
    it("responseBody returns response body", async () => {
      await app.get("/posts");
      expect(app.responseBody).toContain("[");
    });

    it("parsedBody returns parsed JSON", async () => {
      await app.get("/posts");
      expect(Array.isArray(app.parsedBody)).toBe(true);
    });

    it("status accessor returns status code", async () => {
      await app.get("/posts");
      expect(app.status).toBe(200);
    });
  });

  describe("error responses", () => {
    it("500 error response", async () => {
      await app.get("/posts/error");
      app.assertResponse("error");
      app.assertResponse(500);
    });
  });

  describe("request options", () => {
    it("XHR request", async () => {
      await app.get("/posts", { xhr: true });
      expect(app.request.isXmlHttpRequest).toBe(true);
    });

    it("custom headers", async () => {
      await app.get("/posts", { headers: { "Authorization": "Bearer token" } });
      expect(app.request.getHeader("Authorization")).toBe("Bearer token");
    });

    it("format option sets accept header", async () => {
      await app.get("/posts", { format: "json" });
      expect(app.request.accept).toContain("application/json");
    });

    it("as option is alias for format", async () => {
      await app.get("/posts", { as: "json" });
      expect(app.request.accept).toContain("application/json");
    });
  });

  describe("multi-request workflows", () => {
    it("create then show flow", async () => {
      await app.post("/posts", { params: { title: "New" } });
      app.assertResponse("created");

      await app.get("/posts/1");
      app.assertResponse("success");
    });

    it("CRUD lifecycle", async () => {
      // Create
      await app.post("/posts", { params: { title: "CRUD" } });
      app.assertResponse("created");

      // Read
      await app.get("/posts");
      app.assertResponse("success");

      // Update
      await app.put("/posts/1", { params: { title: "Updated" } });
      app.assertResponse("success");

      // Delete
      await app.delete("/posts/1");
      app.assertResponse("no_content");
    });
  });
});
