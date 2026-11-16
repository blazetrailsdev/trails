import {
  equals,
  greaterThan,
  greaterThanOrEqual,
  lessThan,
  lessThanOrEqual,
  type Comparable,
} from "@blazetrails/ruby-compat";

export class LateTime implements Comparable {
  static readonly instance = new LateTime();

  private constructor() {}

  // eslint-disable-next-line unused-imports/no-unused-vars
  compareTo(other: unknown): number {
    return 1;
  }

  toString(): string {
    return "<LATE TIME>";
  }

  lessThan = lessThan;
  lessThanOrEqual = lessThanOrEqual;
  greaterThan = greaterThan;
  greaterThanOrEqual = greaterThanOrEqual;
  equals = equals;
}

export const LATE = LateTime.instance;
