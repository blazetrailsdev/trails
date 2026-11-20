import { Process, SystemCallError } from "@blazetrails/ruby-compat";
import { ProcessExitError } from "./processes/process-exit-error.js";
import { SolidQueue } from "./solid-queue.js";
import { Supervisor } from "./supervisor.js";
import { Timer } from "./timer.js";

type Status = InstanceType<typeof Process.Status>;

export class ForkSupervisor extends Supervisor {
  /** @internal */
  protected override async performGracefulTermination(): Promise<void> {
    this.termForks();

    await Timer.waitUntil(
      SolidQueue.shutdownTimeout.toF(),
      () => this.isAllProcessesTerminated(),
      () => this.reapTerminatedForks(),
    );
  }

  /** @internal */
  protected override async performImmediateTermination(): Promise<void> {
    this.quitForks();
  }

  /** @internal */
  private termForks(): void {
    this.signalProcesses(Object.keys(this.processInstances), "TERM");
  }

  /** @internal */
  private quitForks(): void {
    this.signalProcesses(Object.keys(this.processInstances), "QUIT");
  }

  /** @internal */
  protected override async checkAndReplaceTerminatedProcesses(): Promise<void> {
    while (true) {
      const [pid, status] = Process.waitpid2(-1, Process.WNOHANG) ?? [];
      if (pid == null) break;

      await this.replaceFork(String(pid), status!);
    }

    await this.checkBootTimeouts();
  }

  /** @internal */
  private async checkBootTimeouts(): Promise<void> {
    for (const [pid, instance] of Object.entries(this.processInstances)) {
      if (instance.isBootTimedOut()) await this.terminateUnreadyProcess(pid);
    }
  }

  /** @internal */
  private async terminateUnreadyProcess(pid: string): Promise<void> {
    await SolidQueue.instrument(
      "fork_boot_timeout",
      { process: this.processInstances[pid], pid: pid },
      () => {
        this.signalProcess(pid, "KILL");
      },
    );
  }

  /** @internal */
  private async reapTerminatedForks(): Promise<void> {
    try {
      while (true) {
        const [pid, status] = Process.waitpid2(-1, Process.WNOHANG) ?? [];
        if (pid == null) break;

        const terminatedFork = this.processInstances[pid];
        if (terminatedFork) {
          delete this.processInstances[pid];
          terminatedFork.markAsReaped();

          if (!status!.isExited() || (status!.exitstatus() ?? 0) > 0) {
            await this.attemptToReleaseClaimedJobsBy(terminatedFork, {
              withError: new ProcessExitError(status!),
            });
          }
        }

        delete this.configuredProcesses[pid];
      }
    } catch (error) {
      if (!(error instanceof SystemCallError)) throw error;
    }
  }

  /** @internal */
  private async replaceFork(pid: string, status: Status): Promise<void> {
    await SolidQueue.instrument(
      "replace_fork",
      { supervisor_pid: Process.pid, pid: pid, status: status },
      async (payload) => {
        const terminatedFork = this.processInstances[pid];
        if (terminatedFork) {
          delete this.processInstances[pid];
          terminatedFork.markAsReaped();
          payload.fork = terminatedFork;

          await this.attemptToReleaseClaimedJobsBy(terminatedFork, {
            withError: new ProcessExitError(status),
          });

          const configuredProcess = this.configuredProcesses[pid];
          delete this.configuredProcesses[pid];
          await this.startProcess(configuredProcess);
        }
      },
    );
  }

  /** @internal */
  protected override isAllProcessesTerminated(): boolean {
    return Object.keys(this.processInstances).length === 0;
  }
}

SolidQueue.ForkSupervisor = ForkSupervisor;
