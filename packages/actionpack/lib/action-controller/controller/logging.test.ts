import { beforeEach, describe, expect, it } from "vitest";
import { assertNoChanges, Logger } from "@blazetrails/activesupport";
import { Base } from "../base.js";
import { TestCase } from "../test-case.js";
import "../../test-helpers/abstract-unit.js";

class TestController extends Base {
  declare logger: Logger;

  static {
    this.logAt(":debug", {
      if(this: TestController) {
        return this.params.get("level") === "debug";
      },
    });
    this.logAt(":warn", {
      if(this: TestController) {
        return this.params.get("level") === "warn";
      },
    });
  }

  async show(): Promise<void> {
    await this.render({ plain: this.logger.level });
  }
}

describe("LoggingTest", () => {
  let tc: TestCase;
  let logger: Logger;

  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    tc.controller = new TestController();
    await tc.beforeSetup();
    logger = (tc.controller as TestController).logger = new Logger(null, { level: Logger.INFO });
  });

  it("logging at the default level", async () => {
    await tc.get("show");
    expect(tc.response.body).toBe(String(Logger.INFO));
  });

  it("logging at a noisier level per request", async () => {
    await assertNoChanges(
      () => logger.level,
      null,
      {},
      async () => {
        await tc.get("show", { params: { level: "debug" } });
        expect(tc.response.body).toBe(String(Logger.DEBUG));
      },
    );
  });

  it("logging at a quieter level per request", async () => {
    await assertNoChanges(
      () => logger.level,
      null,
      {},
      async () => {
        await tc.get("show", { params: { level: "warn" } });
        expect(tc.response.body).toBe(String(Logger.WARN));
      },
    );
  });
});
