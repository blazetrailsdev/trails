import { rbModConstSet } from "@blazetrails/ruby-compat";
import { ActiveJob } from "./namespaces.js";

interface ConfiguredJobClass {
  new (...args: unknown[]): {
    set(options: Record<string, unknown>): { performNow(): Promise<unknown> };
    enqueue(options: Record<string, unknown>): Promise<unknown>;
  };
}

export class ConfiguredJob {
  static toString(): string {
    return "ActiveJob::ConfiguredJob";
  }

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

  async performAllLater(multiArgs: unknown): Promise<unknown> {
    return await (
      this._jobClass as unknown as {
        performAllLater(multiArgs: unknown, options: { options: unknown }): Promise<unknown>;
      }
    ).performAllLater(multiArgs, { options: this._options });
  }
}
rbModConstSet(ActiveJob, "ConfiguredJob", ConfiguredJob);
