import { describe, it, expect } from "vitest";
import { DebugExceptions, type Logger } from "../middleware/debug-exceptions.js";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { bodyFromString, bodyToString } from "@blazetrails/rack";

const okApp = async (_env: RackEnv): Promise<RackResponse> => [
  200,
  { "content-type": "text/plain" },
  bodyFromString("ok"),
];

const errorApp = async (_env: RackEnv): Promise<RackResponse> => {
  throw new Error("Something went wrong");
};

class RoutingError extends Error {
  name = "RoutingError";
}

const routingErrorApp = async (_env: RackEnv): Promise<RackResponse> => {
  throw new RoutingError("No route matches");
};

function makeEnv(overrides: Partial<RackEnv> = {}): RackEnv {
  return { REQUEST_METHOD: "GET", PATH_INFO: "/test", ...overrides };
}

// ==========================================================================
// dispatch/debug_exceptions_test.rb
// ==========================================================================
describe("DebugExceptionsTest", () => {
  it("skip diagnosis if not showing detailed exceptions", async () => {
    const mw = new DebugExceptions(errorApp, { showDetailedExceptions: false });
    const [status, , body] = await mw.call(makeEnv());
    expect(status).toBe(500);
    const text = await bodyToString(body);
    expect(text).not.toContain("Something went wrong");
  });

  it("skip diagnosis if not showing exceptions", async () => {
    const mw = new DebugExceptions(errorApp, { showExceptions: false });
    await expect(mw.call(makeEnv())).rejects.toThrow("Something went wrong");
  });

  it("rescue with diagnostics message", async () => {
    const mw = new DebugExceptions(errorApp);
    const [status, headers, body] = await mw.call(makeEnv());
    expect(status).toBe(500);
    expect(headers["content-type"]).toContain("text/html");
    const html = await bodyToString(body);
    expect(html).toContain("Something went wrong");
    expect(html).toContain("Error");
  });

  it("rescue with text error for xhr request", async () => {
    const mw = new DebugExceptions(errorApp);
    const [status, headers, body] = await mw.call(
      makeEnv({ HTTP_X_REQUESTED_WITH: "XMLHttpRequest" }),
    );
    expect(status).toBe(500);
    expect(headers["content-type"]).toContain("text/plain");
    const text = await bodyToString(body);
    expect(text).toContain("Something went wrong");
  });

  it("rescue with JSON error for JSON API request", async () => {
    const mw = new DebugExceptions(errorApp);
    const [status, headers, body] = await mw.call(makeEnv({ HTTP_ACCEPT: "application/json" }));
    expect(status).toBe(500);
    expect(headers["content-type"]).toContain("application/json");
    const json = JSON.parse(await bodyToString(body));
    expect(json.status).toBe(500);
    expect(json.error).toBe("Internal Server Error");
    expect(json.message).toBe("Something went wrong");
  });

  it("rescue with HTML format for HTML API request", async () => {
    const mw = new DebugExceptions(errorApp);
    const [status, headers, body] = await mw.call(makeEnv({ HTTP_ACCEPT: "text/html" }));
    expect(status).toBe(500);
    expect(headers["content-type"]).toContain("text/html");
    const html = await bodyToString(body);
    expect(html).toContain("<h1>");
  });

  it("rescue with XML format for XML API requests", async () => {
    const mw = new DebugExceptions(errorApp);
    const [status, headers, body] = await mw.call(makeEnv({ HTTP_ACCEPT: "application/xml" }));
    expect(status).toBe(500);
    expect(headers["content-type"]).toContain("application/xml");
    const xml = await bodyToString(body);
    expect(xml).toContain("<error>");
    expect(xml).toContain("<status>500</status>");
  });

  it("rescue with JSON format as fallback if API request format is not supported", async () => {
    const mw = new DebugExceptions(errorApp);
    const [status, headers] = await mw.call(makeEnv({ CONTENT_TYPE: "application/json" }));
    expect(status).toBe(500);
    expect(headers["content-type"]).toContain("application/json");
  });

  it("sets the HTTP charset parameter", async () => {
    const mw = new DebugExceptions(errorApp);
    const [, headers] = await mw.call(makeEnv());
    expect(headers["content-type"]).toContain("charset=utf-8");
  });

  it("uses logger from env", async () => {
    const messages: string[] = [];
    const logger: Logger = { error: (msg) => messages.push(msg) };
    const mw = new DebugExceptions(errorApp);
    await mw.call(makeEnv({ "action_dispatch.logger": logger as unknown }));
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0]).toContain("Something went wrong");
  });

  it("logs at configured log level", async () => {
    const warnMessages: string[] = [];
    const logger: Logger = {
      error: () => {},
      warn: (msg) => warnMessages.push(msg),
    };
    const mw = new DebugExceptions(errorApp, { logger, logLevel: "warn" });
    await mw.call(makeEnv());
    expect(warnMessages.length).toBeGreaterThan(0);
  });

  it("logs only what is necessary", async () => {
    const messages: string[] = [];
    const logger: Logger = { error: (msg) => messages.push(msg) };
    const mw = new DebugExceptions(errorApp, { logger });
    await mw.call(makeEnv());
    expect(messages.length).toBe(1);
    expect(messages[0]).toContain("Error (Something went wrong)");
  });

  it("logs with non active support loggers", async () => {
    const messages: string[] = [];
    const logger = { error: (msg: string) => messages.push(msg) };
    const mw = new DebugExceptions(errorApp, { logger });
    await mw.call(makeEnv());
    expect(messages.length).toBeGreaterThan(0);
  });

  it("skips logging when rescued and log_rescued_responses is false", async () => {
    const messages: string[] = [];
    const logger: Logger = { error: (msg) => messages.push(msg) };
    // RoutingError maps to 404 (non-500), so it's "rescued"
    const mw = new DebugExceptions(routingErrorApp, {
      logger,
      logRescuedResponses: false,
    });
    await mw.call(makeEnv());
    expect(messages.length).toBe(0);
  });

  it("does not skip logging when rescued and log_rescued_responses is true", async () => {
    const messages: string[] = [];
    const logger: Logger = { error: (msg) => messages.push(msg) };
    const mw = new DebugExceptions(routingErrorApp, {
      logger,
      logRescuedResponses: true,
    });
    await mw.call(makeEnv());
    expect(messages.length).toBeGreaterThan(0);
  });

  it("logs exception causes", async () => {
    const messages: string[] = [];
    const logger: Logger = { error: (msg) => messages.push(msg) };
    const causedApp = async (): Promise<RackResponse> => {
      const cause = new Error("root cause");
      const err = new Error("wrapper error");
      (err as any).cause = cause;
      throw err;
    };
    const mw = new DebugExceptions(causedApp, { logger });
    await mw.call(makeEnv());
    expect(messages[0]).toContain("Caused by: Error (root cause)");
  });

  it("display backtrace when error type is SyntaxError", async () => {
    const syntaxApp = async (): Promise<RackResponse> => {
      throw new SyntaxError("Unexpected token");
    };
    const mw = new DebugExceptions(syntaxApp);
    const [status, , body] = await mw.call(makeEnv());
    expect(status).toBe(500);
    const html = await bodyToString(body);
    expect(html).toContain("SyntaxError");
  });

  it("invoke interceptors before rendering", async () => {
    let intercepted = false;
    const mw = new DebugExceptions(errorApp, {
      interceptors: [
        () => {
          intercepted = true;
        },
      ],
    });
    await mw.call(makeEnv());
    expect(intercepted).toBe(true);
  });

  it("bad interceptors doesnt debug exceptions", async () => {
    const mw = new DebugExceptions(errorApp, {
      interceptors: [
        () => {
          throw new Error("interceptor broke");
        },
      ],
    });
    // Should not throw despite bad interceptor
    const [status] = await mw.call(makeEnv());
    expect(status).toBe(500);
  });

  it("show the controller name in the diagnostics template when controller name is present", async () => {
    const mw = new DebugExceptions(errorApp);
    const [, , body] = await mw.call(makeEnv({ "action_dispatch.controller": "UsersController" }));
    const html = await bodyToString(body);
    expect(html).toContain("UsersController");
  });

  it("show formatted params", async () => {
    const mw = new DebugExceptions(errorApp);
    const [, , body] = await mw.call(makeEnv({ PATH_INFO: "/users/1" }));
    const html = await bodyToString(body);
    expect(html).toContain("/users/1");
  });

  it("displays request and response info when a RoutingError occurs", async () => {
    const mw = new DebugExceptions(routingErrorApp);
    const [status, , body] = await mw.call(makeEnv({ PATH_INFO: "/missing" }));
    expect(status).toBe(404);
    const html = await bodyToString(body);
    expect(html).toContain("No route matches");
    expect(html).toContain("/missing");
  });

  it("named URLs missing keys raise 500 level error", async () => {
    const mw = new DebugExceptions(errorApp);
    const [status] = await mw.call(makeEnv());
    expect(status).toBe(500);
  });

  it("ok responses pass through", async () => {
    const mw = new DebugExceptions(okApp);
    const [status, , body] = await mw.call(makeEnv());
    expect(status).toBe(200);
    expect(await bodyToString(body)).toBe("ok");
  });

  it("routing error gives 404", async () => {
    const mw = new DebugExceptions(routingErrorApp);
    const [status] = await mw.call(makeEnv());
    expect(status).toBe(404);
  });

  it("json error includes traces", async () => {
    const mw = new DebugExceptions(errorApp);
    const [, , body] = await mw.call(makeEnv({ HTTP_ACCEPT: "application/json" }));
    const json = JSON.parse(await bodyToString(body));
    expect(json.traces).toBeTruthy();
    expect(json.traces["Application Trace"]).toBeDefined();
    expect(json.traces["Framework Trace"]).toBeDefined();
  });

  it("html error includes request method", async () => {
    const mw = new DebugExceptions(errorApp);
    const [, , body] = await mw.call(makeEnv({ REQUEST_METHOD: "POST" }));
    const html = await bodyToString(body);
    expect(html).toContain("POST");
  });

  it("xml error includes exception name", async () => {
    const mw = new DebugExceptions(routingErrorApp);
    const [, , body] = await mw.call(makeEnv({ HTTP_ACCEPT: "text/xml" }));
    const xml = await bodyToString(body);
    expect(xml).toContain("RoutingError");
  });
});
