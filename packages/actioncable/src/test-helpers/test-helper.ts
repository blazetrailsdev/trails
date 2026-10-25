import { Logger, MethodCallAssertions, include, type Included } from "@blazetrails/activesupport";
import { TestCase as ActiveSupportTestCase } from "@blazetrails/activesupport/test-case";
import { RuntimeError, globalIoExecutor } from "@blazetrails/ruby-compat";
import { ActionCable } from "../namespaces.js";
import "../index.js";

interface Executor {
  completedTaskCount: number;
  scheduledTaskCount: number;
}

const server = ActionCable.server() as { config: { cable: unknown; logger: unknown } };
server.config.cable = { adapter: "test" };
server.config.logger = new Logger(null);

export class TestCase extends ActiveSupportTestCase {
  declare assertCalled: Included<typeof MethodCallAssertions>["assertCalled"];
  declare assertNotCalled: Included<typeof MethodCallAssertions>["assertNotCalled"];
  declare assertCalledWith: Included<typeof MethodCallAssertions>["assertCalledWith"];

  static {
    include(this, MethodCallAssertions);
  }

  async waitForAsync(): Promise<void> {
    await this.waitForExecutor(globalIoExecutor());
  }

  async runInEventmachine(block: () => unknown): Promise<void> {
    await block();
    await this.waitForAsync();
  }

  async waitForExecutor(executor: Executor): Promise<void> {
    let timeout = 2;
    while (executor.completedTaskCount !== executor.scheduledTaskCount) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      timeout -= 0.1;
      if (!(timeout > 0))
        throw new RuntimeError("Executor could not complete all tasks in 2 seconds");
    }
  }
}
