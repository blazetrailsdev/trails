import { Duration } from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";
import { rbHash, rbModConstSet, toI } from "@blazetrails/ruby-compat";
import { SolidQueue } from "./solid-queue.js";

export class Queue {
  name: string;
  declare private _size: number | undefined;
  declare private _latency: number | undefined;

  static async all(): Promise<Queue[]> {
    return (await SolidQueue.Job.select("queue_name").distinct().toArray()).map(
      (job) => new this(job.queue_name),
    );
  }

  static findByName(name: string): Queue {
    return new this(name);
  }

  constructor(name: string) {
    this.name = name;
  }

  async isPaused(): Promise<boolean> {
    return await SolidQueue.Pause.isExists({ queue_name: this.name });
  }

  async pause(): Promise<unknown> {
    return await SolidQueue.Pause.createOrFindByBang({ queue_name: this.name });
  }

  async resume(): Promise<number> {
    return await SolidQueue.Pause.where({ queue_name: this.name }).deleteAll();
  }

  async clear(): Promise<void> {
    await (
      SolidQueue.ReadyExecution.queuedAs(this.name) as unknown as typeof SolidQueue.ReadyExecution
    ).discardAllInBatches();
  }

  async size(): Promise<number> {
    return (this._size ??= await SolidQueue.ReadyExecution.queuedAs(this.name).count());
  }

  async latency(): Promise<number> {
    if (this._latency === undefined) {
      const now = Time.current();
      const oldestEnqueuedAt =
        ((await SolidQueue.ReadyExecution.queuedAs(this.name).minimum(
          "created_at",
        )) as Time | null) ?? now;

      this._latency = toI(now.minus(oldestEnqueuedAt as never)) as number;
    }
    return this._latency;
  }

  async humanLatency(): Promise<string> {
    return Duration.build(await this.latency()).inspect();
  }

  equals(queue: Queue): boolean {
    return this.name === queue.name;
  }

  eql(queue: Queue): boolean {
    return this.equals(queue);
  }

  hash(): number {
    return rbHash(this.name);
  }
}
rbModConstSet(SolidQueue, "Queue", Queue);
