import { beforeEach, describe, it, expect, vi } from "vitest";
import {
  ActionableError,
  assert,
  BacktraceCleaner,
  Logger,
  TopLevel,
  assertEmpty,
  assertEqual,
  assertIncludes,
  assertMatch,
  assertNoMatch,
  assertNotEmpty,
  assertNothingRaised,
  assertOperator,
  assertRaise,
  assertRaises,
} from "@blazetrails/activesupport";
import { Base, TemplateError } from "@blazetrails/actionview";
import {
  CGI,
  NameError,
  PP,
  RuntimeError,
  StandardError,
  StringIO,
  excSetupMessage,
} from "@blazetrails/ruby-compat";
import { Lint } from "@blazetrails/rack";
import { bodyToString } from "@blazetrails/rack";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { ActionNotFound } from "../../abstract-controller/base.js";
import { Base as ControllerBase } from "../../action-controller/base.js";
import {
  BadRequest,
  MethodNotAllowed,
  NotImplemented,
  RoutingError,
  UnknownHttpMethod,
  UrlGenerationError,
} from "../../action-controller/metal/exceptions.js";
import { InvalidAuthenticityToken } from "../../action-controller/metal/request-forgery-protection.js";
import { ParameterMissing } from "../../action-controller/metal/strong-parameters.js";
import { X_CASCADE } from "../constants.js";
import { InvalidType } from "../http/mime-negotiation.js";
import { MimeType } from "../http/mime-type.js";
import { Request } from "../http/request.js";
import { DebugExceptions, type Interceptor } from "../middleware/debug-exceptions.js";
import { IntegrationTest } from "../testing/integration.js";
import { SharedTestRoutes } from "../../test-helpers/abstract-unit.js";

const RUBY_VERSION: string = "3.4";

const InterceptedErrorInstance = new StandardError();

class CustomActionableError extends ActionableError {}
CustomActionableError.action("Action 1", () => null);
CustomActionableError.action("Action 2", () => null);

class SimpleController extends ControllerBase {
  hello(): void {
    this.responseBody = "hello";
  }
}

class Boomer {
  closed: boolean;
  private detailed: boolean;

  constructor(detailed = false) {
    this.detailed = detailed;
    this.closed = false;
  }

  *[Symbol.iterator](): Iterator<string> {}

  each(): void {}

  close(): void {
    this.closed = true;
  }

  methodThatRaises(): never {
    throw new StandardError("error in framework");
  }

  raiseNestedExceptions(): never {
    return this.raiseNestedExceptionsThird();
  }

  raiseNestedExceptionsFirst(): never {
    throw new RuntimeError("First error");
  }

  raiseNestedExceptionsSecond(): never {
    try {
      this.raiseNestedExceptionsFirst();
    } catch (e) {
      throw excSetupMessage(new RuntimeError("Second error"), e);
    }
  }

  raiseNestedExceptionsThird(): never {
    try {
      this.raiseNestedExceptionsSecond();
    } catch (e) {
      throw excSetupMessage(new RuntimeError("Third error"), e);
    }
  }

  async call(env: RackEnv): Promise<RackResponse> {
    env["action_dispatch.show_detailed_exceptions"] = this.detailed;
    const req = new Request(env);

    switch (req.path) {
      case "/pass":
        return [404, { [X_CASCADE]: "pass" }, this as never];
      case "/not_found": {
        const controller = new SimpleController();
        throw new ActionNotFound(null, controller as never, "ello");
      }
      case "/runtime_error":
        throw new RuntimeError();
      case "/method_not_allowed":
        throw new MethodNotAllowed();
      case "/intercepted_error":
        throw InterceptedErrorInstance;
      case "/unknown_http_method":
        throw new UnknownHttpMethod();
      case "/not_implemented":
        throw new NotImplemented();
      case "/unprocessable_entity":
        throw new InvalidAuthenticityToken();
      case "/invalid_mimetype":
        throw new InvalidType();
      case "/not_found_original_exception":
        try {
          throw new ActionNotFound();
        } catch (e) {
          throw new TemplateError("template", e as Error);
        }
      case "/cause_mapped_to_rescue_responses":
        try {
          throw new ParameterMissing("missing_param_key");
        } catch (e) {
          throw excSetupMessage(new NameError("uninitialized constant Userr"), e);
        }
      case "/bad_request":
        throw new BadRequest();
      case "/missing_keys":
        throw new UrlGenerationError("No route matches");
      case "/parameter_missing":
        throw new ParameterMissing("invalid_param_key", ["valid_param_key"]);
      case "/original_syntax_error":
        throw new SyntaxError("syntax errors found");
      case "/framework_raises":
        return this.methodThatRaises();
      case "/nested_exceptions":
        return this.raiseNestedExceptions();
      default:
        if (/\/actionable_error/.test(req.path)) throw new CustomActionableError();
        throw new RuntimeError("puke!");
    }
  }
}

function buildApp(app: Boomer, ...args: unknown[]): Lint {
  return new Lint(
    new DebugExceptions(new Lint(app) as never, ...(args as [never, never, never])) as never,
  );
}

const Interceptor: Interceptor = (request, exception) => request.setHeader("int", exception);
const BadInterceptor: Interceptor = () => {
  throw new RuntimeError("bad");
};
const RoutesApp = { routes: () => SharedTestRoutes };
const ProductionApp = buildApp(new Boomer(false), RoutesApp);
const DevelopmentApp = buildApp(new Boomer(true), RoutesApp);
const InterceptedApp = buildApp(new Boomer(true), RoutesApp, "default", [Interceptor]);
const BadInterceptedApp = buildApp(new Boomer(true), RoutesApp, "default", [BadInterceptor]);
const ApiApp = buildApp(new Boomer(true), RoutesApp, "api");

describe("DebugExceptionsTest", () => {
  let t: IntegrationTest;

  beforeEach(({ task }) => {
    t = new IntegrationTest(task.name);
  });

  const body = (): string => t.body!;

  it("skip diagnosis if not showing detailed exceptions", async () => {
    t.app = ProductionApp;
    await assertRaise([RuntimeError], {}, async () => {
      await t.get("/", { headers: { "action_dispatch.show_exceptions": "all" } });
    });
  });

  it("skip diagnosis if not showing exceptions", async () => {
    t.app = DevelopmentApp;
    await assertRaise([RuntimeError], {}, async () => {
      await t.get("/", { headers: { "action_dispatch.show_exceptions": "none" } });
    });
  });

  it("raise an exception on cascade pass", async () => {
    t.app = ProductionApp;
    await assertRaise([RoutingError], {}, async () => {
      await t.get("/pass", { headers: { "action_dispatch.show_exceptions": "all" } });
    });
  });

  it("closes the response body on cascade pass", async () => {
    const boomer = new Boomer(false);
    t.app = buildApp(boomer);
    await assertRaise([RoutingError], {}, async () => {
      await t.get("/pass", { headers: { "action_dispatch.show_exceptions": "all" } });
    });
    assert(boomer.closed, "Expected to close the response body");
  });

  it("displays routes in a table when a RoutingError occurs", async () => {
    t.app = DevelopmentApp;
    await t.get("/pass", { headers: { "action_dispatch.show_exceptions": "all" } });
    const routingTable = body().match(/route_table[\s\S]*<.table>/)![0];
    assertMatch("/:controller(/:action)(.:format)", routingTable);
    assertMatch(":controller#:action", routingTable);
    assertNoMatch("&lt;|&gt;", routingTable, "there should not be escaped HTML in the output");
  });

  it("displays request and response info when a RoutingError occurs", async () => {
    t.app = DevelopmentApp;

    await t.get("/pass", { headers: { "action_dispatch.show_exceptions": "all" } });

    assertMatch(/<h2[^>]*>Request<\/h2>/, body());
    assertMatch(/<h2[^>]*>Response<\/h2>/, body());
  });

  it("rescue with diagnostics message", async () => {
    t.app = DevelopmentApp;

    await t.get("/", { headers: { "action_dispatch.show_exceptions": "all" } });
    t.assertResponse(500);
    assertMatch(/<body>/, body());
    assertMatch(/puke/, body());

    await t.get("/not_found", { headers: { "action_dispatch.show_exceptions": "all" } });
    t.assertResponse(404);
    assertMatch(/<body>/, body());
    assertMatch(new RegExp(ActionNotFound.name), body());

    await t.get("/method_not_allowed", { headers: { "action_dispatch.show_exceptions": "all" } });
    t.assertResponse(405);
    assertMatch(/<body>/, body());
    assertMatch(/ActionController::MethodNotAllowed/, body());

    await t.get("/unknown_http_method", { headers: { "action_dispatch.show_exceptions": "all" } });
    t.assertResponse(405);
    assertMatch(/<body>/, body());
    assertMatch(/ActionController::UnknownHttpMethod/, body());

    await t.get("/bad_request", { headers: { "action_dispatch.show_exceptions": "all" } });
    t.assertResponse(400);
    assertMatch(/<body>/, body());
    assertMatch(/ActionController::BadRequest/, body());

    await t.get("/parameter_missing", { headers: { "action_dispatch.show_exceptions": "all" } });
    t.assertResponse(400);
    assertMatch(/<body>/, body());
    assertMatch(/ActionController::ParameterMissing/, body());

    await t.get("/invalid_mimetype", {
      headers: { Accept: "text/html,*", "action_dispatch.show_exceptions": "all" },
    });
    t.assertResponse(406);
    assertMatch(/<body>/, body());
    assertMatch(/ActionDispatch::Http::MimeNegotiation::InvalidType/, body());
  });

  it("rescue with text error for xhr request", async () => {
    t.app = DevelopmentApp;
    const xhrRequestEnv = {
      "action_dispatch.show_exceptions": "all",
      HTTP_X_REQUESTED_WITH: "XMLHttpRequest",
    };

    await t.get("/", { headers: xhrRequestEnv });
    t.assertResponse(500);
    assertNoMatch(/<header>/, body());
    assertNoMatch(/<body>/, body());
    assertEqual("text/plain", t.response.mediaType);
    assertMatch(/RuntimeError\npuke/, body());

    const trails = TopLevel.Trails;
    TopLevel.Trails = { root: () => "." } as unknown as typeof trails;
    try {
      await t.get("/", { headers: xhrRequestEnv });

      t.assertResponse(500);
      assertMatch("Extracted source (around line #", body());
    } finally {
      TopLevel.Trails = trails;
    }

    await t.get("/not_found", { headers: xhrRequestEnv });
    t.assertResponse(404);
    assertNoMatch(/<body>/, body());
    assertEqual("text/plain", t.response.mediaType);
    assertMatch(new RegExp(ActionNotFound.name), body());

    await t.get("/method_not_allowed", { headers: xhrRequestEnv });
    t.assertResponse(405);
    assertNoMatch(/<body>/, body());
    assertEqual("text/plain", t.response.mediaType);
    assertMatch(/ActionController::MethodNotAllowed/, body());

    await t.get("/unknown_http_method", { headers: xhrRequestEnv });
    t.assertResponse(405);
    assertNoMatch(/<body>/, body());
    assertEqual("text/plain", t.response.mediaType);
    assertMatch(/ActionController::UnknownHttpMethod/, body());

    await t.get("/bad_request", { headers: xhrRequestEnv });
    t.assertResponse(400);
    assertNoMatch(/<body>/, body());
    assertEqual("text/plain", t.response.mediaType);
    assertMatch(/ActionController::BadRequest/, body());

    await t.get("/parameter_missing", { headers: xhrRequestEnv });
    t.assertResponse(400);
    assertNoMatch(/<body>/, body());
    assertEqual("text/plain", t.response.mediaType);
    assertMatch(/ActionController::ParameterMissing/, body());
  });

  it("rescue with JSON error for JSON API request", async () => {
    t.app = ApiApp;
    const headers = { "action_dispatch.show_exceptions": "all" };

    await t.get("/", { headers, as: "json" });
    t.assertResponse(500);
    assertNoMatch(/<header>/, body());
    assertNoMatch(/<body>/, body());
    assertEqual("application/json", t.response.mediaType);
    assertMatch(/RuntimeError: puke/, body());

    await t.get("/not_found", { headers, as: "json" });
    t.assertResponse(404);
    assertNoMatch(/<body>/, body());
    assertEqual("application/json", t.response.mediaType);
    assertMatch(new RegExp(ActionNotFound.name), body());

    await t.get("/method_not_allowed", { headers, as: "json" });
    t.assertResponse(405);
    assertNoMatch(/<body>/, body());
    assertEqual("application/json", t.response.mediaType);
    assertMatch(/ActionController::MethodNotAllowed/, body());

    await t.get("/unknown_http_method", { headers, as: "json" });
    t.assertResponse(405);
    assertNoMatch(/<body>/, body());
    assertEqual("application/json", t.response.mediaType);
    assertMatch(/ActionController::UnknownHttpMethod/, body());

    await t.get("/bad_request", { headers, as: "json" });
    t.assertResponse(400);
    assertNoMatch(/<body>/, body());
    assertEqual("application/json", t.response.mediaType);
    assertMatch(/ActionController::BadRequest/, body());

    await t.get("/parameter_missing", { headers, as: "json" });
    t.assertResponse(400);
    assertNoMatch(/<body>/, body());
    assertEqual("application/json", t.response.mediaType);
    assertMatch(/ActionController::ParameterMissing/, body());

    await t.get("/invalid_mimetype", {
      headers: { Accept: "text/html,*", "action_dispatch.show_exceptions": "all" },
      as: "json",
    });
    t.assertResponse(406);
    assertNoMatch(/<body>/, body());
    assertEqual("application/json", t.response.mediaType);
    assertMatch(/ActionDispatch::Http::MimeNegotiation::InvalidType/, body());
  });

  // BLOCKED: debug-view-rescue-templates-are-never-shipped
  it.skip("rescue with suggestions", async () => {
    t.app = DevelopmentApp;
    const tc = t as never as { assertSelect(...a: unknown[]): void };

    await t.get("/not_found", { headers: { "action_dispatch.show_exceptions": "all" } });
    t.assertResponse(404);
    tc.assertSelect("b", /Did you mean\?/);
    tc.assertSelect("li", "hello");

    await t.get("/parameter_missing", { headers: { "action_dispatch.show_exceptions": "all" } });
    t.assertResponse(400);
    tc.assertSelect("b", /Did you mean\?/);
    tc.assertSelect("li", "valid_param_key");
  });

  it("rescue with HTML format for HTML API request", async () => {
    t.app = ApiApp;

    await t.get("/index.html", { headers: { "action_dispatch.show_exceptions": "all" } });
    t.assertResponse(500);
    assertMatch(/<header>/, body());
    assertMatch(/<body>/, body());
    assertEqual("text/html", t.response.mediaType);
    assertMatch(/puke/, body());
  });

  it("rescue with XML format for XML API requests", async () => {
    t.app = ApiApp;

    await t.get("/index.xml", { headers: { "action_dispatch.show_exceptions": "all" } });
    t.assertResponse(500);
    assertEqual("application/xml", t.response.mediaType);
    assertMatch(/RuntimeError: puke/, body());
  });

  it("rescue with JSON format as fallback if API request format is not supported", async () => {
    try {
      MimeType.register("text/wibble", ":wibble");

      IntegrationTest.registerEncoder("wibble", {
        paramEncoder: (params: unknown) => params,
      });

      t.app = ApiApp;

      await t.get("/index", {
        headers: { "action_dispatch.show_exceptions": "all" },
        as: "wibble",
      });
      t.assertResponse(500);
      assertEqual("application/json", t.response.mediaType);
      assertMatch(/RuntimeError: puke/, body());
    } finally {
      MimeType.unregister(":wibble");
    }
  });

  // BLOCKED: debug-view-rescue-templates-are-never-shipped
  it.skip("does not show filtered parameters", async () => {
    t.app = DevelopmentApp;

    await t.get("/", {
      params: { foo: "bar" },
      headers: {
        "action_dispatch.show_exceptions": "all",
        "action_dispatch.parameter_filter": ["foo"],
      },
    });
    t.assertResponse(500);

    assertMatch(CGI.escapeHTML('"foo" => "[FILTERED]"'), body());
  });

  // BLOCKED: debug-view-rescue-templates-are-never-shipped
  it.skip("show registered original exception if the last exception is TemplateError", async () => {
    t.app = DevelopmentApp;

    await t.get("/not_found_original_exception", {
      headers: { "action_dispatch.show_exceptions": "all" },
    });
    t.assertResponse(404);
    assertMatch(/AbstractController::ActionNotFound/, body());
    assertMatch(/Showing <i>.*dispatch\/debug-exceptions.test.ts<\/i>/, body());
  });

  // BLOCKED: debug-view-rescue-templates-are-never-shipped
  it.skip("show the last exception and cause even when the cause is mapped to resque_responses", async () => {
    t.app = DevelopmentApp;

    await t.get("/cause_mapped_to_rescue_responses", {
      headers: { "action_dispatch.show_exceptions": "all" },
    });
    t.assertResponse(500);
    assertMatch(/ActionController::ParameterMissing/, body());
    assertMatch(/NameError/, body());
  });

  it("named URLs missing keys raise 500 level error", async () => {
    t.app = DevelopmentApp;

    await t.get("/missing_keys", { headers: { "action_dispatch.show_exceptions": "all" } });
    t.assertResponse(500);

    assertMatch(/ActionController::UrlGenerationError/, body());
  });

  it("show the controller name in the diagnostics template when controller name is present", async () => {
    t.app = DevelopmentApp;
    await t.get("/runtime_error", {
      headers: {
        "action_dispatch.show_exceptions": "all",
        "action_dispatch.request.parameters": {
          action: "show",
          id: "unknown",
          controller: "featured_tile",
        },
      },
    });
    t.assertResponse(500);
    assertMatch(/RuntimeError\n\s+in FeaturedTileController/, body());
  });

  it("show formatted params", async () => {
    t.app = DevelopmentApp;

    const params = {
      id: "unknown",
      someparam: {
        foo: "bar",
        abc: "goo",
      },
    };

    await t.get("/runtime_error", {
      headers: {
        "action_dispatch.show_exceptions": "all",
        "action_dispatch.request.parameters": {
          action: "show",
          controller: "featured_tile",
          ...params,
        },
      },
    });
    t.assertResponse(500);

    assertIncludes(
      body(),
      CGI.escapeHTML((PP.pp(params, new StringIO(), 200) as StringIO).string()),
    );
  });

  it("sets the HTTP charset parameter", async () => {
    t.app = DevelopmentApp;

    await t.get("/", { headers: { "action_dispatch.show_exceptions": "all" } });
    assertEqual("text/html; charset=utf-8", t.response.headers.get("content-type"));
  });

  it("uses logger from env", async () => {
    t.app = DevelopmentApp;
    const output = new StringIO();
    await t.get("/", {
      headers: {
        "action_dispatch.show_exceptions": "all",
        "action_dispatch.logger": new Logger(output),
      },
    });
    assertMatch(/puke/, (output.rewind(), output.read()));
  });

  it("logs at configured log level", async () => {
    t.app = DevelopmentApp;
    const output = new StringIO();
    const logger = new Logger(output);
    logger.level = Logger.WARN;

    await t.get("/", {
      headers: {
        "action_dispatch.show_exceptions": "all",
        "action_dispatch.logger": logger,
        "action_dispatch.debug_exception_log_level": Logger.INFO,
      },
    });
    assertNoMatch(/puke/, (output.rewind(), output.read()));

    await t.get("/", {
      headers: {
        "action_dispatch.show_exceptions": "all",
        "action_dispatch.logger": logger,
        "action_dispatch.debug_exception_log_level": Logger.ERROR,
      },
    });
    assertMatch(/puke/, (output.rewind(), output.read()));
  });

  it("logs only what is necessary", async () => {
    t.app = DevelopmentApp;
    const io = new StringIO();
    const logger = new Logger(io);

    const _old = Base.logger;
    Base.logger = logger;
    try {
      await t.get("/", {
        headers: { "action_dispatch.show_exceptions": "all", "action_dispatch.logger": logger },
      });
    } finally {
      Base.logger = _old;
    }

    const output = (io.rewind(), io.read());
    const lines = output.split(/(?<=\n)/);

    assertEqual(["  \n", "RuntimeError (puke!):\n", "  \n"], lines.splice(0, 3));
    for (const line of lines) {
      assertMatch(/^at .+\n$/, line);
    }
  });

  it("logs with non active support loggers", async () => {
    t.app = DevelopmentApp;
    const io = new StringIO();
    const logger = new Logger(io);

    const _old = Base.logger;
    Base.logger = logger;
    try {
      await assertNothingRaised(async () => {
        await t.get("/", {
          headers: { "action_dispatch.show_exceptions": "all", "action_dispatch.logger": logger },
        });
      });
    } finally {
      Base.logger = _old;
    }

    assertMatch(/puke/, (io.rewind(), io.read()));
  });

  it("uses backtrace cleaner from env", async () => {
    t.app = DevelopmentApp;
    const backtraceCleaner = new BacktraceCleaner();

    vi.spyOn(backtraceCleaner, "clean").mockReturnValue(["passed backtrace cleaner"]);
    await t.get("/", {
      headers: {
        "action_dispatch.show_exceptions": "all",
        "action_dispatch.backtrace_cleaner": backtraceCleaner,
      },
    });
    assertMatch(/passed backtrace cleaner/, body());
  });

  it("logs exception backtrace when all lines silenced", async () => {
    t.app = DevelopmentApp;

    const output = new StringIO();
    const backtraceCleaner = new BacktraceCleaner();
    backtraceCleaner.addSilencer(() => true);

    const env = {
      "action_dispatch.show_exceptions": "all",
      "action_dispatch.logger": new Logger(output),
      "action_dispatch.backtrace_cleaner": backtraceCleaner,
    };

    await t.get("/", { headers: env });
    assertOperator((output.rewind(), output.read()).split(/(?<=\n)/).length, ">", 10);
  });

  it("doesn't log the framework backtrace when error type is a routing error", async () => {
    t.app = ProductionApp;

    const output = new StringIO();
    const backtraceCleaner = new BacktraceCleaner();
    backtraceCleaner.addSilencer(() => true);

    const env = {
      "action_dispatch.show_exceptions": "all",
      "action_dispatch.logger": new Logger(output),
      "action_dispatch.log_rescued_responses": true,
      "action_dispatch.backtrace_cleaner": backtraceCleaner,
    };

    await assertRaises([RoutingError], {}, async () => {
      await t.get("/pass", { headers: env });
    });

    const log = (output.rewind(), output.read());

    assertIncludes(log, 'ActionController::RoutingError (No route matches [GET] "/pass")');
    assertEqual(3, log.split(/(?<=\n)/).length);
  });

  // BLOCKED: exception-without-message-reads-class-name
  it.skip("doesn't log the framework backtrace when error type is a invalid mime type", async () => {
    t.app = ProductionApp;

    const output = new StringIO();
    const backtraceCleaner = new BacktraceCleaner();
    backtraceCleaner.addSilencer(() => true);

    const env = {
      Accept: "text/html,*",
      "action_dispatch.show_exceptions": "all",
      "action_dispatch.logger": new Logger(output),
      "action_dispatch.log_rescued_responses": true,
      "action_dispatch.backtrace_cleaner": backtraceCleaner,
    };

    await assertRaises([InvalidType], {}, async () => {
      await t.get("/invalid_mimetype", { headers: env });
    });

    const log = (output.rewind(), output.read());

    assertIncludes(
      log,
      "ActionDispatch::Http::MimeNegotiation::InvalidType (ActionDispatch::Http::MimeNegotiation::InvalidType)",
    );
    assertEqual(3, log.split(/(?<=\n)/).length);
  });

  it("skips logging when rescued and log_rescued_responses is false", async () => {
    t.app = DevelopmentApp;

    const output = new StringIO();

    const env = {
      "action_dispatch.show_exceptions": "all",
      "action_dispatch.logger": new Logger(output),
      "action_dispatch.log_rescued_responses": false,
    };

    await t.get("/parameter_missing", { headers: env });
    t.assertResponse(400);
    assertEmpty((output.rewind(), output.read()).split(/(?<=\n)/).filter((l) => l !== ""));
  });

  it("does not skip logging when rescued and log_rescued_responses is true", async () => {
    t.app = DevelopmentApp;

    const output = new StringIO();

    const env = {
      "action_dispatch.show_exceptions": "all",
      "action_dispatch.logger": new Logger(output),
      "action_dispatch.log_rescued_responses": true,
    };

    await t.get("/parameter_missing", { headers: env });
    t.assertResponse(400);
    assertNotEmpty((output.rewind(), output.read()).split(/(?<=\n)/).filter((l) => l !== ""));
  });

  it("logs exception causes", async () => {
    t.app = DevelopmentApp;

    const output = new StringIO();

    const env = {
      "action_dispatch.show_exceptions": "all",
      "action_dispatch.logger": new Logger(output),
      "action_dispatch.log_rescued_responses": true,
    };

    await t.get("/nested_exceptions", { headers: env });
    t.assertResponse(500);
    const log = (output.rewind(), output.read());

    const paragraphs = log.split(/\n\s*\n/);

    assertIncludes(
      paragraphs[0],
      [
        "RuntimeError (Third error)",
        "Caused by: RuntimeError (Second error)",
        "Caused by: RuntimeError (First error)",
      ].join("\n"),
    );

    assertIncludes(paragraphs[1], "Information for: RuntimeError (Third error):");

    // eslint-disable-next-line vitest/no-conditional-in-test -- mirrors debug_exceptions_test.rb:656
    if (RUBY_VERSION >= "3.4") {
      assertMatch(
        new RegExp(["^.*raiseNestedExceptionsThird .*", ".*raiseNestedExceptions .*"].join("\n")),
        paragraphs[2],
      );

      assertIncludes(paragraphs[3], "Information for cause: RuntimeError (Second error):");

      assertMatch(
        new RegExp(
          [
            "^.*raiseNestedExceptionsSecond .*",
            ".*raiseNestedExceptionsThird .*",
            ".*raiseNestedExceptions .*",
          ].join("\n"),
        ),
        paragraphs[4],
      );

      assertIncludes(paragraphs[5], "Information for cause: RuntimeError (First error):");

      assertMatch(
        new RegExp(
          [
            "^.*raiseNestedExceptionsFirst .*",
            ".*raiseNestedExceptionsSecond .*",
            ".*raiseNestedExceptionsThird .*",
            ".*raiseNestedExceptions .*",
          ].join("\n"),
        ),
        paragraphs[6],
      );
    } else {
      assertMatch(
        new RegExp(
          [
            "^.*rescue in raiseNestedExceptionsThird .*",
            ".*raiseNestedExceptionsThird .*",
            ".*raiseNestedExceptions .*",
          ].join("\n"),
        ),
        paragraphs[2],
      );

      assertIncludes(paragraphs[3], "Information for cause: RuntimeError (Second error):");

      assertMatch(
        new RegExp(
          [
            "^.*rescue in raiseNestedExceptionsSecond .*",
            ".*raiseNestedExceptionsSecond .*",
            ".*raiseNestedExceptionsThird .*",
            ".*raiseNestedExceptions .*",
          ].join("\n"),
        ),
        paragraphs[4],
      );

      assertIncludes(paragraphs[5], "Information for cause: RuntimeError (First error):");

      assertMatch(
        new RegExp(
          [
            "^.*raiseNestedExceptionsFirst .*",
            ".*raiseNestedExceptionsSecond .*",
            ".*raiseNestedExceptionsThird .*",
            ".*raiseNestedExceptions .*",
          ].join("\n"),
        ),
        paragraphs[6],
      );
    }
  });

  it("display backtrace when error type is SyntaxError", async () => {
    t.app = DevelopmentApp;

    await t.get("/original_syntax_error", {
      headers: { "action_dispatch.backtrace_cleaner": new BacktraceCleaner() },
    });

    t.assertResponse(500);
    assertMatch(/syntax error, unexpected|syntax errors found/, body());
  });

  // BLOCKED: debug-view-rescue-templates-are-never-shipped
  it.skip("display backtrace on template missing errors", async () => {
    t.app = DevelopmentApp;
    const tc = t as never as { assertSelect(...a: unknown[]): void };

    await t.get("/missing_template");

    tc.assertSelect("header h1", /Template is missing/);

    tc.assertSelect("#container h2", /^Missing template/);

    tc.assertSelect("#Application-Trace-0");
    tc.assertSelect("#Framework-Trace-0");
    tc.assertSelect("#Full-Trace-0");

    tc.assertSelect("h2", /Request/);
  });

  // BLOCKED: debug-view-rescue-templates-are-never-shipped
  it.skip("display backtrace when error type is SyntaxError wrapped by ActionView::Template::Error", async () => {
    t.app = DevelopmentApp;
    const tc = t as never as { assertSelect(...a: unknown[]): void };

    await t.get("/syntax_error_into_view", {
      headers: { "action_dispatch.backtrace_cleaner": new BacktraceCleaner() },
    });

    t.assertResponse(500);
    tc.assertSelect("#Application-Trace-0", () => {
      tc.assertSelect("code", /syntax error, unexpected|syntax errors found/);
    });
    assertMatch(/Showing <i>.*dispatch\/debug-exceptions.test.ts<\/i>/, body());
  });

  // BLOCKED: debug-view-rescue-templates-are-never-shipped
  it.skip("debug exceptions app shows user code that caused the error in source view", async () => {
    t.app = DevelopmentApp;
    const tc = t as never as { assertSelect(...a: unknown[]): void };
    const cleaner = new BacktraceCleaner();
    cleaner.addSilencer((line) => /methodThatRaises/.test(line));
    cleaner.addSilencer((line) => !/dispatch\/debug-exceptions.test.ts/.test(line));

    await t.get("/framework_raises", { headers: { "action_dispatch.backtrace_cleaner": cleaner } });

    t.assertResponse(500);
    tc.assertSelect("div.exception-message", () => {
      tc.assertSelect("div", /error in framework/);
    });

    tc.assertSelect("div.source:not(.hidden)", () => {
      tc.assertSelect("pre .line.active", /methodThatRaises/);
    });

    tc.assertSelect("div.source", () => {
      tc.assertSelect("pre .line.active", /throw new StandardError/);
    });

    tc.assertSelect("#Application-Trace-0", () => {
      tc.assertSelect("code a:first", /dispatch\/debug-exceptions\.test\.ts:\d+/);
    });

    tc.assertSelect("#Framework-Trace-0", () => {
      tc.assertSelect("code a:first", /methodThatRaises/);
    });
  });

  it("invoke interceptors before rendering", async () => {
    t.app = InterceptedApp;
    await t.get("/intercepted_error", { headers: { "action_dispatch.show_exceptions": "all" } });

    assertEqual(InterceptedErrorInstance, t.request.getHeader("int"));
  });

  it("bad interceptors doesn't debug exceptions", async () => {
    t.app = BadInterceptedApp;

    await t.get("/puke", { headers: { "action_dispatch.show_exceptions": "all" } });

    t.assertResponse(500);
    assertMatch(/puke/, body());
  });

  // BLOCKED: debug-view-rescue-templates-are-never-shipped
  it.skip("debug exceptions app shows all the nested exceptions in source view", async () => {
    t.app = DevelopmentApp;
    const tc = t as never as { assertSelect(...a: unknown[]): void };
    const cleaner = new BacktraceCleaner();
    cleaner.addSilencer((line) => !/dispatch\/debug-exceptions.test.ts/.test(line));

    await t.get("/nested_exceptions", {
      headers: { "action_dispatch.backtrace_cleaner": cleaner },
    });

    t.assertResponse(500);
    tc.assertSelect("div.exception-message", () => {
      tc.assertSelect("div", /Third error/);
    });

    tc.assertSelect("div.source:not(.hidden)", () => {
      tc.assertSelect("pre .line.active", /Third error/);
    });

    tc.assertSelect("#Application-Trace-0", () => {
      tc.assertSelect("code a:first", /raiseNestedExceptionsThird/);
    });

    tc.assertSelect("#Application-Trace-1", () => {
      tc.assertSelect("code a:first", /raiseNestedExceptionsSecond/);
    });

    tc.assertSelect("#Application-Trace-2", () => {
      tc.assertSelect("code a:first", /raiseNestedExceptionsFirst/);
    });
  });

  // BLOCKED: debug-view-rescue-templates-are-never-shipped
  it.skip("shows a buttons for every action in an actionable error", async () => {
    t.app = DevelopmentApp;
    const tc = t as never as { assertSelect(...a: unknown[]): void };
    const cleaner = new BacktraceCleaner();
    cleaner.addSilencer((line) => !/dispatch\/debug-exceptions.test.ts/.test(line));

    await t.get("/actionable_error", { headers: { "action_dispatch.backtrace_cleaner": cleaner } });

    t.assertResponse(500);

    tc.assertSelect('input[value="Action 1"]');
    tc.assertSelect('input[value="Action 2"]');
  });

  it("debug exceptions app shows diagnostics when malformed query parameters are provided", async () => {
    t.app = DevelopmentApp;

    await t.get("/bad_request?x[y]=1&x[y][][w]=2");

    t.assertResponse(400);
    assertMatch("ActionController::BadRequest", body());
  });

  it("debug exceptions app shows diagnostics when malformed query parameters are provided by XHR", async () => {
    t.app = DevelopmentApp;
    const xhrRequestEnv = {
      "action_dispatch.show_exceptions": "all",
      HTTP_X_REQUESTED_WITH: "XMLHttpRequest",
    };

    await t.get("/bad_request?x[y]=1&x[y][][w]=2", { headers: xhrRequestEnv });

    t.assertResponse(400);
    assertMatch("ActionController::BadRequest", body());
  });

  // BLOCKED: debug-view-rescue-templates-are-never-shipped
  it.skip("debug exceptions app shows diagnostics for template errors that contain UTF-8 characters", async () => {
    t.app = DevelopmentApp;
    const tc = t as never as { assertSelect(...a: unknown[]): void };

    const io = new StringIO();
    const logger = new Logger(io);

    await t.get("/utf8_template_error", { headers: { "action_dispatch.logger": logger } });

    t.assertResponse(500);
    tc.assertSelect("#container p", /Showing .*debug-exceptions.test.ts where line #\d+ raised/);
    tc.assertSelect("#container code", /string”/);
  });
});

describe("DebugExceptions", () => {
  const errorApp = async (_env: RackEnv): Promise<RackResponse> => {
    throw new RuntimeError("puke!");
  };

  const env = (overrides: Partial<RackEnv> = {}): RackEnv => ({
    REQUEST_METHOD: "GET",
    PATH_INFO: "/test",
    "action_dispatch.show_detailed_exceptions": true,
    "action_dispatch.show_exceptions": "all",
    ...overrides,
  });

  it("routes non-HTML requests through renderForApiRequest when responseFormat is 'api'", async () => {
    const mw = new DebugExceptions(errorApp, null, "api");
    const [status, headers, raw] = await mw.call(env({ HTTP_ACCEPT: "application/json" }));
    expect(status).toBe(500);
    expect(headers["content-type"]).toContain("application/json");
    const text = await bodyToString(raw);
    const json = JSON.parse(text);
    expect(json.exception).toBeDefined();
    expect(json.traces["Application Trace"]).toBeDefined();
    expect(json.traces["Framework Trace"]).toBeDefined();
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
