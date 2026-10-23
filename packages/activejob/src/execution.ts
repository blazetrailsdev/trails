import { Concern, ExecutionContext, extend, Rescuable } from "@blazetrails/activesupport";
import { classModule, include, NotImplementedError, rbModConstSet } from "@blazetrails/ruby-compat";
import { ActiveJob } from "./namespaces.js";

type JobData = Record<string, unknown>;

interface ExecutionJob {
  executions: number | null;
  arguments: unknown[];
  deserializeArgumentsIfNeeded(): Promise<void>;
  rescueWithHandler(exception: unknown): unknown;
  runAfterDiscardProcs(exception: unknown): Promise<void>;
  runCallbacks(kind: string, block?: () => unknown): unknown;
  perform(...arguments_: unknown[]): unknown;
  performNow(): Promise<unknown>;
  _performJob(): Promise<unknown>;
}

interface ExecutionClass {
  jobOrInstantiate(...args: unknown[]): unknown;
  deserialize(jobData: JobData): unknown;
}

export class ClassMethods {
  static async performNow(this: ExecutionClass, ...args: unknown[]): Promise<unknown> {
    return (this.jobOrInstantiate(...args) as ExecutionJob).performNow();
  }

  /** @internal */
  static async execute(this: ExecutionClass, jobData: JobData): Promise<unknown> {
    return ActiveJob.Callbacks.runCallbacks("execute", async () => {
      const job = this.deserialize(jobData) as ExecutionJob;
      return job.performNow();
    });
  }
}

export class Execution {
  static readonly [classModule] = true;
  declare static ClassMethods: typeof ClassMethods;

  async performNow(this: ExecutionJob): Promise<unknown> {
    try {
      this.executions = (this.executions ?? 0) + 1;

      await this.deserializeArgumentsIfNeeded();

      return await this._performJob();
    } catch (exception) {
      const handled = await this.rescueWithHandler(exception);
      if (handled != null && handled !== false) return handled;

      await this.runAfterDiscardProcs(exception);
      throw exception;
    }
  }

  perform(..._arguments: unknown[]): unknown {
    throw new NotImplementedError();
  }

  /** @internal */
  async _performJob(this: ExecutionJob): Promise<unknown> {
    ExecutionContext.setKey("job", this);
    return this.runCallbacks("perform", () => this.perform(...this.arguments));
  }
}
extend(Execution, Concern);
include(Execution, Rescuable);
Object.defineProperty(Execution, "ClassMethods", { value: ClassMethods });

rbModConstSet(ActiveJob, "Execution", Execution);
