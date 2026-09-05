import { describe, it, expect } from "vitest";
import { Metal } from "../metal.js";
import { Request } from "../../action-dispatch/request.js";
import { Response } from "../../action-dispatch/response.js";
import { Parameters } from "../metal/strong-parameters.js";

function makeRequest(opts: Record<string, string> = {}): Request {
  return new Request({
    REQUEST_METHOD: opts.method ?? "GET",
    PATH_INFO: opts.path ?? "/",
    HTTP_HOST: opts.host ?? "localhost",
    ...opts,
  });
}

function makeResponse(): Response {
  return new Response();
}

describe("MetalControllerInstanceTests", () => {
  it("has default status 200", () => {
    class TestController extends Metal {
      async index() {}
    }
    const c = new TestController();
    c.setResponseBang(makeResponse());
    expect(c.status).toBe(200);
  });

  it("can set status with number", () => {
    const c = new (class extends Metal {})();
    c.setResponseBang(makeResponse());
    c.status = 404;
    expect(c.status).toBe(404);
  });

  it("can set status with symbol string", () => {
    const c = new (class extends Metal {})();
    c.setResponseBang(makeResponse());
    c.status = "not_found";
    expect(c.status).toBe(404);
  });

  it("throws on unknown status symbol", () => {
    const c = new (class extends Metal {})();
    c.setResponseBang(makeResponse());
    expect(() => {
      c.status = "bogus";
    }).toThrow("Unrecognized status code :bogus");
  });

  it("can set and get headers", () => {
    const c = new (class extends Metal {})();
    c.setResponseBang(makeResponse());
    c.setHeader("X-Custom", "value");
    expect(c.getHeader("x-custom")).toBe("value");
  });

  it("headers are case-insensitive", () => {
    const c = new (class extends Metal {})();
    c.setResponseBang(makeResponse());
    c.setHeader("Content-Type", "text/html");
    expect(c.getHeader("content-type")).toBe("text/html");
  });

  it("can set and get body", () => {
    const c = new (class extends Metal {})();
    c.setResponseBang(makeResponse());
    c.body = "hello";
    expect(c.body).toBe("hello");
  });

  it("can set and get content type", () => {
    const c = new (class extends Metal {})();
    c.setResponseBang(makeResponse());
    c.contentType = "application/json";
    expect(c.contentType).toBe("application/json; charset=utf-8");
  });

  it("content type is null by default", () => {
    const c = new (class extends Metal {})();
    c.setResponseBang(makeResponse());
    expect(c.contentType).toBeNull();
  });

  it("head sets status and empty body and marks performed", () => {
    const c = new (class extends Metal {})();
    c.setResponseBang(makeResponse());
    c.head(204);
    expect(c.status).toBe(204);
    expect(c.body).toBe("");
    expect(c.performed).toBe(true);
  });

  it("head with symbol", () => {
    const c = new (class extends Metal {})();
    c.setResponseBang(makeResponse());
    c.head("no_content");
    expect(c.status).toBe(204);
  });

  it("head throws on unknown symbol", () => {
    const c = new (class extends Metal {})();
    c.setResponseBang(makeResponse());
    expect(() => {
      c.head("bogus");
    }).toThrow("Unrecognized status code :bogus");
  });

  it("resolveStatus with number returns number", () => {
    expect(Metal.resolveStatus(200)).toBe(200);
  });

  it("resolveStatus with symbol returns code", () => {
    expect(Metal.resolveStatus("ok")).toBe(200);
    expect(Metal.resolveStatus("created")).toBe(201);
    expect(Metal.resolveStatus("not_found")).toBe(404);
    expect(Metal.resolveStatus("internal_server_error")).toBe(500);
  });

  it("resolveStatus with unknown symbol returns 500", () => {
    expect(Metal.resolveStatus("unknown")).toBe(500);
  });

  it("dispatch sets request and response", async () => {
    class TestController extends Metal {
      async index() {
        this.body = "dispatched";
        this.contentType = "text/plain";
      }
    }
    const c = new TestController();
    const req = makeRequest();
    const res = makeResponse();
    await c.dispatch("index", req, res);
    expect(c.request).toBe(req);
    expect(c.response).toBe(res);
  });

  it("dispatch exposes controller via action_controller.instance env slot", async () => {
    class TestController extends Metal {
      async index() {
        this.body = "ok";
      }
    }
    const c = new TestController();
    const req = makeRequest();
    await c.dispatch("index", req, makeResponse());
    expect(req.controllerInstance).toBe(c);
    expect(req.env["action_controller.instance"]).toBe(c);
  });

  it("dispatch commits status to response", async () => {
    class TestController extends Metal {
      async index() {
        this.status = 201;
        this.body = "created";
      }
    }
    const c = new TestController();
    const res = makeResponse();
    await c.dispatch("index", makeRequest(), res);
    expect(res.status).toBe(201);
  });

  it("dispatch commits headers to response", async () => {
    class TestController extends Metal {
      async index() {
        this.setHeader("x-custom", "test");
        this.body = "ok";
      }
    }
    const c = new TestController();
    const res = makeResponse();
    await c.dispatch("index", makeRequest(), res);
    expect(res.getHeader("x-custom")).toBe("test");
  });

  it("dispatch commits content type to response", async () => {
    class TestController extends Metal {
      async index() {
        this.contentType = "application/json";
        this.body = "{}";
      }
    }
    const c = new TestController();
    const res = makeResponse();
    await c.dispatch("index", makeRequest(), res);
    expect(res.getHeader("content-type")).toBe("application/json; charset=utf-8");
  });

  it("dispatch commits body to response", async () => {
    class TestController extends Metal {
      async index() {
        this.body = "hello world";
      }
    }
    const c = new TestController();
    const res = makeResponse();
    await c.dispatch("index", makeRequest(), res);
    expect(res.body).toBe("hello world");
  });

  it("dispatch sets params from request", async () => {
    class TestController extends Metal {
      receivedParams: any;
      async index() {
        this.receivedParams = this.params;
      }
    }
    const req = makeRequest();
    (req as any).parameters = new Parameters({ id: "42" });
    const c = new TestController();
    await c.dispatch("index", req, makeResponse());
    expect(c.receivedParams.get("id")).toBe("42");
  });

  it("params default to empty Parameters", () => {
    const c = new (class extends Metal {})();
    c.setResponseBang(makeResponse());
    expect(c.params).toBeInstanceOf(Parameters);
  });

  it("toRackResponse returns [status, headers, body]", () => {
    const c = new (class extends Metal {})();
    c.setResponseBang(makeResponse());
    c.status = 200;
    c.setHeader("x-test", "val");
    c.contentType = "text/plain";
    c.body = "hello";
    const [status, headers] = c.toRackResponse();
    expect(status).toBe(200);
    expect(headers["x-test"]).toBe("val");
    expect(headers["content-type"]).toBe("text/plain; charset=utf-8");
  });

  it("all status codes resolve correctly", () => {
    const expected: Record<string, number> = {
      ok: 200,
      created: 201,
      accepted: 202,
      no_content: 204,
      moved_permanently: 301,
      found: 302,
      see_other: 303,
      not_modified: 304,
      bad_request: 400,
      unauthorized: 401,
      forbidden: 403,
      not_found: 404,
      method_not_allowed: 405,
      not_acceptable: 406,
      conflict: 409,
      gone: 410,
      unprocessable_entity: 422,
      too_many_requests: 429,
      internal_server_error: 500,
      not_implemented: 501,
      bad_gateway: 502,
      service_unavailable: 503,
    };
    for (const [sym, code] of Object.entries(expected)) {
      expect(Metal.resolveStatus(sym)).toBe(code);
    }
  });

  it("responseBody= writes through to response and marks performed", () => {
    const c = new (class extends Metal {})();
    c.setResponseBang(makeResponse());
    c.responseBody = "hello";
    expect(c.responseBody).toBe("hello");
    expect(c.response.body).toBe("hello");
    expect(c.performed).toBe(true);
  });

  it("responseBody= accepts array form", () => {
    const c = new (class extends Metal {})();
    c.setResponseBang(makeResponse());
    c.responseBody = ["a", "b"];
    expect(c.responseBody).toBe("ab");
  });

  it("responseBody= with null resets body", () => {
    const c = new (class extends Metal {})();
    c.setResponseBang(makeResponse());
    c.responseBody = "hi";
    c.responseBody = null;
    expect(c.response.body).toBe("");
  });

  it("isPerformed mirrors performed and reflects responseBody=", () => {
    const c = new (class extends Metal {})();
    c.setResponseBang(makeResponse());
    expect(c.performed).toBe(false);
    c.setResponseBang(makeResponse());
    c.responseBody = "x";
    expect(c.performed).toBe(true);
    expect(c.performed).toBe(true);
  });

  it("callbacks work through dispatch", async () => {
    const log: string[] = [];
    class CallbackController extends Metal {
      async index() {
        log.push("action");
      }
    }
    CallbackController.beforeAction(() => {
      log.push("before");
    });
    CallbackController.afterAction(() => {
      log.push("after");
    });

    const c = new CallbackController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(log).toEqual(["before", "action", "after"]);
  });
});
