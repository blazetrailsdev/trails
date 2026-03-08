import { describe, it, expect } from "vitest";
import { RequestId } from "./request-id.js";
import type { RackEnv, RackResponse } from "@rails-ts/rack";
import { bodyFromString } from "@rails-ts/rack";

const echoApp = async (env: RackEnv): Promise<RackResponse> => [
  200,
  { "content-type": "text/plain" },
  bodyFromString(String(env["action_dispatch.request_id"] ?? "")),
];

// ==========================================================================
// dispatch/request_id_test.rb
// ==========================================================================
describe("ActionDispatch::RequestId", () => {
  it("generates a request id if none provided", async () => {
    const mw = new RequestId(echoApp);
    const [, headers] = await mw.call({ REQUEST_METHOD: "GET", PATH_INFO: "/" });
    const id = headers["x-request-id"];
    expect(id).toBeTruthy();
    // UUID format
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("passes existing request id through", async () => {
    const mw = new RequestId(echoApp);
    const [, headers] = await mw.call({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      HTTP_X_REQUEST_ID: "external-id-123",
    });
    expect(headers["x-request-id"]).toBe("external-id-123");
  });

  it("sanitizes request id", async () => {
    const mw = new RequestId(echoApp);
    const [, headers] = await mw.call({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      HTTP_X_REQUEST_ID: "hello world<script>",
    });
    // Should strip non-alphanumeric/dash/underscore chars
    expect(headers["x-request-id"]).toBe("helloworldscript");
  });

  it("generates new id for empty request id", async () => {
    const mw = new RequestId(echoApp);
    const [, headers] = await mw.call({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      HTTP_X_REQUEST_ID: "",
    });
    expect(headers["x-request-id"]).toMatch(/^[0-9a-f-]+$/);
  });

  it("sets request id in env", async () => {
    const mw = new RequestId(echoApp);
    const env: RackEnv = { REQUEST_METHOD: "GET", PATH_INFO: "/" };
    await mw.call(env);
    expect(env["action_dispatch.request_id"]).toBeTruthy();
  });

  it("truncates long request ids", async () => {
    const mw = new RequestId(echoApp);
    const longId = "a".repeat(300);
    const [, headers] = await mw.call({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      HTTP_X_REQUEST_ID: longId,
    });
    expect(headers["x-request-id"].length).toBeLessThanOrEqual(255);
  });

  it("unique ids for different requests", async () => {
    const mw = new RequestId(echoApp);
    const [, h1] = await mw.call({ REQUEST_METHOD: "GET", PATH_INFO: "/" });
    const [, h2] = await mw.call({ REQUEST_METHOD: "GET", PATH_INFO: "/" });
    expect(h1["x-request-id"]).not.toBe(h2["x-request-id"]);
  });

  it("accepts dashes and underscores", async () => {
    const mw = new RequestId(echoApp);
    const [, headers] = await mw.call({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      HTTP_X_REQUEST_ID: "abc-123_def",
    });
    expect(headers["x-request-id"]).toBe("abc-123_def");
  });

  it("custom header name", async () => {
    const mw = new RequestId(echoApp, { header: "X-Correlation-Id" });
    const [, headers] = await mw.call({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      HTTP_X_CORRELATION_ID: "corr-123",
    });
    expect(headers["x-correlation-id"]).toBe("corr-123");
  });

  it("strips special characters from id", async () => {
    const mw = new RequestId(echoApp);
    const [, headers] = await mw.call({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      HTTP_X_REQUEST_ID: "id;with\nnewline",
    });
    expect(headers["x-request-id"]).toBe("idwithnewline");
  });
});
