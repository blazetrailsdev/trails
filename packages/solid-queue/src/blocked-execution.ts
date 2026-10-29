import { registerModel, type Relation } from "@blazetrails/activerecord";
import { slice } from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";
import { Range, rbFArray } from "@blazetrails/ruby-compat";
import { Execution } from "./execution.js";
import { SolidQueue } from "./solid-queue.js";
import { Semaphore } from "./semaphore.js";
import { ReadyExecution } from "./ready-execution.js";

export class BlockedExecution extends Execution {
  declare static expired: () => Relation<BlockedExecution>;
  declare concurrency_key: string;
  declare expires_at: Time;
  declare semaphore: Promise<Semaphore | null>;

  static {
    registerModel("SolidQueue::BlockedExecution", this);

    this.assumesAttributesFromJob("concurrency_key");
    this.beforeCreate(function (this: BlockedExecution) {
      return this.setExpiresAt();
    });

    this.hasOne("semaphore", { foreignKey: "key", primaryKey: "concurrency_key" });

    this.scope("expired", function () {
      return this.where({ expires_at: new Range(null, Time.current(), true) });
    });
  }

  static async unblock(limit: number): Promise<unknown> {
    return await SolidQueue.instrument("release_many_blocked", { limit }, async (payload) => {
      const concurrencyKeys = (await this.expired()
        .distinct()
        .limit(limit)
        .pluck("concurrency_key")) as string[];
      return (payload["size"] = await this.releaseMany(await this.releasable(concurrencyKeys)));
    });
  }

  static async releaseMany(concurrencyKeys: unknown): Promise<number> {
    let count = 0;
    for (const concurrencyKey of rbFArray(concurrencyKeys)) {
      if (await this.releaseOne(concurrencyKey)) count += 1;
    }
    return count;
  }

  static async releaseOne(concurrencyKey: unknown): Promise<unknown> {
    return await this.transaction(async () => {
      const execution = await this.ordered()
        .where({ concurrency_key: concurrencyKey })
        .limit(1)
        .nonBlockingLock()
        .first();
      if (execution) {
        return await execution.release();
      }
      return null;
    });
  }

  /** @internal */
  private static async releasable(concurrencyKeys: string[]): Promise<string[]> {
    const semaphores = Object.fromEntries(
      (await Semaphore.where({ key: concurrencyKeys }).pluck("key", "value")) as [string, number][],
    );

    const keys = [
      ...concurrencyKeys.filter((key) => !Object.hasOwn(semaphores, key)),
      ...Object.keys(semaphores).filter((key) => semaphores[key] > 0),
    ];
    return [...new Set(keys)];
  }

  async release(): Promise<unknown> {
    const job = await this.job;
    return await SolidQueue.instrument(
      "release_blocked",
      { job_id: job.id, concurrency_key: this.concurrency_key, released: false },
      async (payload) => {
        return await this.transaction(async () => {
          if (await this.acquireConcurrencyLock()) {
            await this.promoteToReady();
            await this.destroyBang();

            return (payload["released"] = true);
          }
          return null;
        });
      },
    );
  }

  /** @internal */
  private async setExpiresAt(): Promise<void> {
    this.expires_at = (await this.job).concurrencyDuration().fromNow() as Time;
  }

  /** @internal */
  private async acquireConcurrencyLock(): Promise<boolean> {
    return await Semaphore.wait(await this.job);
  }

  /** @internal */
  private async promoteToReady(): Promise<unknown> {
    return await ReadyExecution.createBang(this.readyAttributes());
  }

  /** @internal */
  private readyAttributes(): { [key: string]: unknown } {
    return slice(this.attributes, "job_id", "queue_name", "priority");
  }
}
