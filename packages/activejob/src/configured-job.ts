import type { Base } from "./base.js";
import type { Time } from "@blazetrails/date";
import type { TimeWithZone, Duration } from "@blazetrails/activesupport";

export class ConfiguredJob {
  declare _options: Record<string, unknown>;
  declare _jobClass: typeof Base;

  static toString(): string {
    return "ActiveJob::ConfiguredJob";
  }

  constructor(
    jobClass: typeof Base,
    options:
      | { waitUntil: Time | TimeWithZone }
      | { wait: Duration }
      | { queue: string }
      | { priority: number }
      | { waitUntil: number | Time } = {},
  ) {
    this._options = options;
    this._jobClass = jobClass;
  }

  async performNow(...args: unknown[]) {
    return await new this._jobClass(...(args as ConstructorParameters<typeof this._jobClass>))
      .set(this._options)
      .performNow();
  }

  async performLater(...args: (string | number | { keyword: boolean })[]) {
    return new this._jobClass(...(args as ConstructorParameters<typeof this._jobClass>)).enqueue(
      this._options,
    );
  }

  async performAllLater(multiArgs: unknown) {
    return await this._jobClass.performAllLater(multiArgs, { options: this._options });
  }
}
