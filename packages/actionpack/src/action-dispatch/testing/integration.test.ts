import { KeyGenerator } from "@blazetrails/activesupport/key-generator";
import { RotationConfiguration } from "@blazetrails/activesupport/messages/rotation-configuration";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { IntegrationTest } from "./integration.js";
import { Base } from "../../action-controller/base.js";
import { controllerConstants } from "../http/request.js";
import { DebugExceptions } from "../middleware/debug-exceptions.js";
import { ShowExceptions } from "../middleware/show-exceptions.js";
import type { MiddlewareFactory, MiddlewareStack } from "../middleware/stack.js";
import { CookieStore } from "../middleware/session/cookie-store.js";
import { include } from "@blazetrails/activesupport";
import { SharedTestRoutes } from "../../test-helpers/abstract-unit.js";

const Generator = new KeyGenerator("a".repeat(64), { iterations: 2 });
const Rotations = new RotationConfiguration();

class IntegrationTestWithSession extends IntegrationTest {
  override async process(
    method: string,
    path: string,
    options: Parameters<IntegrationTest["process"]>[2] = {},
  ): Promise<number> {
    const env: Record<string, unknown> = { ...(options.env ?? {}) };
    env["action_dispatch.key_generator"] ??= Generator;
    env["action_dispatch.cookies_rotations"] ??= Rotations;
    env["action_dispatch.signed_cookie_salt"] ??= "signed cookie";
    env["action_dispatch.encrypted_cookie_salt"] ??= "encrypted cookie";
    env["action_dispatch.encrypted_signed_cookie_salt"] ??= "signed encrypted cookie";
    return super.process(method, path, { ...options, env });
  }
}

function useCookieStore(middleware: MiddlewareStack): void {
  middleware.use(CookieStore as MiddlewareFactory, { key: "_session" });
  middleware.delete(ShowExceptions as MiddlewareFactory);
  middleware.delete(DebugExceptions as MiddlewareFactory);
}

class PostsController extends Base {
  async index() {
    await this.render({ json: [{ id: 1 }, { id: 2 }] });
  }

  async show() {
    const id = this.params.get("id");
    if (!id) {
      return this.head(404);
    }
    await this.render({ json: { id } });
  }

  async create() {
    const title = this.params.get("title");
    this.flash.set("notice", "Post created!");
    this.session.set("lastPost", title);
    this.status = "created";
    await this.render({ json: { title, created: true } });
  }

  async update() {
    const id = this.params.get("id");
    await this.render({ json: { id, updated: true } });
  }

  async destroy() {
    this.head(204);
  }

  async redirectToIndex() {
    this.redirectTo("/posts");
  }

  async createAndRedirect() {
    this.flash.set("notice", "Post created!");
    this.redirectTo("/posts/flash");
  }

  async showFlash() {
    await this.render({ plain: String(this.flash.get("notice") ?? "none") });
  }

  async renderHtml() {
    await this.render({ html: "<h1>Posts</h1>" });
  }

  async serverError() {
    this.status = 500;
    await this.render({ json: { error: "internal" } });
  }

  async customHeader() {
    this.headers.set("X-Custom", "integration-test");
    await this.render({ plain: "ok" });
  }

  async readSession() {
    const lastPost = this.session.get("lastPost") ?? "none";
    await this.render({ json: { lastPost } });
  }

  async setCookie() {
    this.response.setHeader("set-cookie", "token=abc123; Path=/");
    await this.render({ plain: "cookie set" });
  }

  async readCookie() {
    const cookie = this.request.env.HTTP_COOKIE ?? "none";
    await this.render({ plain: String(cookie) });
  }

  async renderXml() {
    await this.render({
      body: "<root><item>1</item></root>",
      contentType: "application/xml",
      status: 200,
    });
  }

  async renderXml2() {
    await this.render({
      body: "<response><data>2</data></response>",
      contentType: "application/xml",
      status: 200,
    });
  }
}

include(PostsController, SharedTestRoutes.urlHelpers());

class CommentsController extends Base {
  async index() {
    const postId = this.params.get("post_id");
    await this.render({ json: { postId, comments: [] } });
  }

  async create() {
    const postId = this.params.get("post_id");
    this.status = "created";
    await this.render({ json: { postId, created: true } });
  }
}

class AdminPostsController extends Base {
  async index() {
    await this.render({ json: { admin: true, posts: [] } });
  }
}

class SessionsController extends Base {
  async create() {
    this.session.set("userId", 42);
    this.redirectTo("/posts");
  }

  async show() {
    const userId = this.session.get("userId") ?? null;
    await this.render({ json: { userId } });
  }

  async destroy() {
    this.session.set("userId", undefined);
    this.head(204);
  }
}

describe("ActionDispatch::IntegrationTest", () => {
  let app: IntegrationTest;

  beforeEach(({ task }) => {
    app = new IntegrationTestWithSession(task.name);
    app.routes.draw(function () {
      this.get("/posts/xml", { to: "posts#render_xml", as: "posts_xml" });
      this.get("/posts/xml2", { to: "posts#render_xml2", as: "posts_xml2" });
      this.get("/posts/html", { to: "posts#render_html", as: "posts_html" });
      this.get("/posts/error", { to: "posts#server_error", as: "posts_error" });
      this.get("/posts/redirect", { to: "posts#redirect_to_index", as: "posts_redirect" });
      this.get("/posts/header", { to: "posts#custom_header", as: "posts_header" });
      this.get("/posts/session", { to: "posts#read_session", as: "posts_session" });
      this.post("/posts/create-and-redirect", {
        to: "posts#create_and_redirect",
        as: "posts_create_and_redirect",
      });
      this.get("/posts/flash", { to: "posts#show_flash", as: "posts_flash" });
      this.get("/posts/set-cookie", { to: "posts#set_cookie", as: "posts_set_cookie" });
      this.get("/posts/read-cookie", { to: "posts#read_cookie", as: "posts_read_cookie" });
      this.resources("posts", {}, () => {
        this.resources("comments");
      });
      this.namespace("admin", () => {
        this.resources("posts");
      });
      this.resource("session");
    });
    app.app = IntegrationTest.buildApp(app.routes, useCookieStore);
    controllerConstants.set("posts", PostsController);
    controllerConstants.set("comments", CommentsController);
    controllerConstants.set("admin/posts", AdminPostsController);
    controllerConstants.set("sessions", SessionsController);
  });

  describe("basic requests", () => {
    it("GET /posts returns 200", async () => {
      await app.get("/posts");
      app.assertResponse("success");
      app.assertResponse(200);
    });

    it("GET /posts returns JSON", async () => {
      await app.get("/posts");
      expect(app.response.mediaType).toBe("application/json");
      expect(app.response.parsedBody).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it("GET /posts/:id returns show", async () => {
      await app.get("/posts/42");
      app.assertResponse(200);
      expect(app.response.parsedBody).toEqual({ id: "42" });
    });

    it("POST /posts creates resource", async () => {
      await app.post("/posts", { params: { title: "Test" } });
      app.assertResponse("created");
      expect(app.response.parsedBody).toEqual({ title: "Test", created: true });
    });

    it("PUT /posts/:id updates resource", async () => {
      await app.put("/posts/5", { params: { title: "Updated" } });
      app.assertResponse("success");
      expect((app.response.parsedBody as any).updated).toBe(true);
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
      expect((app.response.parsedBody as any).postId).toBe("1");
    });

    it("nested resource POST works", async () => {
      await app.post("/posts/3/comments", { params: { body: "Nice" } });
      app.assertResponse("created");
      expect((app.response.parsedBody as any).postId).toBe("3");
    });

    it("namespaced resources work", async () => {
      await app.get("/admin/posts");
      app.assertResponse("success");
      expect((app.response.parsedBody as any).admin).toBe(true);
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
      app.routes.draw(function () {
        this.get("/unknown", { to: "unknown#index" });
      });
      app.app = IntegrationTest.buildApp(app.routes, useCookieStore);
      await expect(app.get("/unknown")).rejects.toThrow(/uninitialized constant UnknownController/);
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
      await app.followRedirectBang();
      app.assertResponse("success");
      expect(app.response.parsedBody).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it("followRedirect throws when no redirect", async () => {
      await app.get("/posts");
      await expect(app.followRedirectBang()).rejects.toThrow(/not a redirect!/);
    });

    it("assertRedirectedTo with regex", async () => {
      await app.get("/posts/redirect");
      app.assertRedirectedTo(/posts/);
    });
  });

  describe("content types", () => {
    it("JSON content type", async () => {
      await app.get("/posts");
      expect(app.response.mediaType).toBe("application/json");
    });

    it("HTML content type", async () => {
      await app.get("/posts/html");
      expect(app.response.mediaType).toBe("text/html");
    });
  });

  describe("headers", () => {
    it("assertHeader checks response headers", async () => {
      await app.get("/posts/header");
      expect(app.response.headers.get("x-custom")).toBe("integration-test");
    });

    it("assertHeader with regex", async () => {
      await app.get("/posts/header");
      expect(app.response.headers.get("x-custom")).toMatch(/integration/);
    });
  });

  describe("session persistence", () => {
    it("session persists across requests", async () => {
      await app.post("/posts", { params: { title: "Persisted" } });
      await app.get("/posts/session");
      expect((app.response.parsedBody as any).lastPost).toBe("Persisted");
    });

    it("login flow with session", async () => {
      await app.post("/session");
      app.assertResponse("redirect");

      await app.get("/session");
      expect((app.response.parsedBody as any).userId).toBe(42);

      await app.delete("/session");
      app.assertResponse("no_content");
    });

    it("reset clears session", async () => {
      await app.post("/posts", { params: { title: "Before Reset" } });
      app.reset();
      await app.get("/posts/session");
      expect((app.response.parsedBody as any).lastPost).toBe("none");
    });
  });

  describe("cookie persistence", () => {
    it("cookies persist across requests", async () => {
      await app.get("/posts/set-cookie");
      expect(app.cookies.get("token")).toBe("abc123");

      await app.get("/posts/read-cookie");
      expect(app.body).toContain("token=abc123");
    });

    it("reset clears cookies", async () => {
      await app.get("/posts/set-cookie");
      app.reset();
      await app.get("/posts/read-cookie");
      expect(app.body).not.toContain("token=abc123");
    });
  });

  describe("flash", () => {
    it("flash is accessible after request", async () => {
      await app.post("/posts", { params: { title: "Flash!" } });
      expect(app.flash().get("notice")).toBe("Post created!");
    });

    it("flash survives a redirect and is swept on the request after", async () => {
      await app.post("/posts/create-and-redirect");
      app.assertResponse(302);

      await app.followRedirectBang();
      expect(app.body).toBe("Post created!");

      await app.get("/posts/flash");
      expect(app.body).toBe("none");
    });

    it("assertFlash throws when not set", async () => {
      await app.get("/posts");
      expect(app.flash().get("notice")).toBeUndefined();
    });
  });

  describe("response body", () => {
    it("responseBody returns response body", async () => {
      await app.get("/posts");
      expect(app.body).toContain("[");
    });

    it("parsedBody returns parsed JSON", async () => {
      await app.get("/posts");
      expect(Array.isArray(app.response.parsedBody)).toBe(true);
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

    it("createSession propagates routes/controllers/app; app falls back to class default", async ({
      task,
    }) => {
      const sentinel = IntegrationTest.buildApp(app.routes, useCookieStore);
      app.app = sentinel;
      const sess = app.createSession(sentinel);
      expect(sess.routes).toBe(app.routes);
      expect(sess.app).toBe(sentinel);
      await sess.get("/posts");
      sess.assertResponse("success");

      const fresh = new IntegrationTest(task.name);
      expect(fresh.app).toBe(IntegrationTest.app);
      const Stub = class extends IntegrationTest {};
      Stub.app = { name: "class-default" };
      const stubbed = new Stub(task.name);
      expect(stubbed.app).toEqual({ name: "class-default" });
    });

    it("openSession dups parent: shared routes/controllers, independent state, rootSession propagation", async () => {
      await app.get("/posts");
      expect(app.requestCount).toBe(1);

      const child = app.openSession();
      expect(child.routes).toBe(app.routes);
      expect(child.requestCount).toBe(0);
      expect(child.rootSession).toBe(app);
      await child.get("/posts");
      child.assertResponse("success");
      expect(app.requestCount).toBe(1);
      child.assertions = 5;
      expect(app.assertions).toBe(5);
    });

    it("CRUD lifecycle", async () => {
      await app.post("/posts", { params: { title: "CRUD" } });
      app.assertResponse("created");

      await app.get("/posts");
      app.assertResponse("success");

      await app.put("/posts/1", { params: { title: "Updated" } });
      app.assertResponse("success");

      await app.delete("/posts/1");
      app.assertResponse("no_content");
    });
  });

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
    it("_mock_session owns the session's cookie jar", async () => {
      const mockSession = app._mockSession;
      expect(app.cookies).toBe(mockSession.cookieJar);

      app.cookies.set("stored", "value");
      await app.get("/posts");
      expect(app._mockSession).toBe(mockSession);
      expect(app.cookies.get("stored")).toBe("value");
    });

    it("reset! drops the mock session, and with it the cookies", () => {
      app.cookies.set("stored", "value");
      const mockSession = app._mockSession;

      app.resetBang();

      expect(app._mockSession).not.toBe(mockSession);
      expect(app.cookies.get("stored")).toBeUndefined();
    });
  });

  describe("follow_redirect! preserves HTTP_REFERER on 404 target", () => {
    let redirectApp: IntegrationTest;

    beforeEach(({ task }) => {
      redirectApp = new IntegrationTestWithSession(task.name);
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
      redirectApp.routes.draw(function () {
        this.get("/redirect-to-missing", { to: "redirector#index", as: "redirector" });
      });
      redirectApp.app = IntegrationTest.buildApp(redirectApp.routes, useCookieStore);
      controllerConstants.set("redirector", RedirectToMissingController);

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
      redirectApp.routes.draw(function () {
        this.get("/redirect-to-missing2", { to: "redirector2#index", as: "redirector2" });
      });
      redirectApp.app = IntegrationTest.buildApp(redirectApp.routes, useCookieStore);
      controllerConstants.set("redirector2", RedirectToMissing2Controller);

      await redirectApp.get("/redirect-to-missing2");
      redirectApp.assertResponse("redirect");
      await redirectApp.followRedirectBang({ headers: { "X-Custom-Header": "sentinel" } });

      expect(redirectApp.status).toBe(404);
      expect(redirectApp.request.env.HTTP_X_CUSTOM_HEADER).toBe("sentinel");
    });

    it("merges options.env into 404 request env", async () => {
      await app.get("/no-such-route", { env: { "X-CUSTOM-ENV": "env-value" } });
      expect(app.status).toBe(404);
      expect(app.request.env["HTTP_X_CUSTOM_ENV"]).toBe("env-value");
    });
  });
});
