import { describe, it, expect } from "vitest";
import { ShowExceptions } from "../middleware/show-exceptions.js";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { bodyFromString, bodyToString } from "@blazetrails/rack";

class Boomer {
  async call(env: RackEnv): Promise<RackResponse> {
    const path = env["PATH_INFO"] as string;
    if (path === "/not_found") {
      const err = new Error("ActionNotFound");
      err.name = "RoutingError";
      throw err;
    }
    if (path === "/bad_params") {
      const err = new Error("bad params");
      err.name = "ParameterMissing";
      throw err;
    }
    throw new Error("puke!");
  }
}

function publicExceptionsApp(env: RackEnv): Promise<RackResponse> {
  const status = parseInt((env["PATH_INFO"] as string).slice(1), 10) || 500;
  return Promise.resolve([
    status,
    { "content-type": "text/html; charset=utf-8" },
    bodyFromString(`${status} error fixture\n`),
  ]);
}

function buildApp(
  exceptionsApp: (env: RackEnv) => Promise<RackResponse> = publicExceptionsApp,
): ShowExceptions {
  return new ShowExceptions((env: RackEnv) => new Boomer().call(env), exceptionsApp);
}

// ==========================================================================
// dispatch/show_exceptions_test.rb
// ==========================================================================
describe("ShowExceptionsTest", () => {
  it("skip exceptions app if not showing exceptions", async () => {
    const app = buildApp();
    await expect(
      app.call({
        REQUEST_METHOD: "GET",
        PATH_INFO: "/",
        "action_dispatch.show_exceptions": "none",
      }),
    ).rejects.toThrow("puke!");
  });

  it("rescue with error page", async () => {
    const app = buildApp();
    const [status, , body] = await app.call({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      "action_dispatch.show_exceptions": "all",
    });
    expect(status).toBe(500);
    expect(await bodyToString(body)).toContain("500");

    const [status2] = await app.call({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/bad_params",
      "action_dispatch.show_exceptions": "all",
    });
    expect(status2).toBe(400);

    const [status3] = await app.call({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/not_found",
      "action_dispatch.show_exceptions": "all",
    });
    expect(status3).toBe(404);
  });

  it("localize rescue error page", async () => {
    const app = buildApp();
    const [status, , body] = await app.call({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      "action_dispatch.show_exceptions": "all",
    });
    expect(status).toBe(500);
    expect(await bodyToString(body)).toContain("500");
  });

  it("sets the HTTP charset parameter", async () => {
    const app = buildApp();
    const [, headers] = await app.call({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      "action_dispatch.show_exceptions": "all",
    });
    expect(headers["content-type"]).toContain("charset=utf-8");
  });

  it("show registered original exception for wrapped exceptions", async () => {
    const app = buildApp();
    const [status, , body] = await app.call({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/not_found",
      "action_dispatch.show_exceptions": "all",
    });
    expect(status).toBe(404);
    expect(await bodyToString(body)).toContain("404");
  });

  it("calls custom exceptions app", async () => {
    let receivedException: unknown = null;
    let receivedPath: unknown = null;
    let receivedOriginalPath: unknown = null;

    const customApp = async (env: RackEnv): Promise<RackResponse> => {
      receivedException = env["action_dispatch.exception"];
      receivedPath = env["PATH_INFO"];
      receivedOriginalPath = env["action_dispatch.original_path"];
      return [404, { "content-type": "text/plain" }, bodyFromString("YOU FAILED")];
    };

    const app = buildApp(customApp);
    const [status, , body] = await app.call({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/not_found",
      "action_dispatch.show_exceptions": "all",
    });
    expect(status).toBe(404);
    expect(await bodyToString(body)).toBe("YOU FAILED");
    expect(receivedException).toBeInstanceOf(Error);
    expect(receivedPath).toBe("/404");
    expect(receivedOriginalPath).toBe("/not_found");
  });

  it("returns an empty response if custom exceptions app returns x-cascade pass", async () => {
    const cascadeApp = async (): Promise<RackResponse> => {
      return [404, { "x-cascade": "pass" }, bodyFromString("")];
    };

    const app = buildApp(cascadeApp);
    const [status, , body] = await app.call({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/not_found",
      "action_dispatch.show_exceptions": "all",
    });
    expect(status).toBe(404);
    expect(await bodyToString(body)).toBe("");
  });

  it("bad params exception is returned in the correct format", async () => {
    const app = buildApp();
    const [status, headers] = await app.call({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/bad_params",
      "action_dispatch.show_exceptions": "all",
    });
    expect(status).toBe(400);
    expect(headers["content-type"]).toContain("charset=utf-8");
  });

  it("failsafe prevents raising if exceptions_app raises", async () => {
    const failApp = async (): Promise<RackResponse> => {
      throw new Error("exceptions app also failed");
    };

    const app = buildApp(failApp);
    const [status, , body] = await app.call({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      "action_dispatch.show_exceptions": "all",
    });
    expect(status).toBe(500);
    expect(await bodyToString(body)).toContain("500 Internal Server Error");
  });
});
