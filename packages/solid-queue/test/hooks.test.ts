import { describe, expect, it } from "vitest";
import "./support/dummy-application.js";
import "./test-helper.js";
import { app } from "./support/dummy/config/application.js";

describe("HooksTest", () => {
  it("solid_queue_record hook ran", () => {
    expect(app.config.x.solidQueueRecordHookRan).toBeTruthy();
  });
});
