import { ActiveJob } from "./namespaces.js";

interface ConfiguredJobClass {
  new (...args: unknown[]): {
    set(options: Record<string, unknown>): { performNow(): Promise<unknown> };
    enqueue(options: Record<string, unknown>): Promise<unknown>;
  };
}

export class ConfiguredJob {
  private _options: Record<string, unknown>;
  private _jobClass: ConfiguredJobClass;

  constructor(jobClass: unknown, options: Record<string, unknown> = {}) {
    this._options = options;
    this._jobClass = jobClass as ConfiguredJobClass;
  }

  async performNow(...args: unknown[]): Promise<unknown> {
    return await new this._jobClass(...args).set(this._options).performNow();
  }

  async performLater(...args: unknown[]): Promise<unknown> {
    return await new this._jobClass(...args).enqueue(this._options);
  }
}
ActiveJob.ConfiguredJob = ConfiguredJob;
