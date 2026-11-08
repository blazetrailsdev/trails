import { Concern, extend } from "@blazetrails/activesupport";
import { classModule } from "@blazetrails/ruby-compat";
import type { Relation } from "@blazetrails/activerecord";
import type { ClaimedExecution } from "../claimed-execution.js";
import type { Process } from "../process.js";

interface ExecutorHost {
  kind: string;
  claimedExecutions: Relation<ClaimedExecution> & typeof ClaimedExecution;
  isClaimsExecutions(): boolean;
}

export class Executor {
  static readonly [classModule] = true;

  async failAllClaimedExecutionsWith(this: ExecutorHost, error: Error): Promise<unknown> {
    if (this.isClaimsExecutions()) {
      return await this.claimedExecutions.failAllWith(error);
    }
    return null;
  }

  async releaseAllClaimedExecutions(this: ExecutorHost): Promise<unknown> {
    if (this.isClaimsExecutions()) {
      return await this.claimedExecutions.releaseAll();
    }
    return null;
  }

  /** @internal */
  isClaimsExecutions(this: ExecutorHost): boolean {
    return this.kind === "Worker";
  }
}
extend(Executor, Concern);
(
  Executor as unknown as {
    included(base: null, block: (this: typeof Process) => void): void;
  }
).included(null, function (this: typeof Process) {
  this.hasMany("claimedExecutions");

  this.afterDestroy(":releaseAllClaimedExecutions");
});
