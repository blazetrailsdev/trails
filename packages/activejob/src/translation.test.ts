import { afterEach, beforeEach, describe, it } from "vitest";
import { assertEqual } from "@blazetrails/activesupport";
import { setAvailableLocales } from "@blazetrails/i18n";
import "./test-helpers/helper.js";
import { TranslatedHelloJob } from "./test-helpers/jobs/translated-hello-job.js";
import { JobBuffer } from "./test-helpers/support/job-buffer.js";

describe("TranslationTest", () => {
  let job: TranslatedHelloJob;

  beforeEach(() => {
    JobBuffer.clear();
    setAvailableLocales(["en", "de"]);
    job = new TranslatedHelloJob("Johannes");
  });

  afterEach(() => {
    setAvailableLocales(["en"]);
  });

  it("it performs the job in the given locale", async () => {
    job.locale = "de";
    await job.performNow();
    assertEqual("Johannes says Guten Tag", JobBuffer.lastValue());
  });
});
