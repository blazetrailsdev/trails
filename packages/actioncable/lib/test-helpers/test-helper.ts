import { Logger, MethodCallAssertions, include, type Included } from "@blazetrails/activesupport";
import { RuntimeError, globalIoExecutor } from "@blazetrails/ruby-compat";
import { ActionCable } from "../namespaces.js";
import "../index.js";
import { TestCase } from "../test-case.js";

interface Executor {
  completedTaskCount: number;
  scheduledTaskCount: number;
}

const server = ActionCable.server() as {
  config: { cable: unknown; logger: unknown; loadPubsubAdapter(): Promise<void> };
};
server.config.cable = { adapter: "test" };
server.config.logger = new Logger(null);
await server.config.loadPubsubAdapter();

declare module "../test-case.js" {
  interface TestCase {
    assertCalled: Included<typeof MethodCallAssertions>["assertCalled"];
    assertNotCalled: Included<typeof MethodCallAssertions>["assertNotCalled"];
    assertCalledWith: Included<typeof MethodCallAssertions>["assertCalledWith"];
    waitForAsync: typeof waitForAsync;
    runInEventmachine: typeof runInEventmachine;
    waitForExecutor: typeof waitForExecutor;
  }
}

include(TestCase, MethodCallAssertions);

async function waitForAsync(this: TestCase): Promise<void> {
  await this.waitForExecutor(globalIoExecutor());
}

async function runInEventmachine(this: TestCase, block: () => unknown): Promise<void> {
  await block();
  await this.waitForAsync();
}

async function waitForExecutor(executor: Executor): Promise<void> {
  let timeout = 2;
  while (executor.completedTaskCount !== executor.scheduledTaskCount) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    timeout -= 0.1;
    if (!(timeout > 0))
      throw new RuntimeError("Executor could not complete all tasks in 2 seconds");
  }
}

Object.assign(TestCase.prototype, { waitForAsync, runInEventmachine, waitForExecutor });

export { TestCase };
