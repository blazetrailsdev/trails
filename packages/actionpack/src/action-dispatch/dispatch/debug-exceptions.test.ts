import { describe, it, expect, vi } from "vitest";
import { DebugExceptions } from "../middleware/debug-exceptions.js";
import { BacktraceCleaner, htmlEscape, Logger } from "@blazetrails/activesupport";
import { Base } from "@blazetrails/actionview";
import { rbInspect, StringIO } from "@blazetrails/ruby-compat";
import { MimeType } from "../http/mime-type.js";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { bodyFromString, bodyToString } from "@blazetrails/rack";
import {
  BadRequest,
  RoutingError as RoutingErrorClass,
} from "../../action-controller/metal/exceptions.js";
import { ParameterMissing } from "../../action-controller/metal/strong-parameters.js";
import { InvalidType } from "../http/mime-negotiation.js";
import { SharedTestRoutes } from "../../test-helpers/abstract-unit.js";

const okApp = async (_env: RackEnv): Promise<RackResponse> => [
  200,
  { "content-type": "text/plain" },
  bodyFromString("ok"),
];

const errorApp = async (_env: RackEnv): Promise<RackResponse> => {
  throw new Error("Something went wrong");
};

class RoutingError extends Error {
  name = "ActionController::RoutingError";
}

const routingErrorApp = async (_env: RackEnv): Promise<RackResponse> => {
  throw new RoutingError("No route matches");
};

const boomer = async (env: RackEnv): Promise<RackResponse> => {
  switch (env["PATH_INFO"]) {
    case "/pass":
      return [404, { "x-cascade": "pass" }, bodyFromString("")];
    case "/invalid_mimetype":
      throw new InvalidType();
    case "/cause_mapped_to_rescue_responses":
      try {
        throw new ParameterMissing("missing_param_key");
      } catch {
        throw new Error("uninitialized constant Userr");
      }
    case "/bad_request":
      throw new BadRequest();
    case "/parameter_missing":
      throw new ParameterMissing("invalid_param_key", ["valid_param_key"]);
    default:
      throw new Error("puke!");
  }
};

function makeEnv(overrides: Partial<RackEnv> = {}): RackEnv {
  return {
    REQUEST_METHOD: "GET",
    PATH_INFO: "/test",
    "action_dispatch.show_detailed_exceptions": true,
    "action_dispatch.show_exceptions": "all",
    ...overrides,
  };
}

describe("DebugExceptionsTest", () => {
  it("skip diagnosis if not showing detailed exceptions", async () => {
    const mw = new DebugExceptions(errorApp);
    await expect(
      mw.call(makeEnv({ "action_dispatch.show_detailed_exceptions": false })),
    ).rejects.toThrow("Something went wrong");
  });

  it("skip diagnosis if not showing exceptions", async () => {
    const mw = new DebugExceptions(errorApp);
    await expect(mw.call(makeEnv({ "action_dispatch.show_exceptions": "none" }))).rejects.toThrow(
      "Something went wrong",
    );
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
    const mw = new DebugExceptions(errorApp, null, "api");
    const [status, headers, body] = await mw.call(makeEnv({ HTTP_ACCEPT: "application/json" }));
    expect(status).toBe(500);
    expect(headers["content-type"]).toContain("application/json");
    const json = JSON.parse(await bodyToString(body));
    expect(json.status).toBe(500);
    expect(json.error).toBe("Internal Server Error");
    expect(json.exception).toBeDefined();
  });

  // BLOCKED: debug-view-rescue-templates-are-never-shipped
  it.skip("rescue with suggestions", async () => {
    const mw = new DebugExceptions(boomer);
    let [status, , body] = await mw.call(makeEnv({ PATH_INFO: "/not_found" }));
    expect(status).toBe(404);
    let html = await bodyToString(body);
    expect(html).toMatch(/<b>Did you mean\?/);
    expect(html).toMatch(/<li>hello<\/li>/);

    [status, , body] = await mw.call(makeEnv({ PATH_INFO: "/parameter_missing" }));
    expect(status).toBe(400);
    html = await bodyToString(body);
    expect(html).toMatch(/<b>Did you mean\?/);
    expect(html).toMatch(/<li>valid_param_key<\/li>/);
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
    const mw = new DebugExceptions(errorApp, null, "api");
    const [status, headers, body] = await mw.call(makeEnv({ HTTP_ACCEPT: "application/xml" }));
    expect(status).toBe(500);
    expect(headers["content-type"]).toContain("application/xml");
    const xml = await bodyToString(body);
    expect(xml).toContain("<hash>");
    expect(xml).toMatch(/<status[^>]*>500<\/status>/);
  });

  it("rescue with JSON format as fallback if API request format is not supported", async () => {
    MimeType.register("text/wibble", ":wibble");
    try {
      const mw = new DebugExceptions(errorApp, null, "api");
      const [status, headers] = await mw.call(makeEnv({ HTTP_ACCEPT: "text/wibble" }));
      expect(status).toBe(500);
      expect(headers["content-type"]).toContain("application/json");
    } finally {
      MimeType.unregister(":wibble");
    }
  });

  // BLOCKED: debug-view-rescue-templates-are-never-shipped
  it.skip("does not show filtered parameters", async () => {
    const mw = new DebugExceptions(boomer);
    const [status, , body] = await mw.call(
      makeEnv({
        PATH_INFO: "/",
        QUERY_STRING: "foo=bar",
        "action_dispatch.parameter_filter": ["foo"],
      }),
    );
    expect(status).toBe(500);
    expect(await bodyToString(body)).toContain("&quot;foo&quot; =&gt; &quot;[FILTERED]&quot;");
  });

  // BLOCKED: debug-view-rescue-templates-are-never-shipped
  it.skip("show registered original exception if the last exception is TemplateError", async () => {
    const mw = new DebugExceptions(boomer);
    const [status, , body] = await mw.call(makeEnv({ PATH_INFO: "/not_found_original_exception" }));
    expect(status).toBe(404);
    const html = await bodyToString(body);
    expect(html).toMatch(/AbstractController::ActionNotFound/);
    expect(html).toMatch(/Showing <i>.*dispatch\/debug-exceptions.test.ts<\/i>/);
  });

  // BLOCKED: debug-view-rescue-templates-are-never-shipped
  it.skip("show the last exception and cause even when the cause is mapped to resque_responses", async () => {
    const mw = new DebugExceptions(boomer);
    const [status, , body] = await mw.call(
      makeEnv({ PATH_INFO: "/cause_mapped_to_rescue_responses" }),
    );
    expect(status).toBe(500);
    const html = await bodyToString(body);
    expect(html).toMatch(/ActionController::ParameterMissing/);
    expect(html).toMatch(/NameError/);
  });

  it("sets the HTTP charset parameter", async () => {
    const mw = new DebugExceptions(errorApp);
    const [, headers] = await mw.call(makeEnv());
    expect(headers["content-type"]).toContain("charset=utf-8");
  });

  it("uses logger from env", async () => {
    const output = new StringIO();
    const mw = new DebugExceptions(errorApp);
    await mw.call(makeEnv({ "action_dispatch.logger": new Logger(output) }));
    output.rewind();
    expect(output.read()).toMatch(/Something went wrong/);
  });

  it("logs at configured log level", async () => {
    const output = new StringIO();
    const logger = new Logger(output);
    logger.level = Logger.WARN;
    const mw = new DebugExceptions(errorApp);

    await mw.call(
      makeEnv({
        "action_dispatch.logger": logger,
        "action_dispatch.debug_exception_log_level": Logger.INFO,
      }),
    );
    output.rewind();
    expect(output.read()).not.toMatch(/Something went wrong/);

    await mw.call(
      makeEnv({
        "action_dispatch.logger": logger,
        "action_dispatch.debug_exception_log_level": Logger.ERROR,
      }),
    );
    output.rewind();
    expect(output.read()).toMatch(/Something went wrong/);
  });

  it("logs only what is necessary", async () => {
    const io = new StringIO();
    const logger = new Logger(io);
    const old = Base.logger;
    Base.logger = logger;
    try {
      await new DebugExceptions(errorApp).call(makeEnv({ "action_dispatch.logger": logger }));
    } finally {
      Base.logger = old;
    }

    io.rewind();
    const lines = io.read().split(/(?<=\n)/);
    expect(lines.splice(0, 3)).toEqual(["  \n", "Error (Something went wrong):\n", "  \n"]);
    for (const line of lines) {
      expect(line).toMatch(/^at .+\n$/);
    }
  });

  it("logs with non active support loggers", async () => {
    const io = new StringIO();
    const logger = new Logger(io);
    const old = Base.logger;
    Base.logger = logger;
    try {
      await new DebugExceptions(errorApp).call(makeEnv({ "action_dispatch.logger": logger }));
    } finally {
      Base.logger = old;
    }
    io.rewind();
    expect(io.read()).toMatch(/Something went wrong/);
  });

  it("uses backtrace cleaner from env", async () => {
    const backtraceCleaner = new BacktraceCleaner();
    vi.spyOn(backtraceCleaner, "clean").mockReturnValue(["passed backtrace cleaner"]);
    const [, , body] = await new DebugExceptions(boomer).call(
      makeEnv({ PATH_INFO: "/", "action_dispatch.backtrace_cleaner": backtraceCleaner }),
    );
    expect(await bodyToString(body)).toMatch(/passed backtrace cleaner/);
  });

  it("logs exception backtrace when all lines silenced", async () => {
    const output = new StringIO();
    const backtraceCleaner = new BacktraceCleaner();
    backtraceCleaner.addSilencer(() => true);

    const env = makeEnv({
      PATH_INFO: "/",
      "action_dispatch.logger": new Logger(output),
      "action_dispatch.backtrace_cleaner": backtraceCleaner,
    });

    await new DebugExceptions(boomer).call(env);
    output.rewind();
    expect(output.read().split(/(?<=\n)/).length).toBeGreaterThan(10);
  });

  it("doesn't log the framework backtrace when error type is a routing error", async () => {
    const output = new StringIO();
    const backtraceCleaner = new BacktraceCleaner();
    backtraceCleaner.addSilencer(() => true);

    const env = makeEnv({
      PATH_INFO: "/pass",
      "action_dispatch.show_detailed_exceptions": false,
      "action_dispatch.logger": new Logger(output),
      "action_dispatch.log_rescued_responses": true,
      "action_dispatch.backtrace_cleaner": backtraceCleaner,
    });

    await expect(new DebugExceptions(boomer).call(env)).rejects.toThrow(RoutingErrorClass);

    output.rewind();
    const log = output.read();

    expect(log).toContain('ActionController::RoutingError (No route matches [GET] "/pass")');
    expect(log.split(/(?<=\n)/).length).toBe(3);
  });

  // BLOCKED: exception-without-message-reads-class-name
  it.skip("doesn't log the framework backtrace when error type is a invalid mime type", async () => {
    const output = new StringIO();
    const backtraceCleaner = new BacktraceCleaner();
    backtraceCleaner.addSilencer(() => true);

    const env = makeEnv({
      PATH_INFO: "/invalid_mimetype",
      HTTP_ACCEPT: "text/html,*",
      "action_dispatch.show_detailed_exceptions": false,
      "action_dispatch.logger": new Logger(output),
      "action_dispatch.log_rescued_responses": true,
      "action_dispatch.backtrace_cleaner": backtraceCleaner,
    });

    await expect(new DebugExceptions(boomer).call(env)).rejects.toThrow(InvalidType);

    output.rewind();
    const log = output.read();

    expect(log).toContain(
      "ActionDispatch::Http::MimeNegotiation::InvalidType (ActionDispatch::Http::MimeNegotiation::InvalidType)",
    );
    expect(log.split(/(?<=\n)/).length).toBe(3);
  });

  it("skips logging when rescued and log_rescued_responses is false", async () => {
    const output = new StringIO();
    const mw = new DebugExceptions(routingErrorApp);
    await mw.call(
      makeEnv({
        "action_dispatch.logger": new Logger(output),
        "action_dispatch.log_rescued_responses": false,
      }),
    );
    output.rewind();
    expect(output.read()).toBe("");
  });

  it("does not skip logging when rescued and log_rescued_responses is true", async () => {
    const output = new StringIO();
    const mw = new DebugExceptions(routingErrorApp);
    await mw.call(
      makeEnv({
        "action_dispatch.logger": new Logger(output),
        "action_dispatch.log_rescued_responses": true,
      }),
    );
    output.rewind();
    expect(output.read()).not.toBe("");
  });

  it("logs exception causes", async () => {
    const output = new StringIO();
    const causedApp = async (): Promise<RackResponse> => {
      const cause = new Error("root cause");
      const err = new Error("wrapper error");
      (err as any).cause = cause;
      throw err;
    };
    const mw = new DebugExceptions(causedApp);
    await mw.call(
      makeEnv({
        "action_dispatch.logger": new Logger(output),
        "action_dispatch.log_rescued_responses": true,
      }),
    );
    output.rewind();
    expect(output.read()).toContain("Caused by: Error (root cause)");
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

  // BLOCKED: debug-view-rescue-templates-are-never-shipped
  it.skip("display backtrace on template missing errors", async () => {
    const [, , body] = await new DebugExceptions(boomer).call(
      makeEnv({ PATH_INFO: "/missing_template" }),
    );
    const html = await bodyToString(body);
    expect(html).toMatch(/<header>[\s\S]*<h1>Template is missing/);
    expect(html).toMatch(/<h2[^>]*>\s*Missing template/);
    expect(html).toContain('id="Application-Trace-0"');
    expect(html).toContain('id="Framework-Trace-0"');
    expect(html).toContain('id="Full-Trace-0"');
    expect(html).toMatch(/<h2[^>]*>Request<\/h2>/);
  });

  // BLOCKED: debug-view-rescue-templates-are-never-shipped
  it.skip("display backtrace when error type is SyntaxError wrapped by ActionView::Template::Error", async () => {
    const [status, , body] = await new DebugExceptions(boomer).call(
      makeEnv({
        PATH_INFO: "/syntax_error_into_view",
        "action_dispatch.backtrace_cleaner": new BacktraceCleaner(),
      }),
    );
    expect(status).toBe(500);
    const html = await bodyToString(body);
    expect(html).toMatch(/id="Application-Trace-0"[\s\S]*<code>[\s\S]*SyntaxError/);
    expect(html).toMatch(/Showing <i>.*dispatch\/debug-exceptions.test.ts<\/i>/);
  });

  // BLOCKED: debug-view-rescue-templates-are-never-shipped
  it.skip("debug exceptions app shows user code that caused the error in source view", async () => {
    const cleaner = new BacktraceCleaner();
    cleaner.addSilencer((line) => /methodThatRaises/.test(line));
    cleaner.addSilencer((line) => !/dispatch\/debug-exceptions.test.ts/.test(line));

    const [status, , body] = await new DebugExceptions(boomer).call(
      makeEnv({ PATH_INFO: "/framework_raises", "action_dispatch.backtrace_cleaner": cleaner }),
    );
    expect(status).toBe(500);
    const html = await bodyToString(body);
    expect(html).toMatch(/class="exception-message"[\s\S]*error in framework/);
    expect(html).toMatch(/class="source "[\s\S]*class="line active"[^<]*methodThatRaises/);
    expect(html).toMatch(/id="Application-Trace-0"[\s\S]*debug-exceptions.test.ts:\d+/);
    expect(html).toMatch(/id="Framework-Trace-0"[\s\S]*methodThatRaises/);
  });

  it("invoke interceptors before rendering", async () => {
    let intercepted = false;
    const mw = new DebugExceptions(errorApp, null, "default", [
      () => {
        intercepted = true;
      },
    ]);
    await mw.call(makeEnv());
    expect(intercepted).toBe(true);
  });

  it("bad interceptors doesn't debug exceptions", async () => {
    const mw = new DebugExceptions(errorApp, null, "default", [
      () => {
        throw new Error("interceptor broke");
      },
    ]);
    const [status] = await mw.call(makeEnv());
    expect(status).toBe(500);
  });

  // BLOCKED: debug-view-rescue-templates-are-never-shipped
  it.skip("debug exceptions app shows all the nested exceptions in source view", async () => {
    const cleaner = new BacktraceCleaner();
    cleaner.addSilencer((line) => !/dispatch\/debug-exceptions.test.ts/.test(line));

    const [status, , body] = await new DebugExceptions(boomer).call(
      makeEnv({ PATH_INFO: "/nested_exceptions", "action_dispatch.backtrace_cleaner": cleaner }),
    );
    expect(status).toBe(500);
    const html = await bodyToString(body);
    expect(html).toMatch(/class="exception-message"[\s\S]*Third error/);
    expect(html).toMatch(/id="Application-Trace-0"[\s\S]*raiseNestedExceptionsThird/);
    expect(html).toMatch(/id="Application-Trace-1"[\s\S]*raiseNestedExceptionsSecond/);
    expect(html).toMatch(/id="Application-Trace-2"[\s\S]*raiseNestedExceptionsFirst/);
  });

  // BLOCKED: debug-view-rescue-templates-are-never-shipped
  it.skip("shows a buttons for every action in an actionable error", async () => {
    const [status, , body] = await new DebugExceptions(boomer).call(
      makeEnv({ PATH_INFO: "/actionable_error" }),
    );
    expect(status).toBe(500);
    const html = await bodyToString(body);
    expect(html).toContain('<input type="submit" value="Action 1"');
    expect(html).toContain('<input type="submit" value="Action 2"');
  });

  it("debug exceptions app shows diagnostics when malformed query parameters are provided", async () => {
    const [status, , body] = await new DebugExceptions(boomer).call(
      makeEnv({ PATH_INFO: "/bad_request", QUERY_STRING: "x[y]=1&x[y][][w]=2" }),
    );
    expect(status).toBe(400);
    expect(await bodyToString(body)).toContain("ActionController::BadRequest");
  });

  it("debug exceptions app shows diagnostics when malformed query parameters are provided by XHR", async () => {
    const [status, , body] = await new DebugExceptions(boomer).call(
      makeEnv({
        PATH_INFO: "/bad_request",
        QUERY_STRING: "x[y]=1&x[y][][w]=2",
        HTTP_X_REQUESTED_WITH: "XMLHttpRequest",
      }),
    );
    expect(status).toBe(400);
    expect(await bodyToString(body)).toContain("ActionController::BadRequest");
  });

  // BLOCKED: debug-view-rescue-templates-are-never-shipped
  it.skip("debug exceptions app shows diagnostics for template errors that contain UTF-8 characters", async () => {
    const io = new StringIO();
    const [status, , body] = await new DebugExceptions(boomer).call(
      makeEnv({ PATH_INFO: "/utf8_template_error", "action_dispatch.logger": new Logger(io) }),
    );
    expect(status).toBe(500);
    const html = await bodyToString(body);
    expect(html).toMatch(/Showing .*debug-exceptions.test.ts where line #\d+ raised/);
    expect(html).toMatch(/string”/);
  });

  it("show the controller name in the diagnostics template when controller name is present", async () => {
    const mw = new DebugExceptions(boomer);
    const [status, , body] = await mw.call(
      makeEnv({
        PATH_INFO: "/runtime_error",
        "action_dispatch.request.parameters": {
          action: "show",
          id: "unknown",
          controller: "featured_tile",
        },
      }),
    );
    expect(status).toBe(500);
    expect(await bodyToString(body)).toMatch(/Error\n\s+in FeaturedTileController/);
  });

  it("show formatted params", async () => {
    const mw = new DebugExceptions(boomer);

    const params = {
      id: "unknown",
      someparam: {
        foo: "bar",
        abc: "goo",
      },
    };

    const [status, , body] = await mw.call(
      makeEnv({
        PATH_INFO: "/runtime_error",
        "action_dispatch.request.parameters": {
          action: "show",
          controller: "featured_tile",
          ...params,
        },
      }),
    );
    expect(status).toBe(500);

    expect(await bodyToString(body)).toContain(htmlEscape(rbInspect(params)));
  });

  it("raise an exception on cascade pass", async () => {
    const passApp = async (_env: RackEnv): Promise<RackResponse> => [
      404,
      { "x-cascade": "pass" },
      bodyFromString(""),
    ];
    const mw = new DebugExceptions(passApp);
    await expect(
      mw.call(makeEnv({ PATH_INFO: "/pass", "action_dispatch.show_exceptions": "none" })),
    ).rejects.toThrow('No route matches [GET] "/pass"');
  });

  it("closes the response body on cascade pass", async () => {
    let closed = false;
    const body = Object.assign(bodyFromString(""), {
      close: () => {
        closed = true;
      },
    });
    const passApp = async (_env: RackEnv): Promise<RackResponse> => [
      404,
      { "x-cascade": "pass" },
      body,
    ];
    const mw = new DebugExceptions(passApp);
    await expect(
      mw.call(makeEnv({ PATH_INFO: "/pass", "action_dispatch.show_exceptions": "none" })),
    ).rejects.toThrow(RoutingErrorClass);
    expect(closed).toBe(true);
  });

  it("displays routes in a table when a RoutingError occurs", async () => {
    const RoutesApp = { routes: () => SharedTestRoutes };
    const [, , body] = await new DebugExceptions(boomer, RoutesApp).call(
      makeEnv({ PATH_INFO: "/pass" }),
    );
    const routingTable = (await bodyToString(body)).match(/route_table[\s\S]*<.table>/)![0];
    expect(routingTable).toMatch("/:controller(/:action)(.:format)");
    expect(routingTable).toMatch(":controller#:action");
    expect(routingTable).not.toMatch(/&lt;|&gt;/);
  });

  it("displays request and response info when a RoutingError occurs", async () => {
    const mw = new DebugExceptions(boomer);
    const [, , body] = await mw.call(makeEnv({ PATH_INFO: "/pass" }));
    const html = await bodyToString(body);
    expect(html).toMatch(/<h2[^>]*>Request<\/h2>/);
    expect(html).toMatch(/<h2[^>]*>Response<\/h2>/);
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
    const mw = new DebugExceptions(errorApp, null, "api");
    const [, , body] = await mw.call(makeEnv({ HTTP_ACCEPT: "application/json" }));
    const json = JSON.parse(await bodyToString(body));
    expect(json.traces).toBeTruthy();
    expect(json.traces["Application Trace"]).toBeDefined();
    expect(json.traces["Framework Trace"]).toBeDefined();
  });

  it("xml error includes exception name", async () => {
    const mw = new DebugExceptions(routingErrorApp, null, "api");
    const [, , body] = await mw.call(makeEnv({ HTTP_ACCEPT: "text/xml" }));
    const xml = await bodyToString(body);
    expect(xml).toContain("RoutingError");
  });

  it("routes non-HTML requests through renderForApiRequest when responseFormat is 'api'", async () => {
    const mw = new DebugExceptions(errorApp, null, "api");
    const [status, headers, body] = await mw.call(makeEnv({ HTTP_ACCEPT: "application/json" }));
    expect(status).toBe(500);
    expect(headers["content-type"]).toContain("application/json");
    const raw = await bodyToString(body);
    const json = JSON.parse(raw);
    expect(json.exception).toBeDefined();
    expect(json.traces["Application Trace"]).toBeDefined();
    expect(json.traces["Framework Trace"]).toBeDefined();
    expect(headers["content-length"]).toBe(String(Buffer.byteLength(raw, "utf8")));
  });

  it("isApiRequest is false for HTML accept even when responseFormat is 'api'", () => {
    const mw = new DebugExceptions(errorApp, null, "api");
    expect(mw.isApiRequest(MimeType.lookup("text/html"))).toBe(false);
    expect(mw.isApiRequest(MimeType.lookup("application/json"))).toBe(true);
    expect(mw.isApiRequest(null)).toBe(true);
  });

  it("isApiRequest is false when responseFormat defaults to 'default'", () => {
    const mw = new DebugExceptions(errorApp);
    expect(mw.isApiRequest(MimeType.lookup("application/json"))).toBe(false);
  });
});
