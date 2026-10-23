import "./test-helpers/helper.js";
import { I18n } from "@blazetrails/activesupport";
import { TranslatedHelloJob } from "./test-helpers/jobs/translated-hello-job.js";
import { JobBuffer } from "./test-helpers/support/job-buffer.js";
import { beforeEach, afterEach, expect, it, describe } from "vitest";

describe("TranslationTest", () => {
  let job: unknown;

  beforeEach(() => {
    JobBuffer.clear();
    I18n.setAvailableLocales(["en", "de"]);
    job = new TranslatedHelloJob("Johannes");
  });

  afterEach(() => {
    I18n.setAvailableLocales(["en"]);
  });

  it("it performs the job in the given locale", async () => {
    job.locale = "de";
    await job.performNow();
    expect(JobBuffer.lastValue()).toEqual("Johannes says Guten Tag");
  });
});
