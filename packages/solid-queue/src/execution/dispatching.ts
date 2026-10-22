import { Concern, extend } from "@blazetrails/activesupport";
import { classModule } from "@blazetrails/ruby-compat";
import { SolidQueue } from "../solid-queue.js";
import type { Execution } from "../execution.js";

export class ClassMethods {
  static async dispatchJobs(this: typeof Execution, jobIds: unknown[]): Promise<number> {
    const jobs = await SolidQueue.Job.where({ id: jobIds }).toArray();

    const dispatchedJobIds = (await SolidQueue.Job.dispatchAll(jobs)).map((job) => job.id);
    return await this.where({
      id: await this.where({ job_id: dispatchedJobIds }).pluck("id"),
    }).deleteAll();
  }
}

export class Dispatching {
  static readonly [classModule] = true;
  declare static ClassMethods: typeof ClassMethods;
}
extend(Dispatching, Concern);
Object.defineProperty(Dispatching, "ClassMethods", { value: ClassMethods });
