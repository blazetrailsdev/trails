import { include, inquiry, type StringInquirer } from "@blazetrails/activesupport";
import {
  Errno,
  IO,
  rbObjId,
  NotImplementedError,
  rbCallSuper,
  type PipeIO,
  Thread,
  classModule,
} from "@blazetrails/ruby-compat";
import { SolidQueue } from "../solid-queue.js";
import { Timer } from "../timer.js";
import { Supervised } from "./supervised.js";

const DEFAULT_MODE = "async";

type Mode = StringInquirer & Record<string, () => boolean>;

interface RunnableHost {
  _mode?: string | null;
  _thread?: Thread;
  _bootGuard: NullGuard | ForkGuard;
  name: string;
  mode: Mode;
  boot(): Promise<void>;
  runInMode(block: () => Promise<void>): Promise<unknown>;
  run(): Promise<void>;
  runCallbacks(kind: string, block: () => unknown): Promise<unknown>;
  registerSignalHandlers(): void;
  setProcline(): void | Promise<void>;
  isStopped(): boolean;
  isSupervisorWentAway(): boolean;
  isFinished(): Promise<boolean>;
  isRegistered(): boolean;
  isAllWorkCompleted(): Promise<boolean>;
  isRunningInline(): boolean;
  isRunningAsync(): boolean;
  isRunningAsFork(): boolean;
  isSupervised(): boolean;
  wakeUp(): Promise<void>;
  createThread(block: () => unknown): Thread;
  handleThreadError(error: unknown): void;
}

export class Runnable {
  static readonly [classModule] = true;

  set mode(mode: string) {
    (this as unknown as RunnableHost)._mode = mode;
  }

  async start(this: RunnableHost): Promise<unknown> {
    return await this.runInMode(async () => {
      await this.boot();
      await this.run();
    });
  }

  async stop(this: RunnableHost): Promise<void> {
    await rbCallSuper(this, Runnable.prototype.stop);
    await this.wakeUp();

    if (!this.isSupervised()) {
      await this._thread?.join();
    }
  }

  isAlive(this: RunnableHost): boolean | null {
    return !this.isRunningAsync() || (this._thread?.isAlive() ?? null);
  }

  isBootTimedOut(this: RunnableHost): boolean {
    return this._bootGuard.isTimedOut();
  }

  markAsReaped(this: RunnableHost): void {
    this._bootGuard.close();
  }

  /** @internal */
  get mode(): Mode {
    return inquiry.call(String((this as unknown as RunnableHost)._mode ?? DEFAULT_MODE));
  }

  /** @internal */
  async runInMode(this: RunnableHost, block: () => Promise<void>): Promise<unknown> {
    if (this.isRunningAsFork()) {
      this._bootGuard = new ForkGuard();
      await block();
      this._bootGuard.start();
      return;
    } else if (this.isRunningAsync()) {
      this._bootGuard = new NullGuard();
      this._thread = this.createThread(block);
      return rbObjId(this._thread);
    } else {
      this._bootGuard = new NullGuard();
      return await block();
    }
  }

  /** @internal */
  async boot(this: RunnableHost): Promise<void> {
    await SolidQueue.instrument("start_process", { process: this }, async () => {
      await this.runCallbacks("boot", async () => {
        if (this.isRunningAsFork()) {
          this.registerSignalHandlers();
          await this.setProcline();
        }
      });
    });

    this._bootGuard.complete();
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
    return this.mode.isInline();
  }

  /** @internal */
  isRunningAsync(this: RunnableHost): boolean {
    return this.mode.isAsync();
  }

  /** @internal */
  isRunningAsFork(this: RunnableHost): boolean {
    return this.mode.isFork();
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

export class NullGuard {
  private _completed?: boolean;

  complete(): void {
    this._completed = true;
  }

  start(): void {}

  isCompleted(): boolean | undefined {
    return this._completed;
  }

  isTimedOut(): boolean {
    return false;
  }

  close(): void {}
}

export class ForkGuard {
  private _reader: PipeIO;
  private _writer: PipeIO;
  private _createdAt: number;
  private _completed?: boolean;

  constructor() {
    [this._reader, this._writer] = IO.pipe();
    this._createdAt = Timer.monotonicTimeNow();
  }

  complete(): void {
    try {
      this.reader.close();
      this.writer.write(".");
    } catch (error) {
      if (!(error instanceof Errno.EPIPE)) throw error;
    } finally {
      this.writer.close();
    }
  }

  start(): void {
    this.writer.close();
  }

  isCompleted(): boolean {
    return (this._completed ||= (() => {
      const completed = this.reader.readNonblock(1, null, { exception: false }) !== "wait_readable";
      if (completed) this.reader.close();
      return completed;
    })());
  }

  isTimedOut(): boolean {
    return (
      !this.isCompleted() &&
      Timer.monotonicTimeNow() - this.createdAt >= SolidQueue.forkBootTimeout.toF()
    );
  }

  close(): void {
    if (!this.reader.isClosed()) this.reader.close();
    if (!this.writer.isClosed()) this.writer.close();
  }

  /** @internal */
  private get reader(): PipeIO {
    return this._reader;
  }

  /** @internal */
  private get writer(): PipeIO {
    return this._writer;
  }

  /** @internal */
  private get createdAt(): number {
    return this._createdAt;
  }
}

export const BootGuards = { NullGuard, ForkGuard };
SolidQueue.Processes.BootGuards = BootGuards;
