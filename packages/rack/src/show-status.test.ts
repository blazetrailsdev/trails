import { it, expect } from "vitest";
import { ShowStatus } from "./show-status.js";
import { MockRequest } from "./mock-request.js";
import { escapeHtml } from "./utils.js";

function showStatus(app: any) {
  return new ShowStatus(app);
}

it("provide a default status message", async () => {
  const req = new MockRequest((env) =>
    showStatus(
      async () => [404, { "content-type": "text/plain", "content-length": "0" }, []] as any,
    ).call(env),
  );
  const res = await req.get("/");
  expect(res.status).toBe(404);
  expect(res.body.length).toBeGreaterThan(0);
  expect(res.headers["content-type"]).toBe("text/html");
  expect(res.body).toMatch(/404/);
  expect(res.body).toMatch(/Not Found/);
});

it("let the app provide additional information", async () => {
  const req = new MockRequest((env) =>
    showStatus(async (e: any) => {
      e["rack.showstatus.detail"] = "gone too meta.";
      return [404, { "content-type": "text/plain", "content-length": "0" }, []] as any;
    }).call(env),
  );
  const res = await req.get("/");
  expect(res.status).toBe(404);
  expect(res.headers["content-type"]).toBe("text/html");
  expect(res.body).toMatch(/404/);
  expect(res.body).toMatch(/Not Found/);
  expect(res.body).toMatch(/too meta/);
});

it("let the app provide additional information with non-String details", async () => {
  const req = new MockRequest((env) =>
    showStatus(async (e: any) => {
      e["rack.showstatus.detail"] = ["gone too meta."];
      return [404, { "content-type": "text/plain", "content-length": "0" }, []] as any;
    }).call(env),
  );
  const res = await req.get("/");
  expect(res.status).toBe(404);
  expect(res.headers["content-type"]).toBe("text/html");
  expect(res.body).toContain("404");
  expect(res.body).toContain("Not Found");
  expect(res.body).toContain("gone too meta.");
});

it("escape error", async () => {
  const detail = "<script>alert('hi \"')</script>";
  const req = new MockRequest((env) =>
    showStatus(async (e: any) => {
      e["rack.showstatus.detail"] = detail;
      return [500, { "content-type": "text/plain", "content-length": "0" }, []] as any;
    }).call(env),
  );
  const res = await req.get("/");
  expect(res.headers["content-type"]).toBe("text/html");
  expect(res.body).toMatch(/500/);
  expect(res.body).not.toContain(detail);
  expect(res.body).toContain(escapeHtml(detail));
});

it("not replace existing messages", async () => {
  const req = new MockRequest((env) =>
    showStatus(
      async () => [404, { "content-type": "text/plain", "content-length": "4" }, ["foo!"]] as any,
    ).call(env),
  );
  const res = await req.get("/");
  expect(res.status).toBe(404);
  expect(res.body).toBe("foo!");
});

it("pass on original headers", async () => {
  const req = new MockRequest((env) =>
    showStatus(async () => [401, { "www-authenticate": "Basic blah" }, []] as any).call(env),
  );
  const res = await req.get("/");
  expect(res.headers["www-authenticate"]).toBe("Basic blah");
});

it("replace existing messages if there is detail", async () => {
  const req = new MockRequest((env) =>
    showStatus(async (e: any) => {
      e["rack.showstatus.detail"] = "gone too meta.";
      return [404, { "content-type": "text/plain", "content-length": "4" }, ["foo!"]] as any;
    }).call(env),
  );
  const res = await req.get("/");
  expect(res.status).toBe(404);
  expect(res.headers["content-type"]).toBe("text/html");
  expect(res.headers["content-length"]).not.toBe("4");
  expect(res.body).toMatch(/404/);
  expect(res.body).toMatch(/too meta/);
  expect(res.body).not.toMatch(/foo/);
});

it("close the original body", async () => {
  let closed = false;
  const body = {
    forEach(fn: any) {
      fn("s");
    },
    close() {
      closed = true;
    },
  };
  const req = new MockRequest((env) =>
    showStatus(
      async () => [404, { "content-type": "text/plain", "content-length": "0" }, body] as any,
    ).call(env),
  );

  await req.get("/");
  expect(closed).toBe(true);
});
