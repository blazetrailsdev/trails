import { ActiveRecord } from "@blazetrails/activerecord";
import { include } from "@blazetrails/activesupport";
import { NotImplementedError, type Thread } from "@blazetrails/ruby-compat";
import { SolidQueue } from "../solid-queue.js";
import { Base } from "./base.js";
import { Runnable } from "./runnable.js";

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface below. */
export class Poller extends Base {
  static {
    include(this, Runnable);
  }

  pollingInterval: unknown;
  declare _thread?: Thread;

  constructor({ pollingInterval, ...options }: { pollingInterval: unknown } & object) {
    super(options);
    this.pollingInterval = pollingInterval;
  }

  override async metadata(): Promise<Record<string, unknown>> {
    return { ...(await super.metadata()), polling_interval: this.pollingInterval };
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

  /**
   * @internal
   * @missingRailsArgs silence — PERMANENT
   */
  async withPollingVolume<T>(block: () => Promise<T>): Promise<T> {
    return await SolidQueue.instrument("polling", {}, async () => {
      if (SolidQueue.isSilencePolling() && ActiveRecord.Base.logger) {
        return (await ActiveRecord.Base.logger.silence(undefined, () => block())) as T;
      } else {
        return await block();
      }
    });
  }
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Runnable` (`processes/poller.rb:5`). */
export interface Poller {
  mode: unknown;
  isSupervised(): boolean;
  start(): Promise<void>;
  isShuttingDown(): Promise<boolean>;
  shutdown(): Promise<void>;
  setProcline(): void | Promise<void>;
  isAllWorkCompleted(): Promise<boolean>;
}
