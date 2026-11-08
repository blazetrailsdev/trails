import { describe, expect, it } from "vitest";
import "./test-helpers/dummy-application.js";
import { app } from "./test-helpers/dummy/config/application.js";

describe("HooksTest", () => {
  it("solid_queue_record hook ran", () => {
    expect(app.config.x.solidQueueRecordHookRan).toBeTruthy();
  });
});
