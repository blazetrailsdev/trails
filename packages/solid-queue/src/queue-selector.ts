import type { Relation } from "@blazetrails/activerecord";
import { presence } from "@blazetrails/activesupport";
import { aryDelete, rbFArray, registerConstant, toS } from "@blazetrails/ruby-compat";
import type { ReadyExecution } from "./ready-execution.js";
import { Pause } from "./pause.js";

export class QueueSelector {
  readonly rawQueues: string[];
  readonly relation: typeof ReadyExecution;
  declare private _queueNames: string[] | undefined;
  declare private _prefixes: string[] | undefined;
  declare private _pausedQueues: string[] | undefined;

  constructor(queueList: unknown, relation: typeof ReadyExecution) {
    this.rawQueues = presence(rbFArray(queueList).map((queue) => toS(queue).trim())) ?? ["*"];
    this.relation = relation;
  }

  async scopedRelations(): Promise<Relation<ReadyExecution>[]> {
    if (await this.isAll()) return [this.relation.all()];
    else if (await this.isNone()) return [this.relation.none()];
    else {
      return (await this.queueNames()).map((queueName) => this.relation.queuedAs(queueName));
    }
  }

  /** @internal */
  private async isAll(): Promise<boolean> {
    return this.isIncludeAllQueues() && (await this.pausedQueues()).length === 0;
  }

  /** @internal */
  private async isNone(): Promise<boolean> {
    return (await this.queueNames()).length === 0;
  }

  /** @internal */
  private async queueNames(): Promise<string[]> {
    if (this._queueNames === undefined) {
      const pausedQueues = await this.pausedQueues();
      this._queueNames = (await this.eligibleQueues()).filter(
        (queue) => !pausedQueues.includes(queue),
      );
    }
    return this._queueNames;
  }

  /** @internal */
  private async eligibleQueues(): Promise<string[]> {
    if (this.isIncludeAllQueues()) return await this.allQueues();
    else {
      return this.inRawOrder([...this.exactNames(), ...(await this.prefixedNames())]);
    }
  }

  /** @internal */
  private isIncludeAllQueues(): boolean {
    return this.rawQueues.includes("*");
  }

  /** @internal */
  private async allQueues(): Promise<string[]> {
    return (await this.relation.distinct().pluck("queue_name")) as string[];
  }

  /** @internal */
  private exactNames(): string[] {
    return this.rawQueues.filter((queue) => this.isExactName(queue));
  }

  /** @internal */
  private async prefixedNames(): Promise<string[]> {
    if (this.prefixes().length === 0) return [];
    else {
      return (await this.relation
        .where(
          Array(this.prefixes().length).fill("queue_name LIKE ?").join(" OR "),
          ...this.prefixes(),
        )
        .distinct()
        .pluck("queue_name")) as string[];
    }
  }

  /** @internal */
  private prefixes(): string[] {
    return (this._prefixes ??= this.rawQueues
      .filter((queue) => this.isPrefixedName(queue))
      .map((queue) => queue.replaceAll("*", "%")));
  }

  /** @internal */
  private isExactName(queue: string): boolean {
    return !queue.includes("*");
  }

  /** @internal */
  private isPrefixedName(queue: string): boolean {
    return queue.endsWith("*");
  }

  /** @internal */
  private async pausedQueues(): Promise<string[]> {
    return (this._pausedQueues ??= (await Pause.all().pluck("queue_name")) as string[]);
  }

  /** @internal */
  private inRawOrder(queues: string[]): string[] {
    if (queues.length === 1 || this.prefixes().length === 0) {
      return queues;
    } else {
      queues = [...queues];
      return this.rawQueues
        .flatMap((rawQueue) => this.deleteInOrder(rawQueue, queues) ?? [])
        .filter((queue) => queue != null);
    }
  }

  /** @internal */
  private deleteInOrder(rawQueue: string, queues: string[]): string | string[] | null {
    if (this.isExactName(rawQueue)) {
      return aryDelete(queues, rawQueue) ?? null;
    } else if (this.isPrefixedName(rawQueue)) {
      const prefix = rawQueue.replaceAll("*", "");
      const matches = queues.filter((queue) => queue.startsWith(prefix));
      return matches;
    }
    return null;
  }
}
registerConstant("SolidQueue::QueueSelector", QueueSelector);
