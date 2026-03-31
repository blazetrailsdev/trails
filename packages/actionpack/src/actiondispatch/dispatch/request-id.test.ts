import { describe, it, expect } from "vitest";
import { RequestId } from "../middleware/request-id.js";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { bodyFromString, bodyToString } from "@blazetrails/rack";

const echoApp = async (env: RackEnv): Promise<RackResponse> => [
  200,
  { "content-type": "text/plain" },
  bodyFromString(String(env["action_dispatch.request_id"] ?? "")),
];

// ==========================================================================
// dispatch/request_id_test.rb
// ==========================================================================
describe("RequestIdTest", () => {
  it("passing on the request id from the outside", async () => {
    const mw = new RequestId(echoApp);
    const [, headers] = await mw.call({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      HTTP_X_REQUEST_ID: "external-id-123",
    });
    expect(headers["x-request-id"]).toBe("external-id-123");
  });

  it("passing on the request id via a configured header", async () => {
    const mw = new RequestId(echoApp, { header: "X-Correlation-Id" });
    const [, headers] = await mw.call({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      HTTP_X_CORRELATION_ID: "corr-123",
    });
    expect(headers["x-correlation-id"]).toBe("corr-123");
  });

  it("ensure that only alphanumeric uurids are accepted", async () => {
    const mw = new RequestId(echoApp);
    const [, headers] = await mw.call({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      HTTP_X_REQUEST_ID: "hello world<script>",
    });
    expect(headers["x-request-id"]).toBe("helloworldscript");
  });

  it("accept Apache mod_unique_id format", async () => {
    const mw = new RequestId(echoApp);
    const modUniqueId = "abcdef1234567890ABCDEF-";
    const [, headers] = await mw.call({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      HTTP_X_REQUEST_ID: modUniqueId,
    });
    expect(headers["x-request-id"]).toBe("abcdef1234567890ABCDEF-");
  });

  it("ensure that 255 char limit on the request id is being enforced", async () => {
    const mw = new RequestId(echoApp);
    const longId = "a".repeat(300);
    const [, headers] = await mw.call({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      HTTP_X_REQUEST_ID: longId,
    });
    expect(headers["x-request-id"].length).toBeLessThanOrEqual(255);
  });

  it("generating a request id when none is supplied", async () => {
    const mw = new RequestId(echoApp);
    const [, headers] = await mw.call({ REQUEST_METHOD: "GET", PATH_INFO: "/" });
    const id = headers["x-request-id"];
    expect(id).toBeTruthy();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("uuid alias", async () => {
    const mw = new RequestId(echoApp);
    const env: RackEnv = { REQUEST_METHOD: "GET", PATH_INFO: "/" };
    await mw.call(env);
    const requestId = env["action_dispatch.request_id"] as string;
    expect(requestId).toBeTruthy();
    expect(requestId).toMatch(/^[0-9a-f-]+$/);
  });
});

describe("RequestIdResponseTest", () => {
  it("request id is passed all the way to the response", async () => {
    const mw = new RequestId(echoApp);
    const [, headers, body] = await mw.call({ REQUEST_METHOD: "GET", PATH_INFO: "/" });
    const responseId = headers["x-request-id"];
    const bodyStr = await bodyToString(body);
    expect(bodyStr).toBe(responseId);
  });

  it("request id given on request is passed all the way to the response", async () => {
    const mw = new RequestId(echoApp);
    const [, headers, body] = await mw.call({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      HTTP_X_REQUEST_ID: "my-custom-id",
    });
    expect(headers["x-request-id"]).toBe("my-custom-id");
    const bodyStr = await bodyToString(body);
    expect(bodyStr).toBe("my-custom-id");
  });

  it("using a custom request_id header key", async () => {
    const mw = new RequestId(echoApp, { header: "X-Trace-Id" });
    const [, headers] = await mw.call({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      HTTP_X_TRACE_ID: "trace-abc",
    });
    expect(headers["x-trace-id"]).toBe("trace-abc");
  });
});
