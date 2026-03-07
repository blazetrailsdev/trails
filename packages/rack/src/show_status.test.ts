import { describe, it, expect } from "vitest";
import { ShowStatus } from "./show-status.js";
import { MockRequest } from "./mock-request.js";
import { escapeHtml } from "./utils.js";

describe("Rack::ShowStatus", () => {
  function showStatus(app: any) {
    return new ShowStatus(app);
  }

  it("provide a default status message", async () => {
    const req = new MockRequest((env) => showStatus(async () =>
      [404, { "content-type": "text/plain", "content-length": "0" }, []] as any
    ).call(env));
    const res = await req.get("/");
    expect(res.status).toBe(404);
    expect(res.bodyString.length).toBeGreaterThan(0);
    expect(res.headers["content-type"]).toBe("text/html");
    expect(res.bodyString).toMatch(/404/);
    expect(res.bodyString).toMatch(/Not Found/);
  });

  it("let the app provide additional information", async () => {
    const req = new MockRequest((env) => showStatus(async (e: any) => {
      e["rack.showstatus.detail"] = "gone too meta.";
      return [404, { "content-type": "text/plain", "content-length": "0" }, []] as any;
    }).call(env));
    const res = await req.get("/");
    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toBe("text/html");
    expect(res.bodyString).toMatch(/404/);
    expect(res.bodyString).toMatch(/Not Found/);
    expect(res.bodyString).toMatch(/too meta/);
  });

  it("let the app provide additional information with non-String details", async () => {
    const req = new MockRequest((env) => showStatus(async (e: any) => {
      e["rack.showstatus.detail"] = ['gone too meta.'];
      return [404, { "content-type": "text/plain", "content-length": "0" }, []] as any;
    }).call(env));
    const res = await req.get("/");
    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toBe("text/html");
    expect(res.bodyString).toContain("404");
    expect(res.bodyString).toContain("Not Found");
    // JS toString of array: "gone too meta."
    expect(res.bodyString).toContain("gone too meta.");
  });

  it("escape error", async () => {
    const detail = "<script>alert('hi \"')</script>";
    const req = new MockRequest((env) => showStatus(async (e: any) => {
      e["rack.showstatus.detail"] = detail;
      return [500, { "content-type": "text/plain", "content-length": "0" }, []] as any;
    }).call(env));
    const res = await req.get("/");
    expect(res.headers["content-type"]).toBe("text/html");
    expect(res.bodyString).toMatch(/500/);
    expect(res.bodyString).not.toContain(detail);
    expect(res.bodyString).toContain(escapeHtml(detail));
  });

  it("not replace existing messages", async () => {
    const req = new MockRequest((env) => showStatus(async () =>
      [404, { "content-type": "text/plain", "content-length": "4" }, ["foo!"]] as any
    ).call(env));
    const res = await req.get("/");
    expect(res.status).toBe(404);
    expect(res.bodyString).toBe("foo!");
  });

  it("pass on original headers", async () => {
    const req = new MockRequest((env) => showStatus(async () =>
      [401, { "www-authenticate": "Basic blah" }, []] as any
    ).call(env));
    const res = await req.get("/");
    expect(res.headers["www-authenticate"]).toBe("Basic blah");
  });

  it("replace existing messages if there is detail", async () => {
    const req = new MockRequest((env) => showStatus(async (e: any) => {
      e["rack.showstatus.detail"] = "gone too meta.";
      return [404, { "content-type": "text/plain", "content-length": "4" }, ["foo!"]] as any;
    }).call(env));
    const res = await req.get("/");
    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toBe("text/html");
    expect(res.headers["content-length"]).not.toBe("4");
    expect(res.bodyString).toMatch(/404/);
    expect(res.bodyString).toMatch(/too meta/);
    expect(res.bodyString).not.toMatch(/foo/);
  });

  it("close the original body", async () => {
    let closed = false;
    const body = {
      forEach(fn: any) { fn("s"); },
      close() { closed = true; },
    };
    const app = new ShowStatus(async () =>
      [404, { "content-type": "text/plain", "content-length": "0" }, body] as any
    );
    await app.call(MockRequest.envFor("/"));
    expect(closed).toBe(true);
  });
});
