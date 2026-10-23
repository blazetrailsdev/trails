import { ActiveRecord } from "@blazetrails/activerecord";
import { include } from "@blazetrails/activesupport";
import { NotImplementedError, type Thread } from "@blazetrails/ruby-compat";
import { SolidQueue } from "../solid-queue.js";
import { Base } from "./base.js";
import { Runnable } from "./runnable.js";

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface below. */
export class Poller extends Base {
  static override toString(): string {
    return "SolidQueue::Processes::Poller";
  }

  static {
    include(this, Runnable);
  }

  pollingInterval: unknown;
  declare _thread?: Thread;

  constructor({ pollingInterval, ...options }: { pollingInterval: unknown } & object) {
    super(options);
    this.pollingInterval = pollingInterval;
  }

  override metadata(): Record<string, unknown> {
    return { ...super.metadata(), polling_interval: this.pollingInterval };
  }

  /** @inlinedFrom SolidQueue::Processes::Runnable#stop solid_queue/v1.1.3/lib/solid_queue/processes/runnable.rb:19-24 */
  override async stop(): Promise<void> {
    await super.stop();

    await this.wakeUp();
    await this._thread?.join();
  }

  /** @internal */
  async run(): Promise<void> {
    await this.startLoop();
  }

  /** @internal */
  async startLoop(): Promise<void> {
    try {
      while (true) {
        if (await this.isShuttingDown()) break;

        const delay = await this.wrapInAppExecutor(() => this.poll());

        await this.interruptibleSleep(delay);
      }
    } finally {
      await SolidQueue.instrument("shutdown_process", { process: this }, async () => {
        await this.runCallbacks("shutdown", () => this.shutdown());
      });
    }
  }

  /** @internal */
  async poll(): Promise<unknown> {
    throw new NotImplementedError();
  }

  /** @internal */
  async withPollingVolume<T>(block: () => Promise<T>): Promise<T> {
    return await SolidQueue.instrument("polling", {}, async () => {
      if (SolidQueue.isSilencePolling() && ActiveRecord.Base.logger) {
        return (await ActiveRecord.Base.logger.silence!(undefined, block)) as T;
      } else {
        return await block();
      }
    });
  }
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Runnable` (`processes/poller.rb:5`). */
export interface Poller {
  mode: unknown;
  start(): Promise<void>;
  isShuttingDown(): Promise<boolean>;
  shutdown(): Promise<void>;
  setProcline(): void;
  isAllWorkCompleted(): Promise<boolean>;
}
