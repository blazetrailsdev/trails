import { beforeEach, describe, expect, it } from "vitest";
import { Logger } from "@blazetrails/activesupport";
import { StringIO } from "@blazetrails/ruby-compat";
import { Base } from "../base.js";
import { TestCase } from "../test-case.js";
import "../../test-helpers/abstract-unit.js";

class UsersController extends Base {
  create(): void {
    this.head("ok");
  }
}

describe("ParamsParseTest", () => {
  let tc: TestCase;

  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    tc.controller = new UsersController();
    await tc.beforeSetup();
  });

  async function captureLogOutput(block: () => Promise<void>): Promise<string> {
    const output = new StringIO();
    tc.request.setHeader("action_dispatch.logger", new Logger(output));
    await block();
    return output.string();
  }

  it("parse error logged once", async () => {
    const logOutput = await captureLogOutput(async () => {
      await tc.post("create", { body: "{", as: "json" });
    });
    expect(logOutput).toBe(`Error occurred while parsing request parameters.
Contents:

{
`);
  });
});
