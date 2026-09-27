import { describe, it, expect } from "vitest";
import { Metal } from "../metal.js";
import { Request } from "../../action-dispatch/request.js";
import { Response } from "../../action-dispatch/response.js";
import { Parameters } from "../metal/strong-parameters.js";

function makeRequest(): Request {
  return new Request({ REQUEST_METHOD: "GET", PATH_INFO: "/", HTTP_HOST: "localhost" });
}

function makeResponse(): Response {
  return new Response();
}

describe("Metal#params", () => {
  it("params memoizes request.parameters on first read", () => {
    const c = new (class extends Metal {})();
    const req = makeRequest();
    (req as any).parameters = { id: "1" };
    c.setRequestBang(req);
    const first = c.params;
    (req as any).parameters = { id: "2" };
    expect(c.params).toBe(first);
    expect(first).toEqual({ id: "1" });
  });

  it("params assigned before dispatch survive it", async () => {
    class TestController extends Metal {
      receivedParams: any;
      async index() {
        this.receivedParams = this.params;
      }
    }
    const req = makeRequest();
    (req as any).parameters = { id: "42" };
    const c = new TestController();
    const assigned = new Parameters({ id: "7" });
    c.params = assigned;
    await c.dispatch("index", req, makeResponse());
    expect(c.receivedParams).toBe(assigned);
  });
});
