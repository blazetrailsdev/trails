import { demodulize, include } from "@blazetrails/activesupport";
import { Process, SecureRandom, Socket } from "@blazetrails/ruby-compat";
import { AppExecutor } from "../app-executor.js";
import { Callbacks } from "./callbacks.js";
import { Interruptible } from "./interruptible.js";
import { Procline } from "./procline.js";
import { Registrable } from "./registrable.js";
import type { Process as ProcessRecord } from "../process.js";

/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include` of the process concerns (`processes/base.rb:6-7`). */
/** @inventedArm include — CONVERGEABLE port-solid-queue-engine */
export class Base {
  static toString(): string {
    return "SolidQueue::Processes::Base";
  }

  static {
    include(this, Callbacks);
    include(this, AppExecutor);
    include(this, Registrable);
    include(this, Procline);
    include(this, Interruptible);
  }

  readonly name: string;
  private _stopped: boolean;
  private _hostname?: string;
  private _pid?: number;

  constructor(..._args: unknown[]) {
    this.name = this.generateName();
    this._stopped = false;
  }

  get kind(): string {
    return demodulize(String(this.constructor));
  }

  get hostname(): string {
    return (this._hostname ??= Socket.gethostname());
  }

  get pid(): number {
    return (this._pid ??= Process.pid);
  }

  metadata(): Record<string, unknown> {
    return {};
  }

  async stop(): Promise<void> {
    this._stopped = true;
  }

  /** @internal */
  generateName(): string {
    return [this.kind.toLowerCase(), SecureRandom.hex(10)].join("-");
  }

  /** @internal */
  isStopped(): boolean {
    return this._stopped;
  }
}

export interface Base {
  process: ProcessRecord | null;
  readonly processId: unknown;
  runCallbacks(kind: string, block?: () => unknown): Promise<unknown>;
  wrapInAppExecutor<T>(block: () => T): T;
  handleThreadError(error: unknown): void;
  procline(string: string): void;
  wakeUp(): Promise<void>;
  interruptibleSleep(time: unknown): Promise<null>;
  isRegistered(): boolean;
}
/* eslint-enable @typescript-eslint/no-unsafe-declaration-merging */
