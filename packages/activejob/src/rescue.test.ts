import "./test-helpers/helper.js";
import { assertRaises } from "@blazetrails/activesupport";
import "@blazetrails/activesupport/testing/autorun";
import { registerConstant } from "@blazetrails/ruby-compat";
import { TestHost } from "./codegen-runtime.js";
import { RescueJob, OtherError } from "./test-helpers/jobs/rescue-job.js";
import { Person } from "./test-helpers/models/person.js";
import { clear, values } from "./test-helpers/support/job-buffer.js";
import { describe, beforeEach, it, expect, afterEach } from "vitest";

describe("RescueTest", () => {
  class RescueTest extends TestHost {}
  registerConstant("RescueTest", RescueTest);
  beforeEach(async ({ testCase }: any) => {
    await testCase.setup();
  });
  afterEach(async ({ testCase }: any) => {
    await testCase.teardown();
  });
  beforeEach(async ({ testCase }: any) => {
    await clear();
  });
  it("rescue perform exception with retry", async ({ testCase }: any) => {
    const job: any = new RescueJob("david");
    await await job.performNow();
    expect(await values()).toEqual([
      "rescued from ArgumentError",
      "performed beautifully",
      "Retried job DIFFERENT!",
    ]);
  });
  it("let through unhandled perform exception", async ({ testCase }: any) => {
    const job: any = new RescueJob("other");
    await assertRaises([OtherError], {}, async () => await await job.performNow());
  });
  it("rescue from deserialization errors", async ({ testCase }: any) => {
    await await RescueJob.performLater(new Person(404));
    expect(await values()).toContain("rescued from DeserializationError");
    expect(await values()).toContain(
      "DeserializationError original exception was Person::RecordNotFound",
    );
    expect(await values()).not.toContain("performed beautifully");
  });
  it("should not wrap DeserializationError in DeserializationError", async ({ testCase }: any) => {
    await await RescueJob.performLater([new Person(404)]);
    expect(await values()).toContain(
      "DeserializationError original exception was Person::RecordNotFound",
    );
  });
  it("rescue from exceptions that don't inherit from StandardError", async ({ testCase }: any) => {
    await await RescueJob.performLater("rafael");
    expect(await values()).toEqual(["rescued from NotImplementedError"]);
  });
});
