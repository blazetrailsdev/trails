import { describe, it, expect } from "vitest";
import { Base, API, DoubleRenderError } from "./base.js";
import { Metal } from "./metal.js";
import { Request } from "../actiondispatch/request.js";
import { Response } from "../actiondispatch/response.js";

function makeRequest(opts: Record<string, string> = {}): Request {
  return new Request({
    REQUEST_METHOD: opts.method ?? "GET",
    PATH_INFO: opts.path ?? "/",
    HTTP_HOST: opts.host ?? "localhost",
    ...opts,
  });
}
function makeResponse(): Response { return new Response(); }

// ==========================================================================
// action_controller/render_test.rb
// ==========================================================================
describe("ActionController rendering", () => {
  // --- render json ---
  describe("render json", () => {
    it("renders object as JSON", async () => {
      class C extends Base { async index() { this.render({ json: { a: 1 } }); } }
      const c = new C();
      await c.dispatch("index", makeRequest(), makeResponse());
      expect(JSON.parse(c.body)).toEqual({ a: 1 });
      expect(c.contentType).toBe("application/json; charset=utf-8");
    });

    it("renders array as JSON", async () => {
      class C extends Base { async index() { this.render({ json: [1, 2, 3] }); } }
      const c = new C();
      await c.dispatch("index", makeRequest(), makeResponse());
      expect(JSON.parse(c.body)).toEqual([1, 2, 3]);
    });

    it("renders JSON string directly", async () => {
      class C extends Base { async index() { this.render({ json: '{"custom":true}' }); } }
      const c = new C();
      await c.dispatch("index", makeRequest(), makeResponse());
      expect(c.body).toBe('{"custom":true}');
    });

    it("renders null as JSON", async () => {
      class C extends Base { async index() { this.render({ json: null }); } }
      const c = new C();
      await c.dispatch("index", makeRequest(), makeResponse());
      expect(c.body).toBe("null");
    });

    it("renders with custom status", async () => {
      class C extends Base { async index() { this.render({ json: {}, status: 201 }); } }
      const c = new C();
      await c.dispatch("index", makeRequest(), makeResponse());
      expect(c.status).toBe(201);
    });

    it("renders with custom content type", async () => {
      class C extends Base { async index() { this.render({ json: {}, contentType: "application/vnd.api+json" }); } }
      const c = new C();
      await c.dispatch("index", makeRequest(), makeResponse());
      expect(c.contentType).toBe("application/vnd.api+json");
    });
  });

  // --- render plain ---
  describe("render plain", () => {
    it("renders plain text", async () => {
      class C extends Base { async index() { this.render({ plain: "hello world" }); } }
      const c = new C();
      await c.dispatch("index", makeRequest(), makeResponse());
      expect(c.body).toBe("hello world");
      expect(c.contentType).toBe("text/plain; charset=utf-8");
    });

    it("renders empty plain", async () => {
      class C extends Base { async index() { this.render({ plain: "" }); } }
      const c = new C();
      await c.dispatch("index", makeRequest(), makeResponse());
      expect(c.body).toBe("");
    });
  });

  // --- render html ---
  describe("render html", () => {
    it("renders HTML string", async () => {
      class C extends Base { async index() { this.render({ html: "<b>bold</b>" }); } }
      const c = new C();
      await c.dispatch("index", makeRequest(), makeResponse());
      expect(c.body).toBe("<b>bold</b>");
      expect(c.contentType).toBe("text/html; charset=utf-8");
    });
  });

  // --- render body ---
  describe("render body", () => {
    it("renders raw body", async () => {
      class C extends Base { async index() { this.render({ body: "raw" }); } }
      const c = new C();
      await c.dispatch("index", makeRequest(), makeResponse());
      expect(c.body).toBe("raw");
      expect(c.contentType).toBe("application/octet-stream");
    });
  });

  // --- render text ---
  describe("render text", () => {
    it("renders text", async () => {
      class C extends Base { async index() { this.render({ text: "text" }); } }
      const c = new C();
      await c.dispatch("index", makeRequest(), makeResponse());
      expect(c.body).toBe("text");
      expect(c.contentType).toBe("text/plain; charset=utf-8");
    });
  });

  // --- render status ---
  describe("render with status", () => {
    it("accepts numeric status", async () => {
      class C extends Base { async index() { this.render({ plain: "ok", status: 202 }); } }
      const c = new C();
      await c.dispatch("index", makeRequest(), makeResponse());
      expect(c.status).toBe(202);
    });

    it("accepts symbol status", async () => {
      class C extends Base { async index() { this.render({ plain: "created", status: "created" }); } }
      const c = new C();
      await c.dispatch("index", makeRequest(), makeResponse());
      expect(c.status).toBe(201);
    });

    it("accepts not_found status", async () => {
      class C extends Base { async index() { this.render({ plain: "nope", status: "not_found" }); } }
      const c = new C();
      await c.dispatch("index", makeRequest(), makeResponse());
      expect(c.status).toBe(404);
    });

    it("accepts unprocessable_entity status", async () => {
      class C extends Base { async index() { this.render({ json: { errors: [] }, status: "unprocessable_entity" }); } }
      const c = new C();
      await c.dispatch("index", makeRequest(), makeResponse());
      expect(c.status).toBe(422);
    });
  });

  // --- head ---
  describe("head", () => {
    it("head with numeric status", async () => {
      class C extends Metal { async index() { this.head(204); } }
      const c = new C();
      await c.dispatch("index", makeRequest(), makeResponse());
      expect(c.status).toBe(204);
      expect(c.body).toBe("");
    });

    it("head with symbol status", async () => {
      class C extends Metal { async index() { this.head("not_found"); } }
      const c = new C();
      await c.dispatch("index", makeRequest(), makeResponse());
      expect(c.status).toBe(404);
    });

    it("head with ok", async () => {
      class C extends Metal { async index() { this.head("ok"); } }
      const c = new C();
      await c.dispatch("index", makeRequest(), makeResponse());
      expect(c.status).toBe(200);
    });

    it("head marks as performed", async () => {
      class C extends Metal { async index() { this.head(200); } }
      const c = new C();
      await c.dispatch("index", makeRequest(), makeResponse());
      expect(c.performed).toBe(true);
    });
  });

  // --- render_to_string ---
  describe("renderToString", () => {
    it("returns rendered content without committing", async () => {
      class C extends Base {
        preview = "";
        async index() {
          this.preview = this.renderToString({ json: { preview: true } });
          this.render({ json: { final: true } });
        }
      }
      const c = new C();
      await c.dispatch("index", makeRequest(), makeResponse());
      expect(c.preview).toBe('{"preview":true}');
      expect(c.body).toBe('{"final":true}');
    });

    it("renderToString with plain text", async () => {
      class C extends Base {
        preview = "";
        async index() {
          this.preview = this.renderToString({ plain: "preview" });
          this.render({ plain: "final" });
        }
      }
      const c = new C();
      await c.dispatch("index", makeRequest(), makeResponse());
      expect(c.preview).toBe("preview");
      expect(c.body).toBe("final");
    });
  });

  // --- double render ---
  describe("double render prevention", () => {
    it("raises on render after render", async () => {
      class C extends Base {
        async index() {
          this.render({ plain: "first" });
          this.render({ plain: "second" });
        }
      }
      const c = new C();
      await expect(c.dispatch("index", makeRequest(), makeResponse())).rejects.toThrow(DoubleRenderError);
    });

    it("raises on render after redirect", async () => {
      class C extends Base {
        async index() {
          this.redirectTo("/other");
          this.render({ plain: "oops" });
        }
      }
      const c = new C();
      await expect(c.dispatch("index", makeRequest(), makeResponse())).rejects.toThrow(DoubleRenderError);
    });

    it("raises on redirect after render", async () => {
      class C extends Base {
        async index() {
          this.render({ plain: "ok" });
          this.redirectTo("/other");
        }
      }
      const c = new C();
      await expect(c.dispatch("index", makeRequest(), makeResponse())).rejects.toThrow(DoubleRenderError);
    });

    it("raises on redirect after redirect", async () => {
      class C extends Base {
        async index() {
          this.redirectTo("/a");
          this.redirectTo("/b");
        }
      }
      const c = new C();
      await expect(c.dispatch("index", makeRequest(), makeResponse())).rejects.toThrow(DoubleRenderError);
    });
  });

  // --- implicit render ---
  describe("implicit render", () => {
    it("renders empty HTML without template resolver", async () => {
      class C extends Base { async index() { this.render(); } }
      const c = new C();
      await c.dispatch("index", makeRequest(), makeResponse());
      expect(c.contentType).toBe("text/html; charset=utf-8");
      expect(c.body).toBe("");
    });

    it("uses template resolver when available", async () => {
      class TemplateController extends Base { async index() { this.render(); } }
      TemplateController.templateResolver = (_ctrl, action, _fmt) => `<div>${action}</div>`;
      const c = new TemplateController();
      await c.dispatch("index", makeRequest(), makeResponse());
      expect(c.body).toBe("<div>index</div>");
    });
  });

  // --- API rendering ---
  describe("API controller rendering", () => {
    it("renders JSON", async () => {
      class C extends API { async index() { this.render({ json: { api: true } }); } }
      const c = new C();
      await c.dispatch("index", makeRequest(), makeResponse());
      expect(JSON.parse(c.body)).toEqual({ api: true });
    });

    it("renders plain text", async () => {
      class C extends API { async index() { this.render({ plain: "api text" }); } }
      const c = new C();
      await c.dispatch("index", makeRequest(), makeResponse());
      expect(c.body).toBe("api text");
    });

    it("renders with status", async () => {
      class C extends API { async index() { this.render({ json: {}, status: "created" }); } }
      const c = new C();
      await c.dispatch("index", makeRequest(), makeResponse());
      expect(c.status).toBe(201);
    });

    it("renders body", async () => {
      class C extends API { async index() { this.render({ body: "raw" }); } }
      const c = new C();
      await c.dispatch("index", makeRequest(), makeResponse());
      expect(c.body).toBe("raw");
    });
  });
});
