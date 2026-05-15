import { describe, it, expect, beforeEach } from "vitest";
import { TestCase } from "../test-case.js";
import { Base } from "../base.js";
import { Metal } from "../metal.js";

// ==========================================================================
// Test controllers
// ==========================================================================

class PostsController extends Base {
  async index() {
    this.render({ json: [{ id: 1, title: "Hello" }] });
  }

  async show() {
    const id = this.params.get("id");
    this.render({ json: { id } });
  }

  async create() {
    const title = this.params.get("title");
    this.flash.set("notice", "Post created!");
    this.session.lastCreated = title;
    this.status = 201;
    this.render({ json: { title } });
  }

  async update() {
    const id = this.params.get("id");
    this.render({ json: { id, updated: true } });
  }

  async destroy() {
    const id = this.params.get("id");
    this.head(204);
  }

  async redirectAction() {
    this.redirectTo("/posts");
  }

  async renderPlain() {
    this.render({ plain: "hello world" });
  }

  async renderHtml() {
    this.render({ html: "<h1>Hello</h1>" });
  }

  async renderWithStatus() {
    this.render({ json: { error: "not found" }, status: 404 });
  }

  async setCustomHeader() {
    this.setHeader("X-Custom", "test-value");
    this.render({ plain: "ok" });
  }

  async forbidden() {
    this.head("forbidden");
  }

  async useSession() {
    const count = ((this.session.count as number) ?? 0) + 1;
    this.session.count = count;
    this.render({ json: { count } });
  }

  async flashNotice() {
    this.flash.set("notice", "Success!");
    this.render({ plain: "ok" });
  }

  async flashAlert() {
    this.flash.set("alert", "Danger!");
    this.render({ plain: "ok" });
  }
}

// ==========================================================================
// action_controller/test_case_test.rb
// ==========================================================================
describe("TestCaseTest", () => {
  let tc: TestCase;

  beforeEach(() => {
    tc = new TestCase(PostsController);
  });

  describe("HTTP verb methods", () => {
    it("GET dispatches to action", async () => {
      await tc.get("index");
      expect(tc.controller).toBeDefined();
      expect(tc.responseBody).toContain("Hello");
    });

    it("POST dispatches to action", async () => {
      await tc.post("create", { params: { title: "New Post" } });
      expect(tc.controller.status).toBe(201);
      expect(JSON.parse(tc.responseBody).title).toBe("New Post");
    });

    it("PUT dispatches to action", async () => {
      await tc.put("update", { params: { id: "42" } });
      expect(JSON.parse(tc.responseBody).id).toBe("42");
    });

    it("PATCH dispatches to action", async () => {
      await tc.patch("update", { params: { id: "7" } });
      expect(JSON.parse(tc.responseBody).id).toBe("7");
    });

    it("DELETE dispatches to action", async () => {
      await tc.delete("destroy", { params: { id: "1" } });
      expect(tc.controller.status).toBe(204);
    });

    it("HEAD dispatches to action", async () => {
      await tc.head("index");
      expect(tc.controller).toBeDefined();
    });
  });

  describe("request options", () => {
    it("passes params to controller", async () => {
      await tc.get("show", { params: { id: "99" } });
      expect(JSON.parse(tc.responseBody).id).toBe("99");
    });

    it("sets custom headers", async () => {
      await tc.get("index", { headers: { "X-Custom": "test" } });
      expect(tc.request.getHeader("X-Custom")).toBe("test");
    });

    it("sets XHR flag", async () => {
      await tc.get("index", { xhr: true });
      expect(tc.request.isXmlHttpRequest).toBe(true);
    });

    it("sets format via accept header", async () => {
      await tc.get("index", { format: "json" });
      expect(tc.request.accept).toContain("application/json");
    });

    it("passes session data", async () => {
      await tc.get("useSession", { session: { count: 5 } });
      expect(JSON.parse(tc.responseBody).count).toBe(6);
    });
  });

  describe("response inspection", () => {
    it("responseBody returns response body", async () => {
      await tc.get("renderPlain");
      expect(tc.responseBody).toBe("hello world");
    });

    it("parsedBody returns parsed JSON", async () => {
      await tc.get("index");
      expect(tc.parsedBody).toEqual([{ id: 1, title: "Hello" }]);
    });

    it("controller is accessible", async () => {
      await tc.get("index");
      expect(tc.controller).toBeInstanceOf(Base);
    });

    it("request is accessible", async () => {
      await tc.get("index");
      expect(tc.request).toBeDefined();
      expect(tc.request.method).toBe("GET");
    });

    it("response is accessible", async () => {
      await tc.get("index");
      expect(tc.response).toBeDefined();
    });
  });

  describe("assertResponse", () => {
    it("accepts exact status code", async () => {
      await tc.get("index");
      tc.assertResponse(200);
    });

    it("throws on wrong status code", async () => {
      await tc.get("index");
      expect(() => tc.assertResponse(404)).toThrow(/Expected response status 404/);
    });

    it("accepts 'success' for 2xx", async () => {
      await tc.get("index");
      tc.assertResponse("success");
    });

    it("accepts 'redirect' for 3xx", async () => {
      await tc.get("redirectAction");
      tc.assertResponse("redirect");
    });

    it("rejects 'success' for non-2xx", async () => {
      await tc.get("renderWithStatus");
      expect(() => tc.assertResponse("success")).toThrow(/Expected response to be "success"/);
    });

    it("accepts status symbols like 'ok'", async () => {
      await tc.get("index");
      tc.assertResponse("ok");
    });

    it("accepts status symbols like 'created'", async () => {
      await tc.post("create", { params: { title: "x" } });
      tc.assertResponse("created");
    });

    it("accepts status symbols like 'not_found'", async () => {
      await tc.get("renderWithStatus");
      tc.assertResponse("not_found");
    });

    it("accepts status symbols like 'no_content'", async () => {
      await tc.delete("destroy", { params: { id: "1" } });
      tc.assertResponse("no_content");
    });

    it("accepts status symbols like 'forbidden'", async () => {
      await tc.get("forbidden");
      tc.assertResponse("forbidden");
    });

    it("throws on unknown symbol", async () => {
      await tc.get("index");
      expect(() => tc.assertResponse("banana")).toThrow(/Unknown response assertion/);
    });

    it("accepts 'missing' for 4xx", async () => {
      await tc.get("renderWithStatus");
      tc.assertResponse("missing");
    });
  });

  describe("assertRedirectedTo", () => {
    it("passes on correct redirect URL", async () => {
      await tc.get("redirectAction");
      tc.assertRedirectedTo("/posts");
    });

    it("throws on wrong redirect URL", async () => {
      await tc.get("redirectAction");
      expect(() => tc.assertRedirectedTo("/wrong")).toThrow(/Expected redirect to "\/wrong"/);
    });

    it("throws when no redirect", async () => {
      await tc.get("index");
      expect(() => tc.assertRedirectedTo("/posts")).toThrow(/no Location header/);
    });

    it("accepts regex", async () => {
      await tc.get("redirectAction");
      tc.assertRedirectedTo(/\/posts/);
    });
  });

  describe("assertContentType", () => {
    it("matches JSON content type", async () => {
      await tc.get("index");
      tc.assertContentType("application/json");
    });

    it("matches plain text content type", async () => {
      await tc.get("renderPlain");
      tc.assertContentType("text/plain");
    });

    it("matches HTML content type", async () => {
      await tc.get("renderHtml");
      tc.assertContentType("text/html");
    });

    it("throws on mismatch", async () => {
      await tc.get("index");
      expect(() => tc.assertContentType("text/plain")).toThrow(/Expected content type/);
    });
  });

  describe("assertHeader", () => {
    it("checks header value", async () => {
      await tc.get("setCustomHeader");
      tc.assertHeader("x-custom", "test-value");
    });

    it("throws on missing header", async () => {
      await tc.get("index");
      expect(() => tc.assertHeader("x-nonexistent", "val")).toThrow(/Expected header/);
    });

    it("accepts regex", async () => {
      await tc.get("setCustomHeader");
      tc.assertHeader("x-custom", /test/);
    });
  });

  describe("flash", () => {
    it("assertFlash passes when flash is set", async () => {
      await tc.get("flashNotice");
      tc.assertFlash("notice", "Success!");
    });

    it("assertFlash throws when flash is not set", async () => {
      await tc.get("index");
      expect(() => tc.assertFlash("notice")).toThrow(/Expected flash/);
    });

    it("assertFlash checks value", async () => {
      await tc.get("flashNotice");
      expect(() => tc.assertFlash("notice", "Wrong")).toThrow(/Expected flash/);
    });

    it("assertFlash accepts regex", async () => {
      await tc.get("flashNotice");
      tc.assertFlash("notice", /Success/);
    });

    it("assertNoFlash passes when flash is not set", async () => {
      await tc.get("index");
      tc.assertNoFlash("alert");
    });

    it("assertNoFlash throws when flash is set", async () => {
      await tc.get("flashAlert");
      expect(() => tc.assertNoFlash("alert")).toThrow(/Expected no flash/);
    });

    it("flash accessor returns flash hash", async () => {
      await tc.get("flashNotice");
      expect(tc.flash.get("notice")).toBe("Success!");
    });
  });

  describe("session persistence", () => {
    it("session persists across requests", async () => {
      await tc.get("useSession");
      expect(JSON.parse(tc.responseBody).count).toBe(1);

      await tc.get("useSession");
      expect(JSON.parse(tc.responseBody).count).toBe(2);

      await tc.get("useSession");
      expect(JSON.parse(tc.responseBody).count).toBe(3);
    });

    it("session set by controller is available", async () => {
      await tc.post("create", { params: { title: "My Post" } });
      expect(tc.session.lastCreated).toBe("My Post");
    });

    it("reset clears session", async () => {
      await tc.get("useSession");
      tc.reset();
      await tc.get("useSession");
      expect(JSON.parse(tc.responseBody).count).toBe(1);
    });
  });

  describe("reset", () => {
    it("clears controller, request, response", async () => {
      await tc.get("index");
      tc.reset();
      expect(tc.controller).toBeUndefined();
      expect(tc.request).toBeUndefined();
      expect(tc.response).toBeUndefined();
    });
  });

  describe("Metal controller support", () => {
    it("works with Metal controllers", async () => {
      class SimpleMetal extends Metal {
        async index() {
          this.body = "metal response";
          this.contentType = "text/plain";
          this.markPerformed();
        }
      }

      const mtc = new TestCase(SimpleMetal);
      await mtc.get("index");
      expect(mtc.responseBody).toBe("metal response");
    });
  });
});
