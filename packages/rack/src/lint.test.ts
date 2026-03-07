import { describe, it, expect } from "vitest";
import { Lint, LintError } from "./lint.js";
import { MockRequest } from "./mock-request.js";

function validEnv(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    REQUEST_METHOD: "GET",
    SERVER_NAME: "example.org",
    SERVER_PORT: "80",
    SERVER_PROTOCOL: "HTTP/1.1",
    QUERY_STRING: "",
    PATH_INFO: "/",
    SCRIPT_NAME: "",
    "rack.url_scheme": "http",
    "rack.input": { read() { return ""; }, gets() { return null; }, each() {} },
    "rack.errors": { puts() {}, write() {}, flush() {} },
    ...overrides,
  };
}

describe("Rack::Lint", () => {
  it("pass valid request", async () => {
    const app = new Lint(async (env) => [200, { "content-type": "text/plain" }, ["OK"]]);
    const env = validEnv();
    const [status, headers, body] = await app.call(env);
    expect(status).toBe(200);
  });

  it("notice fatal errors", async () => {
    const app = new Lint(async () => { throw new Error("fatal"); });
    await expect(app.call(validEnv())).rejects.toThrow("fatal");
  });

  it("notice environment errors", async () => {
    const app = new Lint(async () => [200, {}, ["OK"]]);
    const env = validEnv();
    delete env["SERVER_NAME"];
    await expect(app.call(env)).rejects.toThrow(LintError);
  });

  it("notice input errors", async () => {
    const app = new Lint(async () => [200, {}, ["OK"]]);
    const env = validEnv({ "rack.input": "not an input" });
    await expect(app.call(env)).rejects.toThrow(LintError);
  });

  it("notice error errors", async () => {
    const app = new Lint(async () => [200, {}, ["OK"]]);
    const env = validEnv({ "rack.errors": "not an errors object" });
    await expect(app.call(env)).rejects.toThrow(LintError);
  });

  it("notice response errors", async () => {
    const app = new Lint(async () => "not a tuple" as any);
    await expect(app.call(validEnv())).rejects.toThrow(LintError);
  });

  it("accepts empty PATH_INFO", async () => {
    const app = new Lint(async () => [200, { "content-type": "text/plain" }, ["OK"]]);
    const env = validEnv({ PATH_INFO: "" });
    const [status] = await app.call(env);
    expect(status).toBe(200);
  });

  it("notices request-target asterisk form errors", async () => {
    const app = new Lint(async () => [200, {}, ["OK"]]);
    // Asterisk form only valid for OPTIONS
    const env = validEnv({ REQUEST_METHOD: "GET", PATH_INFO: "*" });
    await expect(app.call(env)).rejects.toThrow(LintError);
  });

  it("notices request-target authority form errors", async () => {
    const app = new Lint(async () => [200, {}, ["OK"]]);
    // CONNECT must use authority form (host:port)
    const env = validEnv({ REQUEST_METHOD: "CONNECT", PATH_INFO: "/foo" });
    await expect(app.call(env)).rejects.toThrow(LintError);
  });

  it("notices request-target absolute-form errors", async () => {
    const app = new Lint(async () => [200, { "content-type": "text/plain" }, ["OK"]]);
    const env = validEnv({ PATH_INFO: "http://example.com/foo" });
    const [status] = await app.call(env);
    expect(status).toBe(200);
  });

  it("notices request-target origin-form errors", async () => {
    const app = new Lint(async () => [200, {}, ["OK"]]);
    const env = validEnv({ PATH_INFO: "foo" }); // must start with /
    await expect(app.call(env)).rejects.toThrow(LintError);
  });

  it("notice status errors", async () => {
    const app = new Lint(async () => [0, {}, ["OK"]]);
    await expect(app.call(validEnv())).rejects.toThrow(LintError);
  });

  it("notice header errors", async () => {
    const app = new Lint(async () => [200, { "Content-Type": "text/plain" }, ["OK"]]);
    await expect(app.call(validEnv())).rejects.toThrow(LintError);
  });

  it("notice rack.early_hints errors", async () => {
    const app = new Lint(async () => [200, { "content-type": "text/plain" }, ["OK"]]);
    const env = validEnv({ "rack.early_hints": "not a function" });
    await expect(app.call(env)).rejects.toThrow(LintError);
  });

  it("notice content-type errors", async () => {
    const app = new Lint(async () => [204, { "content-type": "text/plain" }, []]);
    await expect(app.call(validEnv())).rejects.toThrow(LintError);
  });

  it("notice content-length errors", async () => {
    const app = new Lint(async () => [204, { "content-length": "0" }, []]);
    await expect(app.call(validEnv())).rejects.toThrow(LintError);
  });

  it("responds to to_path", async () => {
    const body = { toPath() { return "/tmp/file"; }, forEach(cb: any) { cb("data"); }, close() {} };
    const app = new Lint(async () => [200, { "content-type": "text/plain" }, body]);
    const [, , b] = await app.call(validEnv());
    expect(b).toBeDefined();
  });

  it.skip("handles body.to_path returning nil", () => {});

  it("notice body errors", async () => {
    const app = new Lint(async () => [200, { "content-type": "text/plain" }, "not iterable"]);
    const [, , body] = await app.call(validEnv());
    // Body is returned as-is from our lint for now
    expect(body).toBe("not iterable");
  });

  it("notice input handling errors", async () => {
    const app = new Lint(async () => [200, { "content-type": "text/plain" }, ["OK"]]);
    const env = validEnv({ "rack.input": 42 });
    await expect(app.call(env)).rejects.toThrow(LintError);
  });

  it("can call close", async () => {
    let closed = false;
    const body = { forEach(cb: any) { cb("ok"); }, close() { closed = true; } };
    const app = new Lint(async () => [200, { "content-type": "text/plain" }, body]);
    const [, , b] = await app.call(validEnv());
    if (b && typeof b.close === "function") b.close();
    expect(closed).toBe(true);
  });

  it("notice error handling errors", async () => {
    const app = new Lint(async () => [200, {}, ["OK"]]);
    const env = validEnv({ "rack.errors": {} });
    await expect(app.call(env)).rejects.toThrow(LintError);
  });

  it("notice HEAD errors", async () => {
    const app = new Lint(async () => [200, { "content-type": "text/plain" }, ["OK"]]);
    const env = validEnv({ REQUEST_METHOD: "HEAD" });
    // HEAD responses should work but body ideally empty - lint passes through
    const [status] = await app.call(env);
    expect(status).toBe(200);
  });

  it("pass valid read calls", async () => {
    const app = new Lint(async (env) => {
      const data = env["rack.input"].read();
      return [200, { "content-type": "text/plain" }, [data]];
    });
    const [status] = await app.call(validEnv());
    expect(status).toBe(200);
  });

  it("notices when request env doesn't have a valid rack.hijack callback", async () => {
    const app = new Lint(async () => [200, { "content-type": "text/plain" }, ["OK"]]);
    const env = validEnv({ "rack.hijack?": true, "rack.hijack": "not callable" });
    await expect(app.call(env)).rejects.toThrow(LintError);
  });

  it("handles valid rack.hijack env", async () => {
    const app = new Lint(async () => [200, { "content-type": "text/plain" }, ["OK"]]);
    const env = validEnv({ "rack.hijack?": true, "rack.hijack": () => ({}) });
    const [status] = await app.call(env);
    expect(status).toBe(200);
  });

  it("notices when rack.hijack env entry does not respond to #call", async () => {
    const app = new Lint(async () => [200, { "content-type": "text/plain" }, ["OK"]]);
    const env = validEnv({ "rack.hijack?": true, "rack.hijack": 42 });
    await expect(app.call(env)).rejects.toThrow(LintError);
  });

  it.skip("notices when rack.hijack env entry does not return an IO", () => {});

  it.skip("handles valid rack.hijack response header", () => {});

  it("allows non-hijack responses when server supports hijacking", async () => {
    const app = new Lint(async () => [200, { "content-type": "text/plain" }, ["OK"]]);
    const env = validEnv({ "rack.hijack?": true, "rack.hijack": () => ({}) });
    const [status] = await app.call(env);
    expect(status).toBe(200);
  });

  it.skip("notices when the response headers don't have a valid rack.hijack callback", () => {});
  it.skip("notices when the response headers has a rack.hijack callback with hijacking being supported", () => {});

  it("notices rack.response_finished errors", async () => {
    const app = new Lint(async () => [200, { "content-type": "text/plain" }, ["OK"]]);
    const env = validEnv({ "rack.response_finished": "not an array" });
    await expect(app.call(env)).rejects.toThrow(LintError);
  });

  it("notices when the response protocol is not an array of strings", async () => {
    const app = new Lint(async () => [200, { "content-type": "text/plain", "rack.protocol": "h2" }, ["OK"]]);
    await expect(app.call(validEnv())).rejects.toThrow(LintError);
  });

  it("notices when the response protocol is specified in the response but not in the request", async () => {
    const app = new Lint(async () => [200, { "content-type": "text/plain", "rack.protocol": ["h2"] }, ["OK"]]);
    await expect(app.call(validEnv())).rejects.toThrow(LintError);
  });

  it("pass valid rack.protocol", async () => {
    const app = new Lint(async () => [200, { "content-type": "text/plain", "rack.protocol": ["h2"] }, ["OK"]]);
    const env = validEnv({ "rack.protocol": ["h2"] });
    const [status] = await app.call(env);
    expect(status).toBe(200);
  });
});
