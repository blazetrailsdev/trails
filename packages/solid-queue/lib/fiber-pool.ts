import {
  Fiber,
  Mutex,
  Queue,
  RuntimeError,
  Semaphore,
  constSet,
  rbObjId,
  type Thread,
} from "@blazetrails/ruby-compat";
import type { ClaimedExecution } from "./claimed-execution.js";
import { Pool } from "./pool.js";
import { SolidQueue } from "./solid-queue.js";

export class FiberPool extends Pool {
  static {
    constSet(SolidQueue, "FiberPool", this);
  }

  private readonly _stateMutex: Mutex;
  private _shutdown: boolean;
  private _fatalError: unknown;
  private readonly _bootQueue: Queue<unknown>;
  private readonly _pendingExecutions: Queue<ClaimedExecution>;
  private _reactorThread: Thread<Promise<void>> | null;
  declare private _name?: string;

  constructor(
    size: number,
    {
      onIdle = null,
      onUnrecoverableError = null,
    }: { onIdle?: (() => unknown) | null; onUnrecoverableError?: (() => unknown) | null } = {},
  ) {
    super(size, { onIdle: onIdle, onUnrecoverableError: onUnrecoverableError });

    this._stateMutex = new Mutex();
    this._shutdown = false;
    this._fatalError = null;
    this._bootQueue = new Queue();
    this._pendingExecutions = new Queue();
    this._reactorThread = null;
  }

  override async post(execution: ClaimedExecution): Promise<void> {
    this.raiseIfFatalErrorBang();
    if (this.isShutdown()) throw new RuntimeError("Execution pool is shutting down");

    await super.post(execution);
  }

  override async availableCapacity(): Promise<number> {
    this.raiseIfFatalErrorBang();
    return await super.availableCapacity();
  }

  shutdown(): boolean {
    const shutDown = this.stateMutex.synchronize(() => {
      if (this._shutdown) return false;

      this._shutdown = true;
      return true;
    }) as boolean;
    if (shutDown) this.pendingExecutions.close();
    return shutDown;
  }

  isShutdown(): boolean {
    return this.stateMutex.synchronize(() => this._shutdown) as boolean;
  }

  async waitForTermination(timeout: number | null): Promise<Thread | null> {
    return (await this.reactorThread?.join(timeout)) ?? null;
  }

  /** @internal */
  private get bootQueue(): Queue<unknown> {
    return this._bootQueue;
  }

  /** @internal */
  private get pendingExecutions(): Queue<ClaimedExecution> {
    return this._pendingExecutions;
  }

  /** @internal */
  private get reactorThread(): Thread<Promise<void>> | null {
    return this._reactorThread;
  }

  /** @internal */
  private get stateMutex(): Mutex {
    return this._stateMutex;
  }

  /** @internal */
  private get name(): string {
    return (this._name ??= `solid_queue-fiber-pool-${rbObjId(this)}`);
  }

  /** @internal */
  protected override async schedule(execution: ClaimedExecution): Promise<void> {
    await this.startReactorIfNeeded();
    this.pendingExecutions.push(execution);
  }

  /** @internal */
  private async startReactorIfNeeded(): Promise<void> {
    this._reactorThread ??= await (async () => {
      const reactorThread = this.startReactor();
      const bootResult = await this.bootQueue.pop();
      if (bootResult instanceof Error) throw bootResult;
      return reactorThread;
    })();
  }

  /** @internal */
  private startReactor(): Thread<Promise<void>> {
    return this.createThread(async () => {
      try {
        const semaphore = new Semaphore(this.size);
        const children = new Set<Promise<void>>();
        this.bootQueue.push("ready");

        await this.waitForExecutions(semaphore, children);
        await Promise.all(children);
      } catch (error) {
        await this.registerFatalError(error);
        throw error;
      }
    });
  }

  /** @internal */
  private async waitForExecutions(
    semaphore: Semaphore,
    children: Set<Promise<void>>,
  ): Promise<void> {
    let execution: ClaimedExecution | null;
    while ((execution = await this.pendingExecutions.pop()) != null) {
      await semaphore.acquire();
      const scheduledExecution = execution;
      const child: Promise<void> = new Fiber(() => this.performExecution(scheduledExecution))
        .resume()
        .finally(() => {
          semaphore.release();
          children.delete(child);
        });
      children.add(child);
    }
  }

  /** @internal */
  private async registerFatalError(error: unknown): Promise<void> {
    this.stateMutex.synchronize(() => {
      this._fatalError ??= error;
    });

    if (this.bootQueue.isEmpty()) this.bootQueue.push(error);
    await this.onIdle?.();
  }

  /** @internal */
  private raiseIfFatalErrorBang(): void {
    const error = this.stateMutex.synchronize(() => this._fatalError);
    if (error != null) throw error;
  }
}
