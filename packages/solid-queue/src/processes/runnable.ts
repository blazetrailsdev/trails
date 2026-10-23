import { include, inquiry, type StringInquirer } from "@blazetrails/activesupport";
import { NotImplementedError, Thread, classModule } from "@blazetrails/ruby-compat";
import { SolidQueue } from "../solid-queue.js";
import { Supervised } from "./supervised.js";

const DEFAULT_MODE = "async";

type Mode = StringInquirer & Record<string, () => boolean>;

interface RunnableHost {
  _mode?: string | null;
  _thread?: Thread;
  name: string;
  mode: Mode;
  boot(): Promise<void>;
  run(): Promise<void>;
  runCallbacks(kind: string, block: () => unknown): Promise<unknown>;
  registerSignalHandlers(): void;
  setProcline(): void;
  isStopped(): boolean;
  isSupervisorWentAway(): boolean;
  isFinished(): Promise<boolean>;
  isRegistered(): boolean;
  isAllWorkCompleted(): Promise<boolean>;
  isRunningInline(): boolean;
  isRunningAsync(): boolean;
  isRunningAsFork(): boolean;
  createThread(block: () => unknown): Thread;
  handleThreadError(error: unknown): void;
}

export class Runnable {
  static readonly [classModule] = true;

  set mode(mode: string) {
    (this as unknown as RunnableHost)._mode = mode;
  }

  async start(this: RunnableHost): Promise<void> {
    await this.boot();

    if (this.isRunningAsync()) {
      this._thread = this.createThread(() => this.run());
    } else {
      await this.run();
    }
  }

  /** @internal */
  get mode(): Mode {
    return inquiry.call(String((this as unknown as RunnableHost)._mode ?? DEFAULT_MODE));
  }

  /** @internal */
  async boot(this: RunnableHost): Promise<void> {
    await SolidQueue.instrument("start_process", { process: this }, async () => {
      await this.runCallbacks("boot", () => {
        if (this.isRunningAsFork()) {
          this.registerSignalHandlers();
          this.setProcline();
        }
      });
    });
  }

  /** @internal */
  async isShuttingDown(this: RunnableHost): Promise<boolean> {
    return (
      this.isStopped() ||
      (this.isRunningAsFork() && this.isSupervisorWentAway()) ||
      (await this.isFinished()) ||
      !this.isRegistered()
    );
  }

  /** @internal */
  async run(): Promise<void> {
    throw new NotImplementedError();
  }

  /** @internal */
  async isFinished(this: RunnableHost): Promise<boolean> {
    return this.isRunningInline() && (await this.isAllWorkCompleted());
  }

  /** @internal */
  async isAllWorkCompleted(): Promise<boolean> {
    return false;
  }

  /** @internal */
  async shutdown(): Promise<void> {}

  /** @internal */
  setProcline(): void {}

  /** @internal */
  isRunningInline(this: RunnableHost): boolean {
    return this.mode["inline?"]();
  }

  /** @internal */
  isRunningAsync(this: RunnableHost): boolean {
    return this.mode["async?"]();
  }

  /** @internal */
  isRunningAsFork(this: RunnableHost): boolean {
    return this.mode["fork?"]();
  }

  /** @internal */
  createThread(this: RunnableHost, block: () => unknown): Thread {
    return new Thread(async () => {
      Thread.current().name = this.name;
      try {
        return await block();
      } catch (exception) {
        this.handleThreadError(exception);
        throw exception;
      }
    });
  }
}
include(Runnable, Supervised);
