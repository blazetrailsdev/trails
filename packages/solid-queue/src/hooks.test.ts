import { describe, expect, it } from "vitest";
import "./test-helpers/dummy-application.js";
import { Record } from "./record.js";
import { x } from "./test-helpers/dummy/config/initializers/solid-queue-record.js";

describe("HooksTest", () => {
  it("solid_queue_record hook ran", () => {
    void Record;
    expect(x.solidQueueRecordHookRan).toBeTruthy();
  });
});
