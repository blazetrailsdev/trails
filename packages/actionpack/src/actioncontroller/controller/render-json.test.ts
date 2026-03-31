import { describe, it, expect } from "vitest";
import { Base } from "../base.js";
import { Request } from "../../actiondispatch/request.js";
import { Response } from "../../actiondispatch/response.js";

function makeRequest(opts: Record<string, unknown> = {}): Request {
  return new Request({
    REQUEST_METHOD: "GET",
    PATH_INFO: "/",
    HTTP_HOST: "localhost",
    ...opts,
  });
}

function makeResponse(): Response {
  return new Response();
}

// ==========================================================================
// controller/render_json_test.rb
// ==========================================================================
describe("RenderJsonTest", () => {
  it("render json nil", async () => {
    class C extends Base {
      async action() {
        this.render({ json: null });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.body).toBe("null");
    expect(c.contentType).toContain("application/json");
  });

  it("render json", async () => {
    class C extends Base {
      async action() {
        this.render({ json: { hello: "world" } });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(JSON.parse(c.body)).toEqual({ hello: "world" });
    expect(c.contentType).toContain("application/json");
  });

  it("render json with status", async () => {
    class C extends Base {
      async action() {
        this.render({ json: { error: "not found" }, status: 404 });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.status).toBe(404);
    expect(JSON.parse(c.body)).toEqual({ error: "not found" });
  });

  it("render json with callback", async () => {
    class C extends Base {
      async action() {
        this.render({ json: { hello: "world" }, callback: "foo" });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.body).toContain("foo(");
    expect(c.body).toContain('"hello"');
    expect(c.contentType).toContain("text/javascript");
  });

  it("render json with invalid callback falls back to json", async () => {
    class C extends Base {
      async action() {
        this.render({ json: { a: 1 }, callback: "foo);alert(1);//" });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.body).not.toContain("alert");
    expect(c.contentType).toContain("application/json");
    expect(JSON.parse(c.body)).toEqual({ a: 1 });
  });

  it("render json with custom content type", async () => {
    class C extends Base {
      async action() {
        this.render({ json: { a: 1 }, contentType: "application/vnd.api+json" });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.contentType).toBe("application/vnd.api+json");
  });

  it("render symbol json", async () => {
    class C extends Base {
      async action() {
        this.render({ json: "raw string" });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.body).toBe("raw string");
  });

  it("render json with render to string", async () => {
    class C extends Base {
      async action() {
        const str = this.renderToString({ json: { key: "value" } });
        this.render({ plain: `rendered: ${str}` });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.body).toContain("rendered:");
    expect(c.body).toContain("key");
  });

  it("render json forwards extra options", async () => {
    class C extends Base {
      async action() {
        this.render({ json: { a: 1 }, status: 201 });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.status).toBe(201);
  });

  it("render json calls to json from object", async () => {
    const obj = {
      toJSON() {
        return { serialized: true };
      },
    };
    class C extends Base {
      async action() {
        this.render({ json: obj });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(JSON.parse(c.body)).toEqual({ serialized: true });
  });

  it("render json avoids view options", async () => {
    class C extends Base {
      async action() {
        this.render({ json: [1, 2, 3] });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(JSON.parse(c.body)).toEqual([1, 2, 3]);
    expect(c.contentType).toContain("application/json");
  });
});
