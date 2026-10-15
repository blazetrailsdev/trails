import { beforeEach, describe, it } from "vitest";
import { Lint } from "@blazetrails/rack";
import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";
import {
  I18n,
  assertEqual,
  assertKindOf,
  assertMatch,
  assertRaise,
} from "@blazetrails/activesupport";
import { RuntimeError, StandardError } from "@blazetrails/ruby-compat";
import { TemplateError } from "@blazetrails/actionview";
import { ActionNotFound } from "../../abstract-controller/base.js";
import { MethodNotAllowed, UnknownHttpMethod } from "../../action-controller/metal/exceptions.js";
import { X_CASCADE } from "../constants.js";
import { InvalidType } from "../http/mime-negotiation.js";
import { ParseError } from "../http/parameters.js";
import { Request } from "../http/request.js";
import { PublicExceptions } from "../middleware/public-exceptions.js";
import { ShowExceptions } from "../middleware/show-exceptions.js";
import type { RackAppObject } from "../middleware/stack.js";
import { IntegrationTest } from "../testing/integration.js";
import { FIXTURE_LOAD_PATH } from "../../test-helpers/abstract-unit.js";

class Boomer {
  async call(env: RackEnv): Promise<RackResponse> {
    const req = new Request(env);
    switch (req.path) {
      case "/not_found":
        throw new ActionNotFound();
      case "/invalid_mimetype":
        throw new InvalidType();
      case "/bad_params":
      case "/bad_params.json":
        try {
          throw new StandardError();
        } catch {
          throw new ParseError();
        }
      case "/method_not_allowed":
        throw new MethodNotAllowed("PUT");
      case "/unknown_http_method":
        throw new UnknownHttpMethod();
      case "/not_found_original_exception":
        try {
          throw new ActionNotFound();
        } catch (e) {
          throw new TemplateError({ original: e as Error, template: "template" as never });
        }
      default:
        throw new RuntimeError("puke!");
    }
  }
}

function buildApp(exceptionsApp: RackApp | RackAppObject | null = null): Lint {
  exceptionsApp ??= new PublicExceptions(`${FIXTURE_LOAD_PATH}/public`);
  return new Lint(new ShowExceptions(new Lint(new Boomer()), exceptionsApp));
}

describe("ShowExceptionsTest", () => {
  let testCase: IntegrationTest;

  beforeEach(({ task }) => {
    testCase = new IntegrationTest(task.name);
    testCase.app = buildApp();
  });

  it("skip exceptions app if not showing exceptions", async () => {
    await assertRaise([RuntimeError], {}, async () => {
      await testCase.get("/", { env: { "action_dispatch.show_exceptions": "none" } });
    });
  });

  it("rescue with error page", async () => {
    await testCase.get("/", { env: { "action_dispatch.show_exceptions": "all" } });
    testCase.assertResponse(500);
    assertEqual("500 error fixture\n", testCase.body);

    await testCase.get("/bad_params", { env: { "action_dispatch.show_exceptions": "all" } });
    testCase.assertResponse(400);
    assertEqual("400 error fixture\n", testCase.body);

    await testCase.get("/not_found", { env: { "action_dispatch.show_exceptions": "all" } });
    testCase.assertResponse(404);
    assertEqual("404 error fixture\n", testCase.body);

    await testCase.get("/method_not_allowed", {
      env: { "action_dispatch.show_exceptions": "all" },
    });
    testCase.assertResponse(405);
    assertEqual("", testCase.body);

    await testCase.get("/unknown_http_method", {
      env: { "action_dispatch.show_exceptions": "all" },
    });
    testCase.assertResponse(405);
    assertEqual("", testCase.body);

    await testCase.get("/invalid_mimetype", {
      headers: { Accept: "text/html,*", "action_dispatch.show_exceptions": "all" },
    });
    testCase.assertResponse(406);
    assertEqual("", testCase.body);
  });

  it("localize rescue error page", async () => {
    const oldLocale = I18n.locale();
    I18n.setLocale("da");

    try {
      await testCase.get("/", { env: { "action_dispatch.show_exceptions": "all" } });
      testCase.assertResponse(500);
      assertEqual("500 localized error fixture\n", testCase.body);

      await testCase.get("/not_found", { env: { "action_dispatch.show_exceptions": "all" } });
      testCase.assertResponse(404);
      assertEqual("404 error fixture\n", testCase.body);
    } finally {
      I18n.setLocale(oldLocale);
    }
  });

  it("sets the HTTP charset parameter", async () => {
    await testCase.get("/", { env: { "action_dispatch.show_exceptions": "all" } });
    assertEqual("text/html; charset=utf-8", testCase.response.headers.get("content-type"));
  });

  it("show registered original exception for wrapped exceptions", async () => {
    await testCase.get("/not_found_original_exception", {
      env: { "action_dispatch.show_exceptions": "all" },
    });
    testCase.assertResponse(404);
    assertMatch(/404 error/, testCase.body!);
  });

  it("calls custom exceptions app", async () => {
    const exceptionsApp = async (env: RackEnv): Promise<RackResponse> => {
      assertKindOf(ActionNotFound, env["action_dispatch.exception"]);
      assertEqual("/404", env["PATH_INFO"]);
      assertEqual("/not_found_original_exception", env["action_dispatch.original_path"]);
      return [404, { "content-type": "text/plain" }, ["YOU FAILED"]] as unknown as RackResponse;
    };

    testCase.app = buildApp(exceptionsApp);

    await testCase.get("/not_found_original_exception", {
      env: { "action_dispatch.show_exceptions": "all" },
    });
    testCase.assertResponse(404);
    assertEqual("YOU FAILED", testCase.body);
  });

  it("returns an empty response if custom exceptions app returns x-cascade pass", async () => {
    const exceptionsApp = async (_env: RackEnv): Promise<RackResponse> =>
      [404, { [X_CASCADE]: "pass" }, []] as unknown as RackResponse;

    testCase.app = buildApp(exceptionsApp);

    await testCase.get("/method_not_allowed", {
      env: { "action_dispatch.show_exceptions": "all" },
    });
    testCase.assertResponse(405);
    assertEqual("", testCase.body);
  });

  it("bad params exception is returned in the correct format", async () => {
    await testCase.get("/bad_params", { env: { "action_dispatch.show_exceptions": "all" } });
    assertEqual("text/html; charset=utf-8", testCase.response.headers.get("content-type"));
    testCase.assertResponse(400);
    assertMatch(/400 error/, testCase.body!);

    await testCase.get("/bad_params.json", { env: { "action_dispatch.show_exceptions": "all" } });
    assertEqual("application/json; charset=utf-8", testCase.response.headers.get("content-type"));
    testCase.assertResponse(400);
    assertEqual('{"status":400,"error":"Bad Request"}', testCase.body);
  });

  it("failsafe prevents raising if exceptions_app raises", async () => {
    testCase.app = buildApp(async (_env: RackEnv) => {
      throw new RuntimeError();
    });

    await testCase.get("/");

    testCase.assertResponse(500);
    assertMatch(/500 Internal Server Error/, testCase.body!);
  });
});
