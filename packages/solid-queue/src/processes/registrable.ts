import { RecordNotFound } from "@blazetrails/activerecord";
import { compact, included, isPresent } from "@blazetrails/activesupport";
import { TimerTask, classModule, rbModAttrReader, rbModAttrWriter } from "@blazetrails/ruby-compat";
import { Process } from "../process.js";
import { SolidQueue } from "../solid-queue.js";

interface RegistrableHost {
  process: Process | null;
  _heartbeatTask?: TimerTask;
  kind: string;
  name: string;
  pid: number;
  hostname: string;
  supervisor?: unknown;
  metadata(): Record<string, unknown>;
  wrapInAppExecutor<T>(block: () => T): T;
  handleThreadError(error: unknown): void;
  heartbeat(): Promise<void>;
  wakeUp(): Promise<void>;
}

type RegistrableIncludingClass = { prototype: object } & {
  afterBoot(...names: string[]): void;
  beforeShutdown(...names: string[]): void;
  afterShutdown(...names: string[]): void;
};

export class Registrable {
  static readonly [classModule] = true;

  static [included](base: RegistrableIncludingClass): void {
    base.afterBoot(":register", ":launchHeartbeat");

    base.beforeShutdown(":stopHeartbeat");
    base.afterShutdown(":deregister");

    rbModAttrReader(base, "process");
    rbModAttrWriter(base, "process");
  }

  get processId(): unknown {
    return (this as unknown as RegistrableHost).process?.id ?? null;
  }

  /** @internal */
  async register(this: RegistrableHost): Promise<void> {
    this.process = await Process.register({
      kind: this.kind,
      name: this.name,
      pid: this.pid,
      hostname: this.hostname,
      supervisor: this.supervisor ?? null,
      metadata: compact(this.metadata()),
    });
  }

  /** @internal */
  async deregister(this: RegistrableHost): Promise<void> {
    await this.process?.deregister();
  }

  /** @internal */
  isRegistered(this: RegistrableHost): boolean {
    return isPresent(this.process);
  }

  /** @internal */
  launchHeartbeat(this: RegistrableHost): void {
    this._heartbeatTask = new TimerTask(
      { executionInterval: Number(SolidQueue.processHeartbeatInterval) },
      () => this.wrapInAppExecutor(() => this.heartbeat()),
    );

    this._heartbeatTask.addObserver((_, __, error) => {
      if (error != null) this.handleThreadError(error);
    });

    this._heartbeatTask.execute();
  }

  /** @internal */
  stopHeartbeat(this: RegistrableHost): void {
    this._heartbeatTask?.shutdown();
  }

  /** @internal */
  async heartbeat(this: RegistrableHost): Promise<void> {
    try {
      await this.process!.heartbeat();
    } catch (e) {
      if (!(e instanceof RecordNotFound)) throw e;
      this.process = null;
      await this.wakeUp();
    }
  }
}
