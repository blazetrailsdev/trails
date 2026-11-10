import { describe, it } from "vitest";
import { assertEqual } from "@blazetrails/activesupport/testing/assertions";
import { extend } from "@blazetrails/ruby-compat";
import { Runner } from "../../../lib/action-dispatch/testing/integration.js";

describe("RunnerTest", () => {
  it("runner preserves the setting of integration_session", () => {
    const runner = new (class {
      beforeSetup(): void {}
    })();

    extend(runner, Runner);
    const r = runner as unknown as Runner;
    r.integrationSession.hostBang("lvh.me");

    r.beforeSetup();

    assertEqual("lvh.me", r.integrationSession.host);
  });
});
