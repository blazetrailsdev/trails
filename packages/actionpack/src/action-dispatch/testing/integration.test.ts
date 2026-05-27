import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { IntegrationTest } from "./integration.js";
import { Base } from "../../action-controller/base.js";

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

  async renderXml() {
    this.response.setHeader("content-type", "application/xml");
    this.response.body = "<root><item>1</item></root>";
    this.status = 200;
  }

  async renderXml2() {
    this.response.setHeader("content-type", "application/xml");
    this.response.body = "<response><data>2</data></response>";
    this.status = 200;
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
      r.get("/posts/xml", { to: "posts#renderXml", as: "posts_xml" });
      r.get("/posts/xml2", { to: "posts#renderXml2", as: "posts_xml2" });
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
      expect(app.cookies.get("token")).toBe("abc123");

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
      await app.get("/posts", { headers: { Authorization: "Bearer token" } });
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

    it("requestCount increments per request and resets on resetBang", async () => {
      expect(app.requestCount).toBe(0);
      await app.get("/posts");
      await app.get("/posts");
      expect(app.requestCount).toBe(2);
      app.resetBang();
      expect(app.requestCount).toBe(0);
    });

    it("httpsBang / isHttps flip the scheme on the rack env", async () => {
      expect(app.isHttps()).toBe(false);
      app.httpsBang();
      expect(app.isHttps()).toBe(true);
      await app.get("/posts");
      expect(app.request.env["rack.url_scheme"]).toBe("https");
      expect(app.request.env.HTTPS).toBe("on");
      app.httpsBang(false);
      expect(app.isHttps()).toBe(false);
    });

    it("host/remoteAddr/accept land in the rack env", async () => {
      app.host = "api.example.com:8080";
      app.remoteAddr = "10.0.0.5";
      app.accept = "application/vnd.api+json";
      await app.get("/posts");
      expect(app.request.env.HTTP_HOST).toBe("api.example.com:8080");
      expect(app.request.env.SERVER_NAME).toBe("api.example.com");
      expect(app.request.env.SERVER_PORT).toBe("8080");
      expect(app.request.env.REMOTE_ADDR).toBe("10.0.0.5");
      expect(app.request.env.HTTP_ACCEPT).toBe("application/vnd.api+json");
    });

    it("urlOptions memoizes per request and clears across requests", async () => {
      const before = app.urlOptions();
      expect(before).toEqual({ host: "www.example.com", protocol: "http" });
      expect(app.urlOptions()).toBe(before);
      await app.get("/posts");
      const after = app.urlOptions();
      expect(after).not.toBe(before);
    });

    it("process() with an absolute URL updates host and https", async () => {
      await app.process("get", "https://other.example.com/posts");
      expect(app.host).toBe("other.example.com");
      expect(app.isHttps()).toBe(true);
      app.assertResponse("success");
    });

    it("_processPath splits query string off PATH_INFO", async () => {
      await app.get("/posts?page=2&per=10");
      expect(app.request.env.PATH_INFO).toBe("/posts");
      expect(app.request.env.QUERY_STRING).toBe("page=2&per=10");
      app.assertResponse("success");
    });

    it("followRedirectBang sets HTTP_REFERER to the prior request URL", async () => {
      await app.get("/posts/redirect");
      app.assertResponse("redirect");
      const refererBefore = `http://www.example.com/posts/redirect`;
      await app.followRedirectBang();
      expect(app.request.env.HTTP_REFERER).toBe(refererBefore);
    });

    it("followRedirectBang throws when last response was not a redirect", async () => {
      await app.get("/posts");
      await expect(app.followRedirectBang()).rejects.toThrow(/not a redirect/);
    });

    it("createSession propagates routes/controllers/app; app falls back to class default", async () => {
      const sentinel = { name: "app-instance" };
      app.app = sentinel;
      const sess = app.createSession();
      expect(sess.routes).toBe(app.routes);
      expect(sess.app).toBe(sentinel);
      // Dispatch works on the new session without re-registering controllers.
      await sess.get("/posts");
      sess.assertResponse("success");

      // Falls back to class-level default when no instance override is set.
      const fresh = new IntegrationTest();
      expect(fresh.app).toBe(null);
      const Stub = class extends IntegrationTest {};
      Stub.app = { name: "class-default" };
      const stubbed = new Stub();
      expect(stubbed.app).toEqual({ name: "class-default" });
    });

    it("openSession dups parent: shared routes/controllers, independent state, rootSession propagation", async () => {
      await app.get("/posts");
      expect(app.requestCount).toBe(1);

      const child = app.openSession();
      // Routes/controllers carry over (Rails dup is shallow on object refs).
      expect(child.routes).toBe(app.routes);
      // Per-request state is reset on the child.
      expect(child.requestCount).toBe(0);
      // rootSession threads through to the top-level instance.
      expect(child.rootSession).toBe(app);
      // Dispatch on the child works without re-registering controllers.
      await child.get("/posts");
      child.assertResponse("success");
      // Parent's per-request state is independent.
      expect(app.requestCount).toBe(1);
      // assertions counter is forwarded to the root.
      child.assertions = 5;
      expect(app.assertions).toBe(5);
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

  // =========================================================================
  // html_document / document_root_element / _mock_session
  // (ActionDispatch::Assertions#html_document, Integration::Runner)
  // =========================================================================
  describe("html_document", () => {
    afterEach(() => {
      app.reset();
    });

    it("html_document parses XML response as XML::Document", async () => {
      await app.get("/posts/xml");
      const doc = app.htmlDocument;
      expect(doc).toBeDefined();
      expect(doc.root).toBeDefined();
      expect(doc.root.name).toBe("root");
    });

    it("html_document is lazily cached per request", async () => {
      await app.get("/posts/xml");
      const first = app.htmlDocument;
      const second = app.htmlDocument;
      expect(first).toBe(second);
    });

    it("test_redirect_reset_html_document", async () => {
      await app.get("/posts/xml");
      const previousHtmlDocument = app.htmlDocument;

      await app.get("/posts/xml2");

      app.assertResponse("success");
      expect(app.htmlDocument).not.toBe(previousHtmlDocument);
    });

    it("html_document throws for text/html responses (HTML parsing not yet implemented)", async () => {
      await app.get("/posts/html");
      expect(() => app.htmlDocument).toThrow("not yet implemented");
    });
  });

  describe("document_root_element", () => {
    afterEach(() => {
      app.reset();
    });

    it("document_root_element returns the root element", async () => {
      await app.get("/posts/xml");
      const root = app.documentRootElement;
      expect(root).toBeDefined();
      expect(root.name).toBe("root");
      expect(root).toBe(app.htmlDocument.root);
    });
  });

  describe("_mock_session", () => {
    it("_mock_session returns the integration session", () => {
      expect(app._mockSession).toBe(app);
    });
  });

  describe("follow_redirect! preserves HTTP_REFERER on 404 target", () => {
    let redirectApp: IntegrationTest;

    beforeEach(() => {
      redirectApp = new IntegrationTest();
    });

    afterEach(() => {
      redirectApp.reset();
    });

    it("follow_redirect! sets HTTP_REFERER even when redirect target is a 404", async () => {
      class RedirectToMissingController extends Base {
        async index() {
          this.redirectTo("/this-path-does-not-exist");
        }
      }
      redirectApp.routes.draw((r) => {
        r.get("/redirect-to-missing", { to: "redirector#index", as: "redirector" });
      });
      redirectApp.registerController("redirector", RedirectToMissingController);

      await redirectApp.get("/redirect-to-missing");
      redirectApp.assertResponse("redirect");
      await redirectApp.followRedirectBang();

      expect(redirectApp.status).toBe(404);
      expect(redirectApp.request.env.HTTP_REFERER).toBe(
        "http://www.example.com/redirect-to-missing",
      );
    });

    it("follow_redirect! merges options.headers into 404 env", async () => {
      class RedirectToMissing2Controller extends Base {
        async index() {
          this.redirectTo("/no-route-here");
        }
      }
      redirectApp.routes.draw((r) => {
        r.get("/redirect-to-missing2", { to: "redirector2#index", as: "redirector2" });
      });
      redirectApp.registerController("redirector2", RedirectToMissing2Controller);

      await redirectApp.get("/redirect-to-missing2");
      redirectApp.assertResponse("redirect");
      await redirectApp.followRedirectBang({ headers: { "X-Custom-Header": "sentinel" } });

      expect(redirectApp.status).toBe(404);
      expect(redirectApp.request.env.HTTP_X_CUSTOM_HEADER).toBe("sentinel");
    });

    it("merges options.env into 404 request env", async () => {
      await app.get("/no-such-route", { env: { "X-CUSTOM-ENV": "env-value" } });
      expect(app.status).toBe(404);
      expect(app.request.env["X-CUSTOM-ENV"]).toBe("env-value");
    });

    it("sets rack.input on 404 request when body option is provided", async () => {
      await app.get("/no-such-route", { body: "test-body" });
      expect(app.status).toBe(404);
      expect(app.request.env["rack.input"]).toBe("test-body");
    });
  });

  describe("IPv6 host parsing", () => {
    afterEach(() => {
      app.reset();
    });

    it("correctly parses SERVER_NAME and SERVER_PORT for IPv6 host", async () => {
      app.host = "[::1]:3000";
      await app.get("/posts");
      expect(app.request.env.SERVER_NAME).toBe("[::1]");
      expect(app.request.env.SERVER_PORT).toBe("3000");
    });

    it("correctly parses SERVER_NAME for bare IPv6 host without port", async () => {
      app.host = "[::1]";
      await app.get("/posts");
      expect(app.request.env.SERVER_NAME).toBe("[::1]");
      expect(app.request.env.SERVER_PORT).toBe("80");
    });

    it("correctly handles unbracketed IPv6 address as SERVER_NAME with no port", async () => {
      app.host = "::1";
      await app.get("/no-such-route");
      expect(app.status).toBe(404);
      expect(app.request.env.SERVER_NAME).toBe("::1");
      expect(app.request.env.SERVER_PORT).toBe("80");
    });

    it("correctly parses SERVER_NAME and SERVER_PORT for IPv6 host on 404 path", async () => {
      app.host = "[::1]:3000";
      await app.get("/no-such-route");
      expect(app.status).toBe(404);
      expect(app.request.env.SERVER_NAME).toBe("[::1]");
      expect(app.request.env.SERVER_PORT).toBe("3000");
    });
  });
});
