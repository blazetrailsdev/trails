import { beforeAll, describe, expect, it } from "vitest";
import { TopLevel, runLoadHooks } from "@blazetrails/activesupport";
import { Engine } from "../lib/engine.js";

describe("Turbo::Engine turbo.test_assertions", () => {
  beforeAll(async () => {
    const activeSupport = TopLevel.ActiveSupport as { TestCase?: unknown };
    const testCase = activeSupport.TestCase;
    delete activeSupport.TestCase;
    try {
      await Engine.instance()
        .initializers.find((i) => i.name === "turbo.test_assertions")!
        .run();
    } finally {
      activeSupport.TestCase = testCase;
    }
    runLoadHooks("action_cable", {});
  });

  it("includes TestAssertions into a test case evaluated after the initializer ran", () => {
    class LateTestCase {}
    runLoadHooks("active_support_test_case", LateTestCase);

    expect(typeof (LateTestCase.prototype as Record<string, unknown>).assertTurboStream).toBe(
      "function",
    );
  });

  it("includes the Broadcastable test helper only when ActiveJob is defined at fire time", () => {
    class WithActiveJob {}
    runLoadHooks("active_support_test_case", WithActiveJob);

    const topLevel = TopLevel as { ActiveJob?: unknown };
    const activeJob = topLevel.ActiveJob;
    delete topLevel.ActiveJob;
    class WithoutActiveJob {}
    try {
      runLoadHooks("active_support_test_case", WithoutActiveJob);
    } finally {
      topLevel.ActiveJob = activeJob;
    }

    expect(
      typeof (WithActiveJob.prototype as Record<string, unknown>).captureTurboStreamBroadcasts,
    ).toBe("function");
    expect(
      (WithoutActiveJob.prototype as Record<string, unknown>).captureTurboStreamBroadcasts,
    ).toBeUndefined();
  });

  it("includes IntegrationTestAssertions into an integration test evaluated later", () => {
    class LateIntegrationTest {}
    runLoadHooks("action_dispatch_integration_test", LateIntegrationTest);

    expect(
      typeof (LateIntegrationTest.prototype as Record<string, unknown>).assertTurboStream,
    ).toBe("function");
  });
});
