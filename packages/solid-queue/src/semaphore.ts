import { RecordNotUnique, registerModel, type Relation } from "@blazetrails/activerecord";
import { Time } from "@blazetrails/date";
import { Range } from "@blazetrails/ruby-compat";
import { Record } from "./record.js";
import type { Job } from "./job.js";

export class Semaphore extends Record {
  declare static available: () => Relation<Semaphore>;
  declare static expired: () => Relation<Semaphore>;
  declare key: string;
  declare value: number;
  declare expires_at: Time;

  static {
    registerModel("SolidQueue::Semaphore", this);

    this.scope("available", function () {
      return this.where("value > 0");
    });
    this.scope("expired", function () {
      return this.where({ expires_at: new Range(null, Time.current(), true) });
    });
  }

  static async wait(job: Job): Promise<boolean> {
    return await new Proxy(job).wait();
  }

  static async signal(job: Job): Promise<boolean> {
    return await new Proxy(job).signal();
  }

  static async signalAll(jobs: Job[]): Promise<number> {
    return await Proxy.signalAll(jobs);
  }

  static async createUniqueBy(attributes: { [key: string]: unknown }): Promise<unknown> {
    try {
      if (await (await this.connection)!.supportsInsertConflictTarget()) {
        return !(await this.insert({ ...attributes }, { uniqueBy: "key" })).isEmpty();
      } else {
        return await this.createBang({ ...attributes });
      }
    } catch (e) {
      if (e instanceof RecordNotUnique) return false;
      throw e;
    }
  }
}

export class Proxy {
  static async signalAll(jobs: Job[]): Promise<number> {
    return await Semaphore.where({ key: jobs.map((job) => job.concurrency_key) }).updateAll(
      "value = value + 1",
    );
  }

  /** @internal */
  private job: Job;

  constructor(job: Job) {
    this.job = job;
  }

  async wait(): Promise<boolean> {
    const semaphore = await Semaphore.findBy({ key: this.key() });
    if (semaphore) {
      return semaphore.value > 0 && (await this.attemptDecrement());
    } else {
      return await this.attemptCreation();
    }
  }

  async signal(): Promise<boolean> {
    return await this.attemptIncrement();
  }

  /** @internal */
  private async attemptCreation(): Promise<boolean> {
    if (
      await Semaphore.createUniqueBy({
        key: this.key(),
        value: this.limit() - 1,
        expires_at: this.expiresAt(),
      })
    ) {
      return true;
    } else {
      return await this.checkLimitOrDecrement();
    }
  }

  /** @internal */
  private async checkLimitOrDecrement(): Promise<boolean> {
    return this.limit() === 1 ? false : await this.attemptDecrement();
  }

  /** @internal */
  private async attemptDecrement(): Promise<boolean> {
    return (
      (await Semaphore.available()
        .where({ key: this.key() })
        .updateAll(["value = value - 1, expires_at = ?", this.expiresAt()])) > 0
    );
  }

  /** @internal */
  private async attemptIncrement(): Promise<boolean> {
    return (
      (await Semaphore.where({
        key: this.key(),
        value: new Range(null, this.limit(), true),
      }).updateAll(["value = value + 1, expires_at = ?", this.expiresAt()])) > 0
    );
  }

  /** @internal */
  private key(): string | null {
    return this.job.concurrency_key;
  }

  /** @internal */
  private expiresAt(): unknown {
    return this.job.concurrencyDuration().fromNow();
  }

  /** @internal */
  private limit(): number {
    return this.job.concurrencyLimit() ?? 1;
  }
}
