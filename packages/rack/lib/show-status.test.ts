import { it, expect } from "vitest";
import type {} from "@blazetrails/vitest-matchers";
import { ShowStatus } from "./show-status.js";
import { Lint } from "./lint.js";
import { MockRequest } from "./mock-request.js";
import { escapeHtml } from "./utils.js";

function showStatus(app: any) {
  return new Lint(new ShowStatus(app));
}

it("provide a default status message", async () => {
  const req = new MockRequest(
    showStatus((_env: Record<string, any>) => [
      404,
      { "content-type": "text/plain", "content-length": "0" },
      [],
    ]),
  );

  const res = await req.get("/", { ":lint": true });
  expect(res.isNotFound).toBeTruthy();
  expect(res).not.toBeEmpty();

  expect(res.get("content-type")).toBe("text/html");
  expect(res.body).toMatch(/404/);
  expect(res.body).toMatch(/Not Found/);
});

it("let the app provide additional information", async () => {
  const req = new MockRequest(
    showStatus((env: Record<string, any>) => {
      env["rack.showstatus.detail"] = "gone too meta.";
      return [404, { "content-type": "text/plain", "content-length": "0" }, []];
    }),
  );

  const res = await req.get("/", { ":lint": true });
  expect(res.isNotFound).toBeTruthy();
  expect(res).not.toBeEmpty();

  expect(res.get("content-type")).toBe("text/html");
  expect(res.body).toMatch(/404/);
  expect(res.body).toMatch(/Not Found/);
  expect(res.body).toMatch(/too meta/);
});

it("let the app provide additional information with non-String details", async () => {
  const req = new MockRequest(
    showStatus((env: Record<string, any>) => {
      env["rack.showstatus.detail"] = ["gone too meta."];
      return [404, { "content-type": "text/plain", "content-length": "0" }, []];
    }),
  );

  const res = await req.get("/", { ":lint": true });
  expect(res.isNotFound).toBeTruthy();
  expect(res).not.toBeEmpty();

  expect(res.get("content-type")).toBe("text/html");
  expect(res.body).toContain("404");
  expect(res.body).toContain("Not Found");
  expect(res.body).toContain("[&quot;gone too meta.&quot;]");
});

it("escape error", async () => {
  const detail = "<script>alert('hi \"')</script>";
  const req = new MockRequest(
    showStatus((env: Record<string, any>) => {
      env["rack.showstatus.detail"] = detail;
      return [500, { "content-type": "text/plain", "content-length": "0" }, []];
    }),
  );

  const res = await req.get("/", { ":lint": true });
  expect(res).not.toBeEmpty();

  expect(res.get("content-type")).toBe("text/html");
  expect(res.body).toMatch(/500/);
  expect(Object.keys(res.headers)).not.toContain(detail);
  expect(res.body).toContain(escapeHtml(detail));
});

it("not replace existing messages", async () => {
  const req = new MockRequest(
    showStatus((_env: Record<string, any>) => [
      404,
      { "content-type": "text/plain", "content-length": "4" },
      ["foo!"],
    ]),
  );

  const res = await req.get("/", { ":lint": true });
  expect(res.isNotFound).toBeTruthy();

  expect(res.body).toBe("foo!");
});

it("pass on original headers", async () => {
  const headers = { "www-authenticate": "Basic blah" };

  const req = new MockRequest(showStatus((_env: Record<string, any>) => [401, headers, []]));
  const res = await req.get("/", { ":lint": true });

  expect(res.get("www-authenticate")).toBe("Basic blah");
});

it("replace existing messages if there is detail", async () => {
  const req = new MockRequest(
    showStatus((env: Record<string, any>) => {
      env["rack.showstatus.detail"] = "gone too meta.";
      return [404, { "content-type": "text/plain", "content-length": "4" }, ["foo!"]];
    }),
  );

  const res = await req.get("/", { ":lint": true });
  expect(res.isNotFound).toBeTruthy();
  expect(res).not.toBeEmpty();

  expect(res.get("content-type")).toBe("text/html");
  expect(res.get("content-length")).not.toBe("4");
  expect(res.body).toMatch(/404/);
  expect(res.body).toMatch(/too meta/);
  expect(res.body).not.toMatch(/foo/);
});

it("close the original body", async () => {
  let closed = false;

  const body = {
    each(block: (chunk: string) => void) {
      block("s");
    },
    close() {
      closed = true;
    },
  };

  const req = new MockRequest(
    showStatus((_env: Record<string, any>) => [
      404,
      { "content-type": "text/plain", "content-length": "0" },
      body,
    ]),
  );

  await req.get("/", { ":lint": true });
  expect(closed).toBe(true);
});
