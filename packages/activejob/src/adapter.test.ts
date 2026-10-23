import { describe, it } from "vitest";
import { assertEqual, classify, getEnv } from "@blazetrails/activesupport";
import { rbModName, rbObjClass } from "@blazetrails/ruby-compat";
import { ActiveJob } from "./namespaces.js";
import "./test-helpers/helper.js";

describe("AdapterTest", () => {
  it(`should load ${getEnv("AJ_ADAPTER")} adapter`, () => {
    assertEqual(
      classify(`active_job/queue_adapters/${getEnv("AJ_ADAPTER")}_adapter`),
      rbModName(rbObjClass(ActiveJob.Base.queueAdapter)),
    );
  });
});
