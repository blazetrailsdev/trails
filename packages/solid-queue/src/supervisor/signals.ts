import { Concern, extend } from "@blazetrails/activesupport";
import { classModule, onSignal } from "@blazetrails/ruby-compat";
import { SolidQueue } from "../solid-queue.js";

type Signal = "QUIT" | "INT" | "TERM";

interface Supervisee {
  stop(): Promise<void>;
  _thread?: { kill(): unknown };
}

interface SignalsHost {
  _signalQueue?: Signal[];
  _signalHandlers?: (() => void)[];
  forks: { [pid: string]: Supervisee };
  signalQueue(): Signal[];
  interrupt(): Promise<void>;
  stop(): Promise<void>;
  terminateGracefully(): Promise<void>;
  terminateImmediately(): Promise<void>;
  handleSignal(signal: Signal): Promise<void>;
  signalProcess(pid: string, signal: Signal): void;
}

const SIGNALS: Signal[] = ["QUIT", "INT", "TERM"];

export class Signals {
  static readonly [classModule] = true;

  /** @internal */
  registerSignalHandlers(this: SignalsHost): void {
    this._signalHandlers = SIGNALS.map((signal) =>
      onSignal(`SIG${signal}`, () => {
        this.signalQueue().push(signal);
        void this.interrupt();
      }),
    );
  }

  /** @internal */
  restoreDefaultSignalHandlers(this: SignalsHost): void {
    for (const restore of this._signalHandlers ?? []) restore();
  }

  /** @internal */
  async processSignalQueue(this: SignalsHost): Promise<void> {
    let signal: Signal | undefined;
    while ((signal = this.signalQueue().shift())) {
      await this.handleSignal(signal);
    }
  }

  /** @internal */
  async handleSignal(this: SignalsHost, signal: Signal): Promise<void> {
    switch (signal) {
      case "TERM":
      case "INT":
        await this.stop();
        await this.terminateGracefully();
        break;
      case "QUIT":
        await this.stop();
        await this.terminateImmediately();
        break;
      default:
        SolidQueue.instrument("unhandled_signal_error", { signal: signal });
    }
  }

  /** @internal */
  signalProcesses(this: SignalsHost, pids: string[], signal: Signal): void {
    for (const pid of pids) {
      this.signalProcess(pid, signal);
    }
  }

  /**
   * @internal
   * @missingRailsArgs kill — PERMANENT
   */
  signalProcess(this: SignalsHost, pid: string, signal: Signal): void {
    const supervisee = this.forks[pid];
    if (supervisee == null) return;

    if (signal === "QUIT") supervisee._thread?.kill();
    else void supervisee.stop();
  }

  /** @internal */
  signalQueue(this: SignalsHost): Signal[] {
    return (this._signalQueue ??= []);
  }
}
extend(Signals, Concern);
(
  Signals as unknown as {
    included(
      base: null,
      block: (this: { beforeBoot(name: string): void; afterShutdown(name: string): void }) => void,
    ): void;
  }
).included(null, function () {
  this.beforeBoot(":registerSignalHandlers");
  this.afterShutdown(":restoreDefaultSignalHandlers");
});
