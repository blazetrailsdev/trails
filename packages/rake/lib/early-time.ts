import {
  equals,
  greaterThan,
  greaterThanOrEqual,
  lessThan,
  lessThanOrEqual,
  type Comparable,
} from "@blazetrails/ruby-compat";

export class EarlyTime implements Comparable {
  static readonly instance = new EarlyTime();

  private constructor() {}

  compareTo(other: unknown): number {
    void other;
    return -1;
  }

  toString(): string {
    return "<EARLY TIME>";
  }

  lessThan = lessThan;
  lessThanOrEqual = lessThanOrEqual;
  greaterThan = greaterThan;
  greaterThanOrEqual = greaterThanOrEqual;
  equals = equals;
}

export const EARLY = EarlyTime.instance;
