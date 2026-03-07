import { describe, it, expect } from "vitest";
import { ShowExceptions } from "./show-exceptions.js";
import { MockRequest } from "./mock-request.js";

describe("Rack::ShowExceptions", () => {
  function showExceptions(app: any) {
    return new ShowExceptions(app);
  }

  it("catches exceptions", async () => {
    const req = new MockRequest((env) => showExceptions(async () => {
      throw new Error("RuntimeError");
    }).call(env));
    const res = await req.get("/", { HTTP_ACCEPT: "text/html" });
    expect(res.status).toBe(500);
    expect(res.bodyString).toContain("Error");
    expect(res.bodyString).toContain("ShowExceptions");
    expect(res.bodyString).toContain("No GET data");
    expect(res.bodyString).toContain("No POST data");
  });

  it("handles exceptions with backtrace lines for files that are not readable", async () => {
    const req = new MockRequest((env) => showExceptions(async () => {
      const err = new Error("foo");
      err.stack = "Error: foo\n    at nonexistent.rb:2:in `a': adf (RuntimeError)\n    bad-backtrace";
      throw err;
    }).call(env));
    const res = await req.get("/", { HTTP_ACCEPT: "text/html" });
    expect(res.status).toBe(500);
    expect(res.bodyString).toContain("Error");
    expect(res.bodyString).toContain("ShowExceptions");
    expect(res.bodyString).toContain("nonexistent.rb");
  });

  it("handles invalid POST data exceptions", async () => {
    const req = new MockRequest((env) => showExceptions(async () => {
      throw new Error("RuntimeError");
    }).call(env));
    // Post with bad params that will throw on read
    const badInput = { read() { throw new Error("parse error"); } };
    const res = await req.post("/", { HTTP_ACCEPT: "text/html" });
    expect(res.status).toBe(500);
    expect(res.bodyString).toContain("Error");
    expect(res.bodyString).toContain("ShowExceptions");
    expect(res.bodyString).toContain("No GET data");
  });

  it("works with binary data in the Rack environment", async () => {
    const req = new MockRequest((env) => showExceptions(async (e: any) => {
      e["foo"] = "\xCC";
      throw new Error("RuntimeError");
    }).call(env));
    const res = await req.get("/", { HTTP_ACCEPT: "text/html" });
    expect(res.status).toBe(500);
    expect(res.bodyString).toContain("Error");
    expect(res.bodyString).toContain("ShowExceptions");
  });

  it("responds with HTML only to requests accepting HTML", async () => {
    const app = showExceptions(async () => {
      throw new Error("It was never supposed to work");
    });

    const cases: [string, any[]][] = [
      ["text/html", ["/", { HTTP_ACCEPT: "text/html" }]],
      ["text/html", ["/", { HTTP_ACCEPT: "*/*" }]],
      ["text/plain", ["/"]],
      ["text/plain", ["/", { HTTP_ACCEPT: "application/json" }]],
    ];

    for (const [expectedMime, rargs] of cases) {
      const [uri, opts] = rargs;
      const res = await new MockRequest((env) => app.call(env)).get(uri, opts || {});
      expect(res.status).toBe(500);
      expect(res.headers["content-type"]).toBe(expectedMime);
      expect(res.bodyString).toContain("Error");
      expect(res.bodyString).toContain("It was never supposed to work");

      if (expectedMime === "text/html") {
        expect(res.bodyString).toContain("</html>");
      } else {
        expect(res.bodyString).not.toContain("</html>");
      }
    }
  });

  it("handles exceptions without a backtrace", async () => {
    const req = new MockRequest((env) => showExceptions(async () => {
      const err = new Error("RuntimeError");
      err.stack = undefined;
      throw err;
    }).call(env));
    const res = await req.get("/", { HTTP_ACCEPT: "text/html" });
    expect(res.status).toBe(500);
    expect(res.bodyString).toContain("Error");
    expect(res.bodyString).toContain("ShowExceptions");
    expect(res.bodyString).toContain("unknown location");
  });

  it("allows subclasses to override template", async () => {
    class CustomShowExceptions extends ShowExceptions {
      protected template(): string {
        return "foo";
      }
    }
    const app = new CustomShowExceptions(async () => { throw new Error(""); });
    const res = await new MockRequest((env) => app.call(env)).get("/", { HTTP_ACCEPT: "text/html" });
    expect(res.status).toBe(500);
    expect(res.bodyString).toBe("foo");
  });

  it("knows to prefer plaintext for non-html", () => {
    const exc = new ShowExceptions(null as any);
    expect(exc.prefersPlaintext({ HTTP_ACCEPT: "text/plain" })).toBe(true);
    expect(exc.prefersPlaintext({ HTTP_ACCEPT: "text/foo" })).toBe(true);
    expect(exc.prefersPlaintext({ HTTP_ACCEPT: "text/html" })).toBe(false);
  });

  it("prefers Exception#detailed_message instead of Exception#message if available", async () => {
    const req = new MockRequest((env) => showExceptions(async () => {
      const err: any = new Error("regular_message");
      err.detailedMessage = () => "detailed_message_test";
      throw err;
    }).call(env));
    const res = await req.get("/", { HTTP_ACCEPT: "text/html" });
    expect(res.status).toBe(500);
    expect(res.bodyString).toContain("detailed_message_test");
    expect(res.bodyString).toContain("ShowExceptions");
    expect(res.bodyString).toContain("No GET data");
    expect(res.bodyString).toContain("No POST data");
  });
});
