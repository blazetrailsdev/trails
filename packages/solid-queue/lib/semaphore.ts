import { SolidQueue } from "./solid-queue.js";
import { RecordNotUnique, type Relation } from "@blazetrails/activerecord";
import { Time } from "@blazetrails/date";
import { constSet, Range } from "@blazetrails/ruby-compat";
import { Record } from "./record.js";
import type { Job } from "./job.js";

export class Semaphore extends Record {
  declare static available: () => Relation<Semaphore>;
  declare static expired: () => Relation<Semaphore>;
  declare key: string;
  declare value: number;
  declare expires_at: Time;

  static {
    constSet(SolidQueue, "Semaphore", this);

    this.scope("available", function () {
      return this.where("value > 0");
    });
    this.scope("expired", function () {
      return this.where({ expires_at: new Range(null, Time.current(), true) });
    });
  }

  static async wait(job: Job): Promise<number | null> {
    return await new Proxy(job).wait();
  }

  static async signal(job: Job): Promise<boolean> {
    return await new Proxy(job).signal();
  }

  static async createUniqueBy(attributes: { [key: string]: unknown }): Promise<unknown> {
    try {
      if (await this.isSupportsInsertConflictTarget()) {
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
  /** @internal */
  private job: Job;

  constructor(job: Job) {
    this.job = job;
  }

  async wait(): Promise<number | null> {
    const semaphore = await Semaphore.lock().findBy({ key: this.key() });
    if (semaphore) {
      return semaphore.value > 0 && (await this.attemptDecrement())
        ? (semaphore.id as number)
        : null;
    } else {
      return await this.attemptCreation();
    }
  }

  async signal(): Promise<boolean> {
    return await this.attemptIncrement();
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
  private async attemptCreation(): Promise<number | null> {
    if (
      await Semaphore.createUniqueBy({
        key: this.key(),
        value: this.limit() - 1,
        expires_at: this.expiresAt(),
      })
    ) {
      return await this.acquiredSemaphoreId();
    } else {
      return await this.checkLimitOrDecrement();
    }
  }

  /** @internal */
  private async acquiredSemaphoreId(): Promise<number | null> {
    return (await Semaphore.lock().where({ key: this.key() }).pick("id")) as number | null;
  }

  /** @internal */
  private async checkLimitOrDecrement(): Promise<number | null> {
    return this.limit() > 1 && (await this.attemptDecrement())
      ? await this.acquiredSemaphoreId()
      : null;
  }

  /** @internal */
  private async attemptIncrement(): Promise<boolean> {
    return (
      (await this.semaphoreToRelease()
        .where({ value: new Range(null, this.limitToRelease(), true) })
        .updateAll(["value = value + 1, expires_at = ?", this.expiresAt()])) > 0
    );
  }

  /** @internal */
  private semaphoreToRelease(): Relation<Semaphore> {
    if (this.job.acquiredSemaphoreId() != null) {
      return Semaphore.where({ id: this.job.acquiredSemaphoreId() });
    } else {
      return Semaphore.where({ key: this.key() });
    }
  }

  /** @internal */
  private limitToRelease(): number {
    return this.job.acquiredConcurrencyLimit() ?? this.limit();
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
    return this.job.concurrencyLimit()!;
  }
}
