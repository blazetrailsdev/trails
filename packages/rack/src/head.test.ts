import { describe, it, expect } from "vitest";
import { Head } from "./head.js";
import { MockRequest } from "./mock-request.js";

describe("Rack::Head", () => {
  function testResponse(headers: Record<string, any> = {}) {
    let closed = false;
    const body = ["foo"];
    (body as any).close = () => { closed = true; };
    const app = async () => [200, { "content-type": "test/plain", "content-length": "3" }, body] as any;
    const env = MockRequest.envFor("/", headers);
    const head = new Head(app);
    return { promise: head.call(env), body, getClosed: () => closed };
  }

  it("pass GET, POST, PUT, DELETE, OPTIONS, TRACE requests", async () => {
    for (const type of ["GET", "POST", "PUT", "DELETE", "OPTIONS", "TRACE"]) {
      const { promise } = testResponse({ REQUEST_METHOD: type });
      const resp = await promise;
      expect(resp[0]).toBe(200);
      expect(resp[1]).toEqual({ "content-type": "test/plain", "content-length": "3" });
      expect([...resp[2]]).toEqual(["foo"]);
    }
  });

  it("remove body from HEAD requests", async () => {
    const { promise } = testResponse({ REQUEST_METHOD: "HEAD" });
    const resp = await promise;
    expect(resp[0]).toBe(200);
    expect(resp[1]).toEqual({ "content-type": "test/plain", "content-length": "3" });
    expect([...resp[2]]).toEqual([]);
  });

  it("close the body when it is removed", async () => {
    const { promise, getClosed } = testResponse({ REQUEST_METHOD: "HEAD" });
    const resp = await promise;
    expect(resp[0]).toBe(200);
    expect(resp[2]).toEqual([]);
    expect(getClosed()).toBe(true);
  });
});
