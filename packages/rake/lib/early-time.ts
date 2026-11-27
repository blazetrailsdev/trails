import {
  equals,
  greaterThan,
  greaterThanOrEqual,
  lessThan,
  lessThanOrEqual,
  type Comparable,
} from "@blazetrails/ruby-compat/comparable";

export class EarlyTime implements Comparable {
  static readonly instance = new EarlyTime();

  private constructor() {}

  // eslint-disable-next-line unused-imports/no-unused-vars
  compareTo(other: unknown): number {
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
