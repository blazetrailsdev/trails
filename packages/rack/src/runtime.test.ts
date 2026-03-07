import { describe, it, expect } from "vitest";
import { Runtime } from "./runtime.js";
import { MockRequest } from "./mock-request.js";

describe("Rack::Runtime", () => {
  const request = () => MockRequest.envFor("/");

  it("sets x-runtime is none is set", async () => {
    const app = async () => [200, { "content-type": "text/plain" }, "Hello, World!"] as any;
    const runtime = new Runtime(app);
    const [, headers] = await runtime.call(request());
    expect(headers["x-runtime"]).toMatch(/[\d.]+/);
  });

  it("doesn't set the x-runtime if it is already set", async () => {
    const app = async () => [200, { "content-type": "text/plain", "x-runtime": "foobar" }, "Hello, World!"] as any;
    const runtime = new Runtime(app);
    const [, headers] = await runtime.call(request());
    expect(headers["x-runtime"]).toBe("foobar");
  });

  it("allow a suffix to be set", async () => {
    const app = async () => [200, { "content-type": "text/plain" }, "Hello, World!"] as any;
    const runtime = new Runtime(app, "Test");
    const [, headers] = await runtime.call(request());
    expect(headers["x-runtime-test"]).toMatch(/[\d.]+/);
  });

  it("allow multiple timers to be set", async () => {
    const inner = async () => {
      // Small delay to ensure measurable time
      await new Promise(r => setTimeout(r, 10));
      return [200, { "content-type": "text/plain" }, "Hello, World!"] as any;
    };
    let app: any = new Runtime(inner, "App");
    for (let i = 0; i < 5; i++) {
      const prev = app;
      app = new Runtime((env: any) => prev.call(env), String(i));
    }
    const outer = new Runtime((env: any) => app.call(env), "All");
    const [, headers] = await outer.call(request());
    expect(headers["x-runtime-app"]).toMatch(/[\d.]+/);
    expect(headers["x-runtime-all"]).toMatch(/[\d.]+/);
    expect(parseFloat(headers["x-runtime-all"])).toBeGreaterThan(parseFloat(headers["x-runtime-app"]));
  });
});
