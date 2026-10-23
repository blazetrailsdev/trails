import { beforeEach, describe, expect, it } from "vitest";
import { assertIncludes, assertNotIncludes } from "@blazetrails/activesupport";
import "./test-helpers/helper.js";
import { RescueJob } from "./test-helpers/jobs/rescue-job.js";
import { Person } from "./test-helpers/models/person.js";
import { JobBuffer } from "./test-helpers/support/job-buffer.js";

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
    await expect(job.performNow()).rejects.toThrow(
      (RescueJob as unknown as { OtherError: new () => Error }).OtherError,
    );
  });

  it("rescue from deserialization errors", async () => {
    await RescueJob.performLater(new Person(404));
    assertIncludes(JobBuffer.values(), "rescued from DeserializationError");
    assertIncludes(
      JobBuffer.values(),
      "DeserializationError original exception was Person::RecordNotFound",
    );
    assertNotIncludes(JobBuffer.values(), "performed beautifully");
  });

  it("should not wrap DeserializationError in DeserializationError", async () => {
    await RescueJob.performLater([new Person(404)]);
    assertIncludes(
      JobBuffer.values(),
      "DeserializationError original exception was Person::RecordNotFound",
    );
  });

  it("rescue from exceptions that don't inherit from StandardError", async () => {
    await RescueJob.performLater("rafael");
    expect(JobBuffer.values()).toEqual(["rescued from NotImplementedError"]);
  });
});
