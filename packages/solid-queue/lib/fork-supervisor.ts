import { Process } from "@blazetrails/ruby-compat";
import { ProcessExitError } from "./processes/process-exit-error.js";
import { SolidQueue } from "./solid-queue.js";
import { Supervisor } from "./supervisor.js";
import { Timer } from "./timer.js";

interface Status {
  pid: string;
  exitstatus: number | null;
  isExited(): boolean;
  isSignaled(): boolean;
  stopsig: null;
  termsig: null;
}

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

  /**
   * @internal
   * @missingRailsArgs waitpid2 — PERMANENT
   */
  protected override async checkAndReplaceTerminatedProcesses(): Promise<void> {
    while (true) {
      const [pid, status] = this.waitpid2() ?? [];
      if (pid == null) break;

      await this.replaceFork(pid, status!);
    }

    this.checkBootTimeouts();
  }

  /** @internal */
  private checkBootTimeouts(): void {
    for (const [pid, instance] of Object.entries(this.processInstances)) {
      if (instance.isBootTimedOut()) this.terminateUnreadyProcess(pid);
    }
  }

  /** @internal */
  private terminateUnreadyProcess(pid: string): void {
    SolidQueue.instrument(
      "fork_boot_timeout",
      { process: this.processInstances[pid], pid: pid },
      () => {
        this.signalProcess(pid, "KILL");
      },
    );
  }

  /**
   * @internal
   * @missingRailsArgs waitpid2 — PERMANENT
   */
  private async reapTerminatedForks(): Promise<void> {
    while (true) {
      const [pid, status] = this.waitpid2() ?? [];
      if (pid == null) break;

      const terminatedFork = this.processInstances[pid];
      if (terminatedFork) {
        delete this.processInstances[pid];
        terminatedFork.markAsReaped();

        if (!status!.isExited() || status!.exitstatus! > 0) {
          await this.attemptToReleaseClaimedJobsBy(terminatedFork, {
            withError: new ProcessExitError(status!),
          });
        }
      }

      delete this.configuredProcesses[pid];
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

  /** @noRailsEquivalent CONVERGEABLE solid-queue-fork-mode-unported-register */
  private waitpid2(): [string, Status] | null {
    for (const [pid, instance] of Object.entries(this.processInstances)) {
      if (instance.isAlive()) continue;

      const exitBang = instance._thread!.toKill;
      const exited = exitBang || instance.isStopped();
      return [
        pid,
        {
          pid: pid,
          exitstatus: exitBang ? 1 : exited ? 0 : null,
          isExited: () => exited,
          isSignaled: () => false,
          stopsig: null,
          termsig: null,
        },
      ];
    }
    return null;
  }
}

SolidQueue.ForkSupervisor = ForkSupervisor;
