import { File, Process, TopLevel, constSet } from "@blazetrails/ruby-compat";
import { Worker } from "../../lib/worker.js";

export class StalledWorker extends Worker {
  /** @internal */
  private readonly startupLog: string;
  /** @internal */
  private readonly startupDelay: number;

  constructor({
    startupLog,
    startupDelay,
    ...options
  }: {
    startupLog: string;
    startupDelay: number;
    [key: string]: unknown;
  }) {
    super(options);
    this.startupLog = startupLog;
    this.startupDelay = startupDelay;
  }

  /** @internal */
  async register(): Promise<void> {
    await File.writeAsync(this.startupLog, `${Process.pid}\n`, { mode: "a" });
    await new Promise((resolve) => setTimeout(resolve, this.startupDelay * 1000));
    await (Worker.prototype as unknown as { register(): Promise<void> }).register.call(this);
  }
}
constSet(TopLevel, "StalledWorker", StalledWorker);
