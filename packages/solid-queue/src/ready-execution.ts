import { registerModel, type Relation } from "@blazetrails/activerecord";
import { indexBy } from "@blazetrails/activesupport";
import { Execution } from "./execution.js";
import { QueueSelector } from "./queue-selector.js";
import { ClaimedExecution } from "./claimed-execution.js";
import { Job } from "./job.js";

export class ReadyExecution extends Execution {
  declare static queuedAs: (queueName: unknown) => Relation<ReadyExecution>;

  static {
    registerModel(this);

    this.scope("queuedAs", function (queueName: unknown) {
      return this.where({ queue_name: queueName });
    });

    this.assumesAttributesFromJob();
  }

  static async claim(
    queueList: unknown,
    limit: number,
    processId: unknown,
  ): Promise<ClaimedExecution[]> {
    const claimed: ClaimedExecution[] = [];
    for (const queueRelation of await new QueueSelector(queueList, this).scopedRelations()) {
      const locked = await this.selectAndLock(queueRelation, processId, limit);
      limit -= locked.length;
      claimed.push(...locked);
    }
    return claimed;
  }

  static async aggregatedCountAcross(queueList: unknown): Promise<number> {
    let sum = 0;
    for (const queueRelation of await new QueueSelector(queueList, this).scopedRelations()) {
      sum += await queueRelation.count();
    }
    return sum;
  }

  /** @internal */
  private static async selectAndLock(
    queueRelation: Relation<ReadyExecution>,
    processId: unknown,
    limit: number,
  ): Promise<ClaimedExecution[]> {
    if (limit <= 0) return [];

    return (await this.transaction(async () => {
      const candidates = this.selectCandidates(queueRelation, limit);
      return await this.lockCandidates(candidates, processId);
    }))!;
  }

  /** @internal */
  private static selectCandidates(
    queueRelation: Relation<ReadyExecution>,
    limit: number,
  ): Relation<ReadyExecution> {
    return (
      (queueRelation as unknown as typeof ReadyExecution)
        .ordered()
        .limit(limit) as unknown as typeof ReadyExecution
    )
      .nonBlockingLock()
      .select("id", "job_id");
  }

  /** @internal */
  private static async lockCandidates(
    executions: Relation<ReadyExecution>,
    processId: unknown,
  ): Promise<ClaimedExecution[]> {
    if (await executions.isNone()) return [];

    const records = await executions.toArray();
    return await ClaimedExecution.claiming(
      records.map((execution) => execution.job_id),
      processId,
      async (claimed) => {
        const byJobId = indexBy(records, (execution) => execution.job_id);
        const idsToDelete = claimed.map((execution) => byJobId[execution.job_id].id);
        await this.where({ id: idsToDelete }).deleteAll();
      },
    );
  }

  /** @internal */
  protected static override async discardJobs(jobIds: unknown[]): Promise<number> {
    await Job.releaseAllConcurrencyLocks(await Job.where({ id: jobIds }).toArray());
    return await super.discardJobs(jobIds);
  }
}
