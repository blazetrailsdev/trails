import { Process, StandardError, Thread, exitBang } from "@blazetrails/ruby-compat";
import { Process as ProcessRecord } from "./process.js";
import { ThreadTerminatedError } from "./processes/thread-terminated-error.js";
import { SolidQueue } from "./solid-queue.js";
import { Supervisor } from "./supervisor.js";
import { Timer } from "./timer.js";

export class AsyncSupervisor extends Supervisor {
  static {
    this.afterShutdown(":terminateGracefully", { unless: ":isStandalone" });
  }

  /** @internal */
  private _thread?: Thread;

  override async stop(): Promise<void> {
    await super.stop();
    await this._thread?.join();
  }

  /** @internal */
  protected override async supervise(): Promise<void> {
    if (this.isStandalone()) await super.supervise();
    else {
      this._thread = this.createThread(() => super.supervise());
    }
  }

  /** @internal */
  protected override async checkAndReplaceTerminatedProcesses(): Promise<void> {
    const terminatedThreads = Object.entries(this.processInstances).filter(
      ([_threadId, instance]) => !instance.isAlive(),
    );
    for (const [threadId] of terminatedThreads) await this.replaceThread(threadId);
  }

  /** @internal */
  private async replaceThread(threadId: string): Promise<void> {
    await SolidQueue.instrument(
      "replace_thread",
      { supervisor_pid: Process.pid },
      async (payload) => {
        const instance = this.processInstances[threadId];
        if (instance) {
          delete this.processInstances[threadId];
          payload.thread = instance;

          await this.attemptToReleaseClaimedJobsBy(instance, {
            withError: new ThreadTerminatedError(instance.name),
          });

          const configuredProcess = this.configuredProcesses[threadId];
          delete this.configuredProcesses[threadId];
          await this.startProcess(configuredProcess);
        }
      },
    );
  }

  /** @internal */
  protected override async performGracefulTermination(): Promise<void> {
    for (const instance of Object.values(this.processInstances)) await instance.stop();

    await Timer.waitUntil(SolidQueue.shutdownTimeout.toF(), () => this.isAllProcessesTerminated());

    if (!this.isAllProcessesTerminated()) await this.attemptToDeregister();
  }

  /** @internal */
  protected override async performImmediateTermination(): Promise<void> {
    exitBang();
  }

  /** @internal */
  private async attemptToDeregister(): Promise<void> {
    try {
      await this.wrapInAppExecutor(async () => {
        await (await ProcessRecord.findBy({ id: this.processId }))?.deregister();
      });
    } catch (error) {
      if (!(error instanceof StandardError)) throw error;
      this.handleThreadError(error);
    }
  }

  /** @internal */
  protected override isAllProcessesTerminated(): boolean {
    return !Object.values(this.processInstances).some((instance) => instance.isAlive());
  }
}

SolidQueue.AsyncSupervisor = AsyncSupervisor;
