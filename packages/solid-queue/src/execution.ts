import { registerModel, type Base, type Relation } from "@blazetrails/activerecord";
import { include } from "@blazetrails/activesupport";
import { StandardError, registerConstant } from "@blazetrails/ruby-compat";
import { Record } from "./record.js";
import { SolidQueue } from "./solid-queue.js";
import {
  JobAttributes,
  type ClassMethods as JobAttributesClassMethods,
} from "./execution/job-attributes.js";
import { Job } from "./job.js";

export class UndiscardableError extends StandardError {}

export class Execution extends Record {
  declare static assumableAttributesFromJob: string[];
  declare static assumesAttributesFromJob: typeof JobAttributesClassMethods.assumesAttributesFromJob;
  declare static attributesFromJob: typeof JobAttributesClassMethods.attributesFromJob;
  declare static ordered: <T extends typeof Execution>(this: T) => Relation<InstanceType<T>>;
  declare job: Promise<Job>;
  declare job_id: number;
  declare queue_name: string;
  declare priority: number;

  static {
    include(this, JobAttributes);

    this.abstractClass = true;

    this.scope("ordered", function () {
      return this.order({ priority: "asc", job_id: "asc" });
    });

    this.belongsTo("job");
  }

  static type(): string {
    return this.modelName.element.replace("_execution", "");
  }

  static async createAllFromJobs(jobs: Iterable<Base>): Promise<unknown> {
    return await this.insertAll(this.executionDataFromJobs(jobs));
  }

  static executionDataFromJobs(jobs: Iterable<Base>): { [key: string]: unknown }[] {
    return Array.from(jobs, (job) => ({ ...this.attributesFromJob(job), job_id: job.id }));
  }

  static async discardAllInBatches({
    batchSize = 500,
  }: { batchSize?: number } = {}): Promise<void> {
    let pending = await this.count();
    let discarded = 0;

    await SolidQueue.instrument(
      "discard_all",
      { batch_size: batchSize, status: this.type(), batches: 0, size: 0 },
      async (payload) => {
        while (true) {
          await this.transaction(async () => {
            const jobIds = await this.limit(batchSize).order("job_id").lock().pluck("job_id");
            discarded = await this.discardJobs(jobIds);

            await this.where({ job_id: jobIds }).deleteAll();
            pending -= discarded;

            payload["size"] = (payload["size"] as number) + discarded;
            payload["batches"] = (payload["batches"] as number) + 1;
          });

          if (pending <= 0 || discarded === 0) break;
        }
      },
    );
  }

  static async discardAllFromJobs(jobs: Relation<Job>): Promise<void> {
    await SolidQueue.instrument(
      "discard_all",
      { jobs_size: await jobs.size(), status: this.type() },
      async (payload) => {
        await this.transaction(async () => {
          const jobIds = await this.lockAllFromJobs(jobs);

          payload["size"] = await this.discardJobs(jobIds);
          await this.where({ job_id: jobIds }).deleteAll();
        });
      },
    );
  }

  /** @internal */
  protected static async lockAllFromJobs(jobs: Relation<Job>): Promise<unknown[]> {
    return await this.where({ job_id: (await jobs.toArray()).map((job) => job.id) })
      .order("job_id")
      .lock()
      .pluck("job_id");
  }

  /** @internal */
  protected static async discardJobs(jobIds: unknown[]): Promise<number> {
    return await Job.where({ id: jobIds }).deleteAll();
  }

  type(): string {
    return (this.constructor as typeof Execution).type();
  }

  async discard(): Promise<void> {
    await SolidQueue.instrument(
      "discard",
      { job_id: this.job_id, status: this.type() },
      async () => {
        await this.withLock(async () => {
          await (await this.job).destroy();
          await this.destroy();
        });
      },
    );
  }
}

registerModel("SolidQueue::Execution", Execution);
registerConstant("SolidQueue::Execution::UndiscardableError", UndiscardableError);

declare module "@blazetrails/activerecord" {
  // eslint-disable-next-line unused-imports/no-unused-vars -- the augmented interface must repeat RelationScopes<T>
  interface RelationScopes<T extends import("@blazetrails/activerecord").Base> {
    ordered<R extends Execution>(this: Relation<R>): Relation<R>;
  }
}
