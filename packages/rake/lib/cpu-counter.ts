import { StandardError } from "@blazetrails/ruby-compat/standard-error";
import { getOs } from "@blazetrails/ruby-compat/os-adapter";

export class CpuCounter {
  static count(): number {
    return new this().countWithDefault();
  }

  countWithDefault(defaultValue = 4): number {
    try {
      return this.count() ?? defaultValue;
    } catch (error) {
      if (!(error instanceof StandardError)) throw error;
      return defaultValue;
    }
  }

  count(): number {
    return getOs().availableParallelism();
  }
}
