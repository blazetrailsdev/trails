import { beforeEach, describe, expect, it } from "vitest";
import { IntegrationTest } from "@blazetrails/actionpack/testing";
import { app } from "../test-helper.js";
import "../dummy/app/controllers/request-ids-controller.js";

let t: IntegrationTest;

describe("Turbo::RequestIdTrackingTest", () => {
  beforeEach(() => {
    t = new IntegrationTest(expect.getState().currentTestName!);
    t.app = app;
  });

  it("set the current turbo request id from the value in the X-Turbo-Request-Id header", async () => {
    await t.get("/request_id", { headers: { "X-Turbo-Request-Id": "123" } });
    expect(JSON.parse(String(t.response.body))["turbo_frame_request_id"]).toBe("123");
  });
});
