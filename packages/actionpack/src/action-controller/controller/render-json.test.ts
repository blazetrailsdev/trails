import { describe, it, expect } from "vitest";
import { ToJsonWithActiveSupportEncoder } from "@blazetrails/activesupport";
import { Base } from "../base.js";
import { Request } from "../../action-dispatch/request.js";
import { Response } from "../../action-dispatch/response.js";

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

describe("RenderJsonTest", () => {
  it("render json nil", async () => {
    class C extends Base {
      async action() {
        await this.render({ json: null });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.responseBody).toBe("null");
    expect(c.contentType).toContain("application/json");
  });

  it("render json", async () => {
    class C extends Base {
      async action() {
        await this.render({ json: { hello: "world" } });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(JSON.parse(c.responseBody!)).toEqual({ hello: "world" });
    expect(c.contentType).toContain("application/json");
  });

  it("render json with status", async () => {
    class C extends Base {
      async action() {
        await this.render({ json: { error: "not found" }, status: 404 });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.status).toBe(404);
    expect(JSON.parse(c.responseBody!)).toEqual({ error: "not found" });
  });

  it("render json with callback", async () => {
    class C extends Base {
      async action() {
        await this.render({ json: { hello: "world" }, callback: "foo" });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.responseBody).toContain("foo(");
    expect(c.responseBody).toContain('"hello"');
    expect(c.contentType).toContain("text/javascript");
  });

  it("render json with custom content type", async () => {
    class C extends Base {
      async action() {
        await this.render({ json: { a: 1 }, contentType: "application/vnd.api+json" });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.contentType).toBe("application/vnd.api+json; charset=utf-8");
  });

  it("render symbol json", async () => {
    class C extends Base {
      async action() {
        await this.render({ json: "raw string" });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.responseBody).toBe("raw string");
  });

  it("render json with render to string", async () => {
    class C extends Base {
      async action() {
        const str = await this.renderToString({ json: { key: "value" } });
        await this.render({ plain: `rendered: ${str}` });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.responseBody).toContain("rendered:");
    expect(c.responseBody).toContain("key");
  });

  it("render json forwards extra options", async () => {
    class C extends Base {
      async action() {
        await this.render({ json: { a: 1 }, status: 201 });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.status).toBe(201);
  });

  it("render json calls to json from object", async () => {
    class JsonRenderable {
      asJson(options: { except?: string[] } | null = {}): Record<string, string> {
        const hash: Record<string, string> = { a: "b", c: "d", e: "f" };
        for (const key of options?.except ?? []) delete hash[key];
        return hash;
      }

      toJSON(_options: Record<string, unknown> = {}): unknown {
        return ToJsonWithActiveSupportEncoder.toJSON.call(this, { except: ["c", "e"] });
      }
    }
    class C extends Base {
      async action() {
        await this.render({ json: new JsonRenderable() });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.responseBody).toBe('{"a":"b"}');
  });

  it("render json avoids view options", async () => {
    class C extends Base {
      async action() {
        await this.render({ json: [1, 2, 3] });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(JSON.parse(c.responseBody!)).toEqual([1, 2, 3]);
    expect(c.contentType).toContain("application/json");
  });
});
