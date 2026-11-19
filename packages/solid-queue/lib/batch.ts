import {
  ActiveRecord,
  Rollback,
  afterAllTransactionsCommit,
  type Relation,
} from "@blazetrails/activerecord";
import {
  IsolatedExecutionState,
  include,
  presence,
  withIndifferentAccess,
  type HashWithIndifferentAccess,
} from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";
import { SecureRandom, StandardError, constSet } from "@blazetrails/ruby-compat";
import { Record } from "./record.js";
import type { BatchExecution } from "./batch-execution.js";
import type { Job } from "./job.js";
import { SolidQueue } from "./solid-queue.js";
import { Callbacks } from "./batch/callbacks.js";
import { Status } from "./batch/status.js";
import { Clearable, type ClassMethods as ClearableClassMethods } from "./batch/clearable.js";
import { Sweepable, type ClassMethods as SweepableClassMethods } from "./batch/sweepable.js";

export class AlreadyFinished extends StandardError {}

export class PendingMigrations extends StandardError {
  constructor(
    message = "The batches schema hasn't been installed yet. Run `bin/rails solid_queue:update` to copy the pending migrations to your application, and then `bin/rails db:migrate` to run them",
  ) {
    super(message);
  }
}

interface EnqueueOptions {
  description?: string | null;
  onSuccess?: unknown;
  onFailure?: unknown;
  onFinish?: unknown;
  metadata?: { [key: string]: unknown } | null;
  [extraMetadata: string]: unknown;
}

export class Batch extends Record {
  static AlreadyFinished = AlreadyFinished;
  static PendingMigrations = PendingMigrations;
  declare id: number;
  declare active_job_batch_id: string | null;
  declare description: string | null;
  declare total_jobs: number;
  declare completed_jobs: number;
  declare failed_jobs: number;
  declare enqueued_at: Time | null;
  declare finished_at: Time | null;
  declare failed_at: Time | null;
  declare on_finish: { [key: string]: unknown } | null;
  declare on_success: { [key: string]: unknown } | null;
  declare on_failure: { [key: string]: unknown } | null;
  declare jobs: Relation<Job>;
  declare batchExecutions: Relation<BatchExecution>;
  declare status: typeof Status.prototype.status;
  declare isFailed: typeof Status.prototype.isFailed;
  declare isSucceeded: typeof Status.prototype.isSucceeded;
  declare isFinished: typeof Status.prototype.isFinished;
  declare isEnqueued: typeof Status.prototype.isEnqueued;
  declare completedJobs: typeof Status.prototype.completedJobs;
  declare failedJobs: typeof Status.prototype.failedJobs;
  declare pendingJobs: typeof Status.prototype.pendingJobs;
  declare progressPercentage: typeof Status.prototype.progressPercentage;
  declare serializeCallback: typeof Callbacks.prototype.serializeCallback;
  declare enqueueCallbackJobs: typeof Callbacks.prototype.enqueueCallbackJobs;
  declare setOnFinish: typeof Callbacks.prototype.setOnFinish;
  declare setOnSuccess: typeof Callbacks.prototype.setOnSuccess;
  declare setOnFailure: typeof Callbacks.prototype.setOnFailure;
  declare static finished: () => Relation<Batch>;
  declare static succeeded: () => Relation<Batch>;
  declare static unfinished: () => Relation<Batch>;
  declare static failed: () => Relation<Batch>;
  declare static enqueued: () => Relation<Batch>;
  declare static withoutExecutions: () => Relation<Batch>;
  declare static clearable: (options?: { finishedBefore?: unknown }) => Relation<Batch>;
  declare static clearFinishedInBatches: typeof ClearableClassMethods.clearFinishedInBatches;
  declare static sweepStalled: typeof SweepableClassMethods.sweepStalled;
  /** @internal */
  static _migrated: boolean | null = null;

  static {
    constSet(SolidQueue, "Batch", this);

    include(this, Callbacks);
    include(this, Status);
    include(this, Clearable);
    include(this, Sweepable);

    this.hasMany("jobs");
    this.hasMany("batchExecutions", { dependent: "destroy" });

    this.store("metadata", { coder: JSON });

    this.scope("withoutExecutions", function () {
      return this.where().not({ id: SolidQueue.BatchExecution!.select("batch_id") });
    });

    this.beforeCreate(":setActiveJobBatchId");
    this.afterCommit(":start", {
      on: "create",
      unless: () => "afterAllTransactionsCommit" in ActiveRecord,
    });
  }

  /** @inventedArm ensureSchemaLoaded — CONVERGEABLE activerecord-converge-schema-load-and-primary-key-convergeable-receipts */
  static async isMigrated(): Promise<boolean> {
    await this.ensureSchemaLoaded();
    await SolidQueue.Job!.ensureSchemaLoaded();
    return (this._migrated ||=
      (await this.tableExists()) &&
      (await SolidQueue.BatchExecution!.tableExists()) &&
      SolidQueue.Job!.columnNames().includes("batch_id"));
  }

  static async enqueue(
    {
      description = null,
      onSuccess = null,
      onFailure = null,
      onFinish = null,
      metadata = null,
      ...extraMetadata
    }: EnqueueOptions = {},
    block?: (batch: Batch) => unknown,
  ): Promise<Batch> {
    if (!(await this.isMigrated())) throw new PendingMigrations();

    const batch = new this();
    batch.assignAttributes({
      description,
      on_success: onSuccess,
      on_failure: onFailure,
      on_finish: onFinish,
      metadata: { ...(metadata ?? {}), ...extraMetadata },
    });
    await batch.enqueue(block);
    return batch;
  }

  static currentBatchId(): number | null {
    return IsolatedExecutionState.get<number | null>("current_batch_id") ?? null;
  }

  /** @inventedArm fork — PERMANENT */
  static async wrapInBatchContext<T>(batchId: number, block: () => T | Promise<T>): Promise<T> {
    return await IsolatedExecutionState.fork("current_batch_id", async () => {
      const previousBatchId = presence(this.currentBatchId());
      try {
        IsolatedExecutionState.set("current_batch_id", batchId);
        return await block();
      } finally {
        IsolatedExecutionState.set("current_batch_id", previousBatchId);
      }
    });
  }

  async enqueue(block?: (batch: Batch) => unknown): Promise<void> {
    if (this.isFinished()) {
      throw new AlreadyFinished("Can't enqueue an already finished batch");
    }

    await this.transaction(async () => {
      if (this.isNewRecord()) await this.saveBang();

      await (this.constructor as typeof Batch).wrapInBatchContext(this.id, async () => {
        await block?.(this);
      });

      if ("afterAllTransactionsCommit" in ActiveRecord) {
        await afterAllTransactionsCommit(() => this.start());
      }
    });
  }

  get metadata(): HashWithIndifferentAccess {
    return withIndifferentAccess(
      (this.readAttribute("metadata") as { [key: string]: unknown } | null) ?? {},
    );
  }

  set metadata(value: unknown) {
    this.writeAttribute("metadata", value);
  }

  async start(): Promise<void> {
    await this.markAsEnqueued();

    await this.reload();
    await this.finish();
  }

  async finish(): Promise<void> {
    if (this.isFinished() || !this.isEnqueued()) return;
    if (await this.batchExecutions.isExists()) return;

    await this.transaction(async () => {
      const updated = await Batch.where({ id: this.id })
        .unfinished()
        .enqueued()
        .withoutExecutions()
        .updateAll({ finished_at: Time.current() });
      if (updated > 0) await this.finalize();
    });
  }

  /** @internal */
  private setActiveJobBatchId(): void {
    this.active_job_batch_id ||= SecureRandom.uuid();
  }

  /** @internal */
  private async markAsEnqueued(): Promise<void> {
    await Batch.where({ id: this.id, enqueued_at: null }).updateAll({
      enqueued_at: Time.current(),
    });
  }

  /** @internal */
  private async finalize(): Promise<void> {
    await this.reload();

    if (await this.batchExecutions.isExists()) throw new Rollback();

    await SolidQueue.instrument("finish_batch", { batch_id: this.id }, async (payload) => {
      const failedJobs = await this.jobs.failed().count();
      const failedAt = failedJobs > 0 ? Time.current() : null;
      const completedJobs = this.total_jobs - failedJobs;

      await this.updateColumns({
        failed_jobs: failedJobs,
        failed_at: failedAt,
        completed_jobs: completedJobs,
      });
      await this.enqueueCallbackJobs();

      Object.assign(payload, {
        total_jobs: this.total_jobs,
        failed_jobs: failedJobs,
        completed_jobs: completedJobs,
      });
    });
  }
}

declare module "@blazetrails/activerecord" {
  // eslint-disable-next-line unused-imports/no-unused-vars
  interface RelationScopes<T extends import("@blazetrails/activerecord").Base> {
    finished<R extends Batch | Job>(this: Relation<R>): Relation<R>;
    failed<R extends Batch | Job>(this: Relation<R>): Relation<R>;
    unfinished<R extends Batch>(this: Relation<R>): Relation<R>;
    enqueued<R extends Batch>(this: Relation<R>): Relation<R>;
    succeeded<R extends Batch>(this: Relation<R>): Relation<R>;
    withoutExecutions<R extends Batch>(this: Relation<R>): Relation<R>;
  }
}
