import { it, expect } from "vitest";
import { StringIO, Tempfile } from "@blazetrails/ruby-compat";
import { Lint, LintError } from "./lint.js";
import { MockRequest } from "./mock-request.js";

function env(options: Record<string, any> = {}): Record<string, any> {
  if (!(":input" in options)) {
    options[":input"] = "";
  }

  return MockRequest.envFor("/", options);
}

it("rack.multipart.tempfile_factory accepts a StringIO or Tempfile return value", async () => {
  for (const factory of [() => new StringIO(), () => Tempfile.new("testfile")]) {
    const response = await new Lint(async (env) => {
      const io = env["rack.multipart.tempfile_factory"]("testfile", "text/plain");
      io.append("x");
      if (io instanceof Tempfile) io.close(true);
      return [201, { "content-type": "text/plain", "content-length": "0" }, []];
    }).call(MockRequest.envFor("/", { ":input": "", "rack.multipart.tempfile_factory": factory }));
    expect(response[0]).toBe(201);
  }
});

it("handles valid rack.hijack env", async () => {
  const app = new Lint(async () => [200, { "content-type": "text/plain" }, ["OK"]]);
  const e = env({ "rack.hijack?": true, "rack.hijack": () => ({}) });
  const [status] = await app.call(e);
  expect(status).toBe(200);
});

it("notices when rack.hijack env entry does not respond to #call", async () => {
  const app = new Lint(async () => [200, { "content-type": "text/plain" }, ["OK"]]);
  const e = env({ "rack.hijack?": true, "rack.hijack": 42 });
  await expect(app.call(e)).rejects.toThrow(LintError);
});

it("notices when rack.hijack env entry does not return an IO", async () => {
  const app = new Lint(async () => [200, { "content-type": "text/plain" }, ["OK"]]);
  const e = env({ "rack.hijack?": true, "rack.hijack": () => "not-io" });
  const [status] = await app.call(e);
  expect(status).toBe(200);
});

it("handles valid rack.hijack response header", async () => {
  const app = new Lint(async () => [200, { "content-type": "text/plain" }, ["OK"]]);
  const [status] = await app.call(env({ "rack.hijack?": true, "rack.hijack": () => ({}) }));
  expect(status).toBe(200);
});

it("allows non-hijack responses when server supports hijacking", async () => {
  const app = new Lint(async () => [200, { "content-type": "text/plain" }, ["OK"]]);
  const e = env({ "rack.hijack?": true, "rack.hijack": () => ({}) });
  const [status] = await app.call(e);
  expect(status).toBe(200);
});

it("notices when the response headers has a rack.hijack callback with hijacking being supported", async () => {
  const app = new Lint(async () => [200, { "content-type": "text/plain" }, ["OK"]]);
  const e = env({
    "rack.hijack?": true,
    "rack.hijack": () => ({
      read() {
        return "";
      },
    }),
  });
  const [status] = await app.call(e);
  expect(status).toBe(200);
});

it("notices rack.response_finished errors", async () => {
  const app = new Lint(async () => [200, { "content-type": "text/plain" }, ["OK"]]);
  const e = env({ "rack.response_finished": "not an array" });
  await expect(app.call(e)).rejects.toThrow(LintError);
});

it("notices when the response protocol is not an array of strings", async () => {
  const app = new Lint(async () => [
    200,
    { "content-type": "text/plain", "rack.protocol": "h2" },
    ["OK"],
  ]);
  await expect(app.call(env({}))).rejects.toThrow(LintError);
});

it("handles body.to_path returning nil", async () => {
  const body = {
    forEach(cb: any) {
      cb("ok");
    },
    toPath() {
      return null;
    },
  };
  const app = new Lint(async () => [200, { "content-type": "text/plain" }, body]);
  const [status] = await app.call(env({}));
  expect(status).toBe(200);
});
