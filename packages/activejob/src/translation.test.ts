import "./test-helpers/helper.js";
import { I18n } from "@blazetrails/activesupport";
import "@blazetrails/activesupport/testing/autorun";
import { registerConstant } from "@blazetrails/ruby-compat";
import { TestHost } from "./codegen-runtime.js";
import { TranslatedHelloJob } from "./test-helpers/jobs/translated-hello-job.js";
import { clear, lastValue } from "./test-helpers/support/job-buffer.js";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

describe("TranslationTest", () => {
  class TranslationTest extends TestHost {}
  registerConstant("TranslationTest", TranslationTest);
  beforeEach(async ({ testCase }: any) => {
    await testCase.setup();
  });
  afterEach(async ({ testCase }: any) => {
    await testCase.teardown();
  });
  beforeEach(async ({ testCase }: any) => {
    await clear();
    I18n.setAvailableLocales(["en", "de"]);
    testCase._job = new TranslatedHelloJob("Johannes");
  });
  afterEach(async ({ testCase }: any) => {
    I18n.setAvailableLocales(["en"]);
  });
  it("it performs the job in the given locale", async ({ testCase }: any) => {
    testCase._job.locale = "de";
    await await testCase._job.performNow();
    expect(await lastValue()).toEqual("Johannes says Guten Tag");
  });
});
