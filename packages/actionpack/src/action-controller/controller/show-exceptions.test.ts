import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActiveSupportJSON, toXml } from "@blazetrails/activesupport";
import { rbObjIvarGet, rbObjIvarSet, stderr } from "@blazetrails/ruby-compat";
import { IntegrationTest } from "../../action-dispatch/testing/integration.js";
import { DebugExceptions } from "../../action-dispatch/middleware/debug-exceptions.js";
import { PublicExceptions } from "../../action-dispatch/middleware/public-exceptions.js";
import { ShowExceptions } from "../../action-dispatch/middleware/show-exceptions.js";
import { Base } from "../base.js";
import { FIXTURE_LOAD_PATH } from "../../test-helpers/abstract-unit.js";

class ShowExceptionsController extends Base {
  static {
    this.use(ShowExceptions, new PublicExceptions(`${FIXTURE_LOAD_PATH}/public`));
    this.use(DebugExceptions);

    this.beforeAction(
      function (this: ShowExceptionsController) {
        this.request.env["action_dispatch.show_detailed_exceptions"] = true;
      },
      { only: "anotherBoom" },
    );
  }

  boom(): void {
    throw new Error("boom!");
  }

  anotherBoom(): void {
    throw new Error("boom!");
  }

  override isShowDetailedExceptions = function (this: ShowExceptionsController): boolean {
    return this.request.isLocal;
  };
}

describe("ShowExceptionsTest", () => {
  // BLOCKED: debug-exceptions-gates-on-wrapper-show-and-request-headers
  it.skip("show error page from a remote ip", async ({ task }) => {
    const t = new IntegrationTest(task.name);
    t.app = ShowExceptionsController.action("boom");
    t.remoteAddr = "208.77.188.166";
    await t.get("/");
    expect(t.body).toBe("500 error fixture\n");
  });

  it("show diagnostics from a local ip if show_detailed_exceptions? is set to request.local?", async ({
    task,
  }) => {
    const t = new IntegrationTest(task.name);
    t.app = ShowExceptionsController.action("boom");
    for (const ipAddress of [
      "127.0.0.1",
      "127.0.0.127",
      "127.12.1.1",
      "::1",
      "0:0:0:0:0:0:0:1",
      "0:0:0:0:0:0:0:1%0",
    ]) {
      t.remoteAddr = ipAddress;
      await t.get("/");
      expect(t.body).toMatch(/boom/);
    }
  });

  it("show diagnostics from a remote ip when env is already set", async ({ task }) => {
    const t = new IntegrationTest(task.name);
    t.app = ShowExceptionsController.action("anotherBoom");
    t.remoteAddr = "208.77.188.166";
    await t.get("/");
    expect(t.body).toMatch(/boom/);
  });
});

class ShowExceptionsOverriddenController extends ShowExceptionsController {
  override isShowDetailedExceptions = function (this: ShowExceptionsOverriddenController): boolean {
    return this.params.get("detailed") === "1";
  };
}

describe("ShowExceptionsOverriddenTest", () => {
  // BLOCKED: debug-exceptions-gates-on-wrapper-show-and-request-headers
  it.skip("show error page", async ({ task }) => {
    const t = new IntegrationTest(task.name);
    t.app = ShowExceptionsOverriddenController.action("boom");
    await t.get("/", { params: { detailed: "0" } });
    expect(t.body).toBe("500 error fixture\n");
  });

  it("show diagnostics message", async ({ task }) => {
    const t = new IntegrationTest(task.name);
    t.app = ShowExceptionsOverriddenController.action("boom");
    await t.get("/", { params: { detailed: "1" } });
    expect(t.body).toMatch(/boom/);
  });
});

describe("ShowExceptionsFormatsTest", () => {
  let t: IntegrationTest;
  const assertResponse = (type: number | string): void => t.assertResponse(type);

  beforeEach(({ task }) => {
    t = new IntegrationTest(task.name);
  });

  // BLOCKED: debug-exceptions-gates-on-wrapper-show-and-request-headers
  it.skip("render json exception", async () => {
    t.app = ShowExceptionsOverriddenController.action("boom");
    await t.get("/", { headers: { HTTP_ACCEPT: "application/json" } });
    assertResponse("internal_server_error");
    expect(t.response.mediaType).toBe("application/json");
    expect(t.response.body).toBe(
      ActiveSupportJSON.encode({ status: 500, error: "Internal Server Error" }),
    );
  });

  // BLOCKED: debug-exceptions-gates-on-wrapper-show-and-request-headers
  it.skip("render xml exception", async () => {
    t.app = ShowExceptionsOverriddenController.action("boom");
    await t.get("/", { headers: { HTTP_ACCEPT: "application/xml" } });
    assertResponse("internal_server_error");
    expect(t.response.mediaType).toBe("application/xml");
    expect(t.response.body).toBe(toXml({ status: 500, error: "Internal Server Error" }));
  });

  it("render fallback exception", async () => {
    t.app = ShowExceptionsOverriddenController.action("boom");
    await t.get("/", { headers: { HTTP_ACCEPT: "text/csv" } });
    assertResponse("internal_server_error");
    expect(t.response.mediaType).toBe("text/html");
  });
});

describe("ShowFailsafeExceptionsTest", () => {
  // BLOCKED: middleware-build-returns-a-closure-not-the-middleware-instance
  it.skip("render failsafe exception", async ({ task }) => {
    const t = new IntegrationTest(task.name);
    t.app = ShowExceptionsOverriddenController.action("boom");
    const middleware = t.app as object;
    const exceptionsApp = rbObjIvarGet(middleware, "@exceptionsApp");
    try {
      rbObjIvarSet(middleware, "@exceptionsApp", null);
      vi.spyOn(stderr, "write").mockImplementation(() => true);

      await t.get("/", { headers: { HTTP_ACCEPT: "text/json" } });
      t.assertResponse("internal_server_error");
      expect(t.response.mediaType).toBe("text/plain");
    } finally {
      rbObjIvarSet(middleware, "@exceptionsApp", exceptionsApp);
      vi.restoreAllMocks();
    }
  });
});
