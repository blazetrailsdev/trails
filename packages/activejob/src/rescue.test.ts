import "./test-helpers/helper.js";
import { assertRaises } from "@blazetrails/activesupport";
import { RescueJob, OtherError } from "./test-helpers/jobs/rescue-job.js";
import { Person } from "./test-helpers/models/person.js";
import { JobBuffer } from "./test-helpers/support/job-buffer.js";
import { beforeEach, expect, it, describe } from "vitest";

describe("RescueTest", () => {
  beforeEach(() => {
    JobBuffer.clear();
  });

  it("rescue perform exception with retry", async () => {
    const job = new RescueJob("david");
    await job.performNow();
    expect(JobBuffer.values()).toEqual([
      "rescued from ArgumentError",
      "performed beautifully",
      "Retried job DIFFERENT!",
    ]);
  });

  it("let through unhandled perform exception", async () => {
    const job = new RescueJob("other");
    await assertRaises([OtherError], {}, async () => await job.performNow());
  });

  it("rescue from deserialization errors", async () => {
    await RescueJob.performLater(new Person(404));
    expect(JobBuffer.values()).toContainEqual("rescued from DeserializationError");
    expect(JobBuffer.values()).toContainEqual(
      "DeserializationError original exception was Person::RecordNotFound",
    );
    expect(JobBuffer.values()).not.toContainEqual("performed beautifully");
  });

  it("should not wrap DeserializationError in DeserializationError", async () => {
    await RescueJob.performLater([new Person(404)]);
    expect(JobBuffer.values()).toContainEqual(
      "DeserializationError original exception was Person::RecordNotFound",
    );
  });

  it("rescue from exceptions that don't inherit from StandardError", async () => {
    await RescueJob.performLater("rafael");
    expect(JobBuffer.values()).toEqual(["rescued from NotImplementedError"]);
  });
});
