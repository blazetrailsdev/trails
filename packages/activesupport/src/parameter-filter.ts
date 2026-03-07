/**
 * ParameterFilter — filters sensitive parameters from hashes.
 * Mirrors Rails ActiveSupport::ParameterFilter.
 */

type FilterProc = (key: string, value: unknown) => unknown;
type Filter = string | RegExp | FilterProc;

export interface ParameterFilterOptions {
  mask?: string;
}

export class ParameterFilter {
  private readonly filters: Filter[];
  private readonly mask: string;

  constructor(
    filters: Filter[] = [],
    { mask = "[FILTERED]" }: ParameterFilterOptions = {}
  ) {
    this.filters = filters;
    this.mask = mask;
  }

  /**
   * filter — applies filters to the given hash, masking sensitive values.
   */
  filter(params: Record<string, unknown>): Record<string, unknown> {
    return this.filterValue(params) as Record<string, unknown>;
  }

  /**
   * filterParam — filters a single key/value pair.
   * Returns the masked value if the key matches, otherwise returns value as-is.
   */
  filterParam(key: string, value: unknown): unknown {
    return this.processKeyValue(String(key), value);
  }

  private filterValue(value: unknown): unknown {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        result[String(k)] = this.processKeyValue(String(k), v);
      }
      return result;
    }
    if (Array.isArray(value)) {
      return value.map((v) => this.filterValue(v));
    }
    return value;
  }

  private processKeyValue(key: string, value: unknown): unknown {
    for (const filter of this.filters) {
      if (typeof filter === "function") {
        const result = filter(key, value);
        if (result !== value) return result;
        continue;
      }

      if (this.matchesFilter(filter, key)) {
        return this.mask;
      }
    }

    // Recurse into nested objects/arrays
    return this.filterValue(value);
  }

  private matchesFilter(filter: string | RegExp, key: string): boolean {
    if (typeof filter === "string") {
      return key === filter || key.toLowerCase().includes(filter.toLowerCase());
    }
    return filter.test(key);
  }
}
