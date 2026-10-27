import { include, seconds } from "@blazetrails/activesupport";
import { Process, STDERR, STDOUT, abort, registerConstant } from "@blazetrails/ruby-compat";
import { Configuration } from "./configuration.js";
import {
  LifecycleHooks,
  type ClassMethods as LifecycleHooksClassMethods,
} from "./lifecycle-hooks.js";
import { Base } from "./processes/base.js";
import { ProcessExitError } from "./processes/process-exit-error.js";
import { SolidQueue } from "./solid-queue.js";
import { Maintenance } from "./supervisor/maintenance.js";
import { Pidfiled } from "./supervisor/pidfiled.js";
import { Signals } from "./supervisor/signals.js";
import { Timer } from "./timer.js";

interface Supervisee {
  name: string;
  mode: unknown;
  _thread: { isAlive(): boolean; kill(): unknown };
  supervisedBy(process: unknown): void;
  start(): Promise<void>;
  stop(): Promise<void>;
  isStopped(): boolean;
}

interface Status {
  pid: string;
  exitstatus: number | null;
  isExited(): boolean;
  isSignaled(): boolean;
  stopsig: null;
  termsig: null;
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface below. */
export class Supervisor extends Base {
  declare static lifecycleHooks: Record<"start" | "stop", (() => unknown)[]>;
  declare static onStart: typeof LifecycleHooksClassMethods.onStart;
  declare static onStop: typeof LifecycleHooksClassMethods.onStop;
  declare static clearHooks: typeof LifecycleHooksClassMethods.clearHooks;

  static {
    include(this, LifecycleHooks);
    include(this, Maintenance);
    include(this, Signals);
    include(this, Pidfiled);
  }

  static async start(options: { [key: string]: unknown } = {}): Promise<Supervisor> {
    SolidQueue.supervisor = true;
    const configuration = new Configuration(options);

    if (await configuration.isValid()) {
      const supervisor = new this(configuration);
      await supervisor.start();
      return supervisor;
    } else {
      abort(configuration.errors.fullMessages.join("\n") + "\nExiting...");
    }
  }

  /** @internal */
  private configuration: Configuration;
  /** @internal */
  forks: { [pid: string]: Supervisee };
  /** @internal */
  private configuredProcesses: { [pid: string]: InstanceType<typeof Configuration.Process> };

  constructor(configuration: Configuration) {
    super(configuration);
    this.configuration = configuration;
    this.forks = {};
    this.configuredProcesses = {};
  }

  async start(): Promise<void> {
    await this.boot();
    await this.runStartHooks();

    await this.startProcesses();
    this.launchMaintenanceTask();

    await this.supervise();
  }

  override async stop(): Promise<void> {
    await super.stop();
    await this.runStopHooks();
  }

  /** @internal */
  private async boot(): Promise<void> {
    await SolidQueue.instrument("start_process", { process: this }, async () => {
      await this.runCallbacks("boot", () => {
        this.syncStdStreams();
      });
    });
  }

  /** @internal */
  private async startProcesses(): Promise<void> {
    for (const configuredProcess of await this.configuration.configuredProcesses()) {
      await this.startProcess(configuredProcess);
    }
  }

  /** @internal */
  private async supervise(): Promise<void> {
    try {
      while (true) {
        if (this.isStopped()) break;

        this.setProcline();
        await this.processSignalQueue();

        if (!this.isStopped()) {
          await this.reapAndReplaceTerminatedForks();
          await this.interruptibleSleep(seconds(1));
        }
      }
    } finally {
      await this.shutdown();
    }
  }

  /** @internal */
  private async startProcess(
    configuredProcess: InstanceType<typeof Configuration.Process>,
  ): Promise<void> {
    const processInstance = configuredProcess.instantiate() as Supervisee;
    processInstance.supervisedBy(this.process);
    processInstance.mode = "async";

    await processInstance.start();
    const pid = processInstance.name;

    this.configuredProcesses[pid] = configuredProcess;
    this.forks[pid] = processInstance;
  }

  /** @internal */
  private setProcline(): void {
    this.procline(`supervising ${this.supervisedProcesses().join(", ")}`);
  }

  /** @internal */
  private async terminateGracefully(): Promise<void> {
    await SolidQueue.instrument(
      "graceful_termination",
      {
        process_id: this.processId,
        supervisor_pid: Process.pid,
        supervised_processes: this.supervisedProcesses(),
      },
      async (payload) => {
        this.termForks();

        await Timer.waitUntil(
          Number(SolidQueue.shutdownTimeout),
          () => this.isAllForksTerminated(),
          () => this.reapTerminatedForks(),
        );

        if (!this.isAllForksTerminated()) {
          payload.shutdown_timeout_exceeded = true;
          await this.terminateImmediately();
        }
      },
    );
  }

  /** @internal */
  private async terminateImmediately(): Promise<void> {
    await SolidQueue.instrument(
      "immediate_termination",
      {
        process_id: this.processId,
        supervisor_pid: Process.pid,
        supervised_processes: this.supervisedProcesses(),
      },
      () => {
        this.quitForks();
      },
    );
  }

  /** @internal */
  private async shutdown(): Promise<void> {
    await SolidQueue.instrument("shutdown_process", { process: this }, async () => {
      await this.runCallbacks("shutdown", () => {
        this.stopMaintenanceTask();
      });
    });
  }

  /** @internal */
  private syncStdStreams(): void {
    STDOUT.sync = STDERR.sync = true;
  }

  /** @internal */
  private supervisedProcesses(): string[] {
    return Object.keys(this.forks);
  }

  /** @internal */
  private termForks(): void {
    this.signalProcesses(Object.keys(this.forks), "TERM");
  }

  /** @internal */
  private quitForks(): void {
    this.signalProcesses(Object.keys(this.forks), "QUIT");
  }

  /**
   * @internal
   * @missingRailsArgs waitpid2 — PERMANENT
   */
  private async reapAndReplaceTerminatedForks(): Promise<void> {
    while (true) {
      const [pid, status] = this.waitpid2() ?? [];
      if (pid == null) break;

      await this.replaceFork(pid, status!);
    }
  }

  /**
   * @internal
   * @missingRailsArgs waitpid2 — PERMANENT
   */
  private async reapTerminatedForks(): Promise<void> {
    while (true) {
      const [pid, status] = this.waitpid2() ?? [];
      if (pid == null) break;

      const terminatedFork = this.forks[pid];
      delete this.forks[pid];
      if (terminatedFork && (!status!.isExited() || status!.exitstatus! > 0)) {
        await this.handleClaimedJobsBy(terminatedFork, status!);
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
        const terminatedFork = this.forks[pid];
        if (terminatedFork) {
          delete this.forks[pid];
          payload.fork = terminatedFork;
          await this.handleClaimedJobsBy(terminatedFork, status);

          const configuredProcess = this.configuredProcesses[pid];
          delete this.configuredProcesses[pid];
          await this.startProcess(configuredProcess);
        }
      },
    );
  }

  /** @internal */
  private async handleClaimedJobsBy(terminatedFork: Supervisee, status: Status): Promise<void> {
    const registeredProcess = await this.process!.supervisees.findBy({
      name: terminatedFork.name,
    });
    if (registeredProcess) {
      const error = new ProcessExitError(status);
      await registeredProcess.failAllClaimedExecutionsWith(error);
    }
  }

  /** @internal */
  private isAllForksTerminated(): boolean {
    return Object.keys(this.forks).length === 0;
  }

  /** @internal */
  private waitpid2(): [string, Status] | null {
    for (const [pid, instance] of Object.entries(this.forks)) {
      if (instance._thread.isAlive()) continue;

      const exited = instance.isStopped();
      return [
        pid,
        {
          pid: pid,
          exitstatus: exited ? 0 : null,
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

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include LifecycleHooks`, `include Maintenance, Signals, Pidfiled` (`supervisor.rb:5-6`). */
export interface Supervisor {
  runStartHooks(): Promise<void>;
  runStopHooks(): Promise<void>;
  launchMaintenanceTask(): void;
  stopMaintenanceTask(): void;
  processSignalQueue(): Promise<void>;
  signalProcesses(pids: string[], signal: "QUIT" | "INT" | "TERM"): void;
}

SolidQueue.Supervisor = Supervisor;

registerConstant("SolidQueue::Supervisor", Supervisor);
