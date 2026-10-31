import { StandardError, getOs } from "@blazetrails/ruby-compat";

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

  count(): number | null {
    return getOs().availableParallelism();
  }
}
