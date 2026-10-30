import type { InvocationChain } from "./invocation-chain.js";
import type { TaskArguments } from "./task-arguments.js";
import { Task } from "./task.js";

export class MultiTask extends Task {
  /** @internal */
  override async invokePrerequisites(
    taskArgs: TaskArguments,
    invocationChain: InvocationChain<Task>,
  ): Promise<void> {
    await this.invokePrerequisitesConcurrently(taskArgs, invocationChain);
  }
}
