import { describe, it } from "vitest";
import { classify, getEnv } from "@blazetrails/activesupport";
import { assertEqual } from "@blazetrails/activesupport/testing/assertions";
import { rbModName, rbObjClass } from "@blazetrails/ruby-compat";
import { ActiveJob } from "../lib/namespaces.js";
import "./support/helper.js";

describe("AdapterTest", () => {
  it(`should load ${getEnv("AJ_ADAPTER")} adapter`, () => {
    assertEqual(
      classify(`active_job/queue_adapters/${getEnv("AJ_ADAPTER")}_adapter`),
      rbModName(rbObjClass(ActiveJob.Base.queueAdapter)),
    );
  });
});
