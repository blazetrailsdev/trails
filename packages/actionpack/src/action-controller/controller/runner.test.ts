import { describe, it } from "vitest";
import { assertRespondTo, include } from "@blazetrails/activesupport";
import { Runner, type Session } from "../../action-dispatch/testing/integration.js";

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
      })() as unknown as Session,
    );
    assertRespondTo(runner, "hi");
    assertRespondTo(runner, "x");
  });
});
