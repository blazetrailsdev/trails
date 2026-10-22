import { it, expect } from "vitest";
import type {} from "@blazetrails/vitest-matchers";
import { File, RuntimeError, StringIO } from "@blazetrails/ruby-compat";
import { Cascade } from "./cascade.js";
import { Files } from "./files.js";
import { Lint } from "./lint.js";
import { MockRequest } from "./mock-request.js";
import { URLMap } from "./urlmap.js";

function cascade(...args: ConstructorParameters<typeof Cascade>) {
  return new Lint(new Cascade(...args));
}

const docroot = File.expandPath(File.join(__dirname, "..", "test"));
const app1: any = new Files(docroot);

const app2: any = new URLMap({
  "/crash": (_env: Record<string, any>) => {
    throw new RuntimeError("boom");
  },
});

const app3: any = new URLMap({
  "/foo": (_env: Record<string, any>) => [200, { "content-type": "text/plain" }, [""]],
});

it("dispatch onward on 404 and 405 by default", async () => {
  const c = cascade([app1, app2, app3]);
  expect((await new MockRequest(c).get("/cgi/test")).isOk).toBeTruthy();
  expect((await new MockRequest(c).get("/foo")).isOk).toBeTruthy();
  expect((await new MockRequest(c).get("/toobad")).isNotFound).toBeTruthy();
  expect((await new MockRequest(c).get("/cgi/../..")).isClientError).toBeTruthy();

  expect((await new MockRequest(c).put("/foo")).isOk).toBeTruthy();
});

it("dispatch onward on whatever is passed", async () => {
  const c = cascade([app1, app2, app3], [404, 403]);
  expect((await new MockRequest(c).get("/cgi/../bla")).isNotFound).toBeTruthy();
});

it("include? returns whether app is included", () => {
  const c = new Cascade([app1, app2]);
  expect(c.isInclude(app1)).toBe(true);
  expect(c.isInclude(app2)).toBe(true);
  expect(c.isInclude(app3)).toBe(false);
});

it("return 404 if empty", async () => {
  expect((await new MockRequest(cascade([])).get("/")).isNotFound).toBeTruthy();
});

it("uses new response object if empty", async () => {
  const app = new Cascade([]);
  let res: any = await app.call("/" as any);
  let [s, h, body] = res;
  expect(s).toBe(404);
  expect(h["content-type"]).toBe("text/plain");
  expect(body).toBeEmpty();

  res[0] = 200;
  h["content-type"] = "text/html";
  body.push("a");

  res = await app.call("/" as any);
  [s, h, body] = res;
  expect(s).toBe(404);
  expect(h["content-type"]).toBe("text/plain");
  expect(body).toBeEmpty();
});

it("returns final response if all responses are cascaded", async () => {
  const app = new Cascade([]);
  app.add((_env: Record<string, any>) => [405, {}, []]);
  expect((await app.call({}))[0]).toBe(405);
});

it("append new app", async () => {
  const c = new Cascade([], [404, 403]);
  expect((await new MockRequest(c).get("/")).isNotFound).toBeTruthy();
  c.add(app2);
  expect((await new MockRequest(c).get("/cgi/test")).isNotFound).toBeTruthy();
  expect((await new MockRequest(c).get("/cgi/../bla")).isNotFound).toBeTruthy();
  c.add(app1);
  expect((await new MockRequest(c).get("/cgi/test")).isOk).toBeTruthy();
  expect((await new MockRequest(c).get("/cgi/../..")).isClientError).toBeTruthy();
  expect((await new MockRequest(c).get("/foo")).isNotFound).toBeTruthy();
  c.add(app3);
  expect((await new MockRequest(c).get("/foo")).isOk).toBeTruthy();
});

it("close the body on cascade", async () => {
  const body = new StringIO();
  const closer: any = (_env: Record<string, any>) => [404, {}, body];
  const c = new Cascade([closer, app3], [404]);
  expect((await new MockRequest(c).get("/foo")).isOk).toBeTruthy();
  expect(body.closed).toBeTruthy();
});
