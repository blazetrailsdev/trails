import { include, seconds } from "@blazetrails/activesupport";
import {
  NotImplementedError,
  Process,
  STDERR,
  STDOUT,
  Thread,
  abort,
} from "@blazetrails/ruby-compat";
import { Configuration } from "./configuration.js";
import {
  LifecycleHooks,
  type ClassMethods as LifecycleHooksClassMethods,
} from "./lifecycle-hooks.js";
import { Base } from "./processes/base.js";
import { SolidQueue } from "./solid-queue.js";
import { Maintenance } from "./supervisor/maintenance.js";
import { Pidfiled } from "./supervisor/pidfiled.js";
import { Signals } from "./supervisor/signals.js";

interface Supervisee {
  name: string;
  mode: unknown;
  _thread?: { kill(): unknown; toKill: boolean };
  isAlive(): boolean | null;
  isBootTimedOut(): boolean;
  markAsReaped(): void;
  supervisedBy(process: unknown): void;
  start(): Promise<unknown>;
  stop(): Promise<void>;
  isStopped(): boolean;
}

type ConfiguredProcess = InstanceType<typeof Configuration.Process>;

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface below. */
export class Supervisor extends Base {
  declare static lifecycleHooks: Record<
    "start" | "stop" | "exit",
    ((process: unknown) => unknown)[]
  >;
  declare static onStart: typeof LifecycleHooksClassMethods.onStart;
  declare static onStop: typeof LifecycleHooksClassMethods.onStop;
  declare static onExit: typeof LifecycleHooksClassMethods.onExit;
  declare static clearHooks: typeof LifecycleHooksClassMethods.clearHooks;

  static {
    include(this, LifecycleHooks);
    include(this, Maintenance);
    include(this, Signals);
    include(this, Pidfiled);

    this.afterShutdown(":runExitHooks");
  }

  static async start(options: { [key: string]: unknown } = {}): Promise<Supervisor> {
    SolidQueue.supervisor = true;
    const configuration = new Configuration(options);

    if (await configuration.isValid()) {
      for (const warning of configuration.warnings.fullMessages) SolidQueue.logger?.warn(warning);

      const klass = configuration.mode().isFork()
        ? SolidQueue.ForkSupervisor!
        : SolidQueue.AsyncSupervisor!;
      const supervisor = new klass(configuration);
      await supervisor.start();
      return supervisor;
    } else {
      abort(configuration.errors.fullMessages.join("\n") + "\nExiting...");
    }
  }

  /** @internal */
  protected configuration: Configuration;
  /** @internal */
  protected configuredProcesses: { [processId: string]: ConfiguredProcess };
  /** @internal */
  protected processInstances: { [processId: string]: Supervisee };

  constructor(configuration: Configuration) {
    super(configuration);
    this.configuration = configuration;

    this.configuredProcesses = {};
    this.processInstances = {};

    (this as { name: string }).name = this.generateName();
  }

  mode(): ReturnType<Configuration["mode"]> {
    return this.configuration.mode();
  }

  isStandalone(): unknown {
    return this.configuration.isStandalone();
  }

  async start(): Promise<void> {
    await this.boot();
    await this.runStartHooks();

    await this.startProcesses();

    if (this.isStopped()) {
      await this.shutdown();
    } else {
      this.launchMaintenanceTask();
      await this.supervise();
    }
  }

  override async stop(): Promise<void> {
    await super.stop();
    await this.runStopHooks();
  }

  override get kind(): string {
    return `Supervisor(${this.configuration?.mode()})`;
  }

  /** @internal */
  protected async boot(): Promise<void> {
    await SolidQueue.instrument("start_process", { process: this }, async () => {
      await this.runCallbacks("boot", () => {
        this.syncStdStreams();
      });
    });
  }

  /** @internal */
  protected async startProcesses(): Promise<void> {
    for (const configuredProcess of await this.configuration.configuredProcesses()) {
      if (await this.isTimeToStop()) break;

      await this.startProcess(configuredProcess);
    }
  }

  /** @internal */
  protected async supervise(): Promise<void> {
    try {
      while (!(await this.isTimeToStop())) {
        this.setProcline();
        await this.checkAndReplaceTerminatedProcesses();
        await this.interruptibleSleep(seconds(1));
      }
    } finally {
      await this.shutdown();
    }
  }

  /** @internal */
  protected async isTimeToStop(): Promise<boolean> {
    await this.processSignalQueue();
    return this.isStopped();
  }

  /** @internal */
  protected async startProcess(configuredProcess: ConfiguredProcess): Promise<void> {
    const processInstance = configuredProcess.instantiate() as Supervisee;
    processInstance.supervisedBy(this.process);
    /** @inventedArm isFork — CONVERGEABLE solid-queue-fork-mode-unported-register */
    processInstance.mode = this.mode().isFork() ? "async" : this.mode();

    const processId = String(await processInstance.start());

    this.configuredProcesses[processId] = configuredProcess;
    this.processInstances[processId] = processInstance;
  }

  /** @internal */
  protected async checkAndReplaceTerminatedProcesses(): Promise<void> {}

  /** @internal */
  protected async terminateGracefully(): Promise<void> {
    await SolidQueue.instrument(
      "graceful_termination",
      {
        process_id: this.processId,
        supervisor_pid: Process.pid,
        supervised_processes: Object.keys(this.configuredProcesses),
      },
      async (payload) => {
        await this.performGracefulTermination();

        if (!this.isAllProcessesTerminated()) {
          payload.shutdown_timeout_exceeded = true;
          await this.terminateImmediately();
        }
      },
    );
  }

  /** @internal */
  protected async terminateImmediately(): Promise<void> {
    await SolidQueue.instrument(
      "immediate_termination",
      {
        process_id: this.processId,
        supervisor_pid: Process.pid,
        supervised_processes: Object.keys(this.configuredProcesses),
      },
      async () => {
        await this.performImmediateTermination();
      },
    );
  }

  /** @internal */
  protected async performGracefulTermination(): Promise<void> {
    throw new NotImplementedError();
  }

  /** @internal */
  protected async performImmediateTermination(): Promise<void> {
    throw new NotImplementedError();
  }

  /** @internal */
  protected isAllProcessesTerminated(): boolean {
    throw new NotImplementedError();
  }

  /** @internal */
  protected async shutdown(): Promise<void> {
    await SolidQueue.instrument("shutdown_process", { process: this }, async () => {
      await this.runCallbacks("shutdown", () => {
        this.stopMaintenanceTask();
      });
    });
  }

  /** @internal */
  protected setProcline(): void {
    if (this.isStandalone()) {
      this.procline(`supervising ${Object.keys(this.configuredProcesses).join(", ")}`);
    }
  }

  /** @internal */
  protected syncStdStreams(): void {
    STDOUT.sync = STDERR.sync = true;
  }
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include LifecycleHooks`, `include Maintenance, Signals, Pidfiled` (`supervisor.rb:5-6`). */
export interface Supervisor {
  runStartHooks(): Promise<void>;
  runStopHooks(): Promise<void>;
  launchMaintenanceTask(): void;
  stopMaintenanceTask(): void;
  attemptToReleaseClaimedJobsBy(
    terminatedProcess: { name: string },
    options: { withError: Error },
  ): Promise<void>;
  processSignalQueue(): Promise<void>;
  signalProcesses(pids: string[], signal: "QUIT" | "INT" | "TERM" | "KILL"): void;
  signalProcess(pid: string, signal: "QUIT" | "INT" | "TERM" | "KILL"): void;
  signalQueue(): string[];
  interrupt(): Promise<void>;
  createThread<R>(block: () => R): Thread<Promise<R>>;
}

SolidQueue.Supervisor = Supervisor;
