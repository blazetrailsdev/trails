import { describe, it } from "vitest";
import { include } from "@blazetrails/activesupport";
import { assertRespondTo } from "@blazetrails/activesupport/testing/assertions";
import { Runner } from "../../../lib/action-dispatch/testing/integration.js";

describe("RunnerTest", () => {
  class MyRunner {
    _integrationSession: unknown;

    constructor(session: unknown) {
      this._integrationSession = session;
    }

    hi(): void {}
  }
  include(MyRunner, Runner);

  it("respond to?", () => {
    const runner = new MyRunner(
      new (class {
        x(): void {}
      })(),
    );
    assertRespondTo(runner, "hi");
    assertRespondTo(runner, "x");
  });
});
