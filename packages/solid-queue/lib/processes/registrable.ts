import { RecordNotFound } from "@blazetrails/activerecord";
import { compact, included, isPresent } from "@blazetrails/activesupport";
import { TimerTask, classModule, rbModAttrReader, rbModAttrWriter } from "@blazetrails/ruby-compat";
import type { Process } from "../process.js";
import { SolidQueue } from "../solid-queue.js";
import type { ClassMethods as CallbacksClassMethods } from "./callbacks.js";

interface RegistrableHost {
  process: Process | null;
  _heartbeatTask?: TimerTask;
  kind: string;
  name: string;
  pid: number;
  hostname: string;
  supervisor?: unknown;
  metadata(): Promise<Record<string, unknown>>;
  wrapInAppExecutor<T>(block: () => T): T;
  handleThreadError(error: unknown): void;
  heartbeat(): Promise<void>;
  isPresumedDead(): boolean;
  stopToBeReplaced(): Promise<void>;
  wakeUp(): Promise<void>;
}

type RegistrableIncludingClass = { prototype: object } & CallbacksClassMethods;

export class Registrable {
  static readonly [classModule] = true;

  static [included](base: RegistrableIncludingClass): void {
    base.afterBoot(":register", ":launchHeartbeat");

    base.afterShutdown(":stopHeartbeat", ":deregister");

    rbModAttrReader(base, "process");
    rbModAttrWriter(base, "process");
  }

  get processId(): unknown {
    return (this as unknown as RegistrableHost).process?.id ?? null;
  }

  /** @internal */
  async register(this: RegistrableHost): Promise<void> {
    await this.wrapInAppExecutor(async () => {
      this.process = await SolidQueue.Process!.register({
        kind: this.kind,
        name: this.name,
        pid: this.pid,
        hostname: this.hostname,
        supervisor: this.supervisor ?? null,
        metadata: compact(await this.metadata()),
      });
    });
  }

  /** @internal */
  async deregister(this: RegistrableHost): Promise<void> {
    await this.wrapInAppExecutor(async () => await this.process?.deregister());
  }

  /** @internal */
  isRegistered(this: RegistrableHost): boolean {
    return isPresent(this.process);
  }

  /** @internal */
  launchHeartbeat(this: RegistrableHost): void {
    this._heartbeatTask = new TimerTask(
      { executionInterval: SolidQueue.processHeartbeatInterval.toF() },
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
      await this.process?.heartbeat();
    } catch (error) {
      if (error instanceof RecordNotFound) {
        await this.stopToBeReplaced();
      } else {
        if (this.isPresumedDead()) await this.stopToBeReplaced();
        throw error;
      }
    }
  }

  /** @internal */
  isPresumedDead(this: RegistrableHost): boolean {
    return (
      this.process != null &&
      this.process.last_heartbeat_at.compare(SolidQueue.processAliveThreshold.ago())! <= 0
    );
  }

  /** @internal */
  async stopToBeReplaced(this: RegistrableHost): Promise<void> {
    this.process = null;
    await this.wakeUp();
  }

  /** @internal */
  async reloadMetadata(this: RegistrableHost): Promise<void> {
    await this.wrapInAppExecutor(
      async () => await this.process?.update({ metadata: compact(await this.metadata()) }),
    );
  }
}
