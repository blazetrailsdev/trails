import { ArgumentError, rbAryBsearchIndex, rbEqual } from "@blazetrails/ruby-compat";
import type { Timestamp } from "../timestamp.js";
import type { TimezoneTransition } from "../timezone-transition.js";
import { TransitionsTimezonePeriod } from "../transitions-timezone-period.js";
import { DataTimezoneInfo } from "./data-timezone-info.js";

export class TransitionsDataTimezoneInfo extends DataTimezoneInfo {
  readonly transitions: readonly TimezoneTransition[];

  constructor(identifier: string, transitions: TimezoneTransition[]) {
    super(identifier);
    if (transitions == null) throw new ArgumentError("transitions must be specified");
    if (transitions.length === 0) {
      throw new ArgumentError("transitions must not be an empty Array");
    }
    this.transitions = Object.freeze(transitions);
  }

  override periodFor(timestamp: Timestamp): TransitionsTimezonePeriod {
    if (timestamp == null) throw new ArgumentError("timestamp must be specified");
    if (timestamp.utcOffset == null) {
      throw new ArgumentError("timestamp must have a specified utc_offset");
    }

    const timestampValue = timestamp.value;

    const index = this.findMinimumTransition((t) => t.timestampValue >= timestampValue);

    let startTransition: TimezoneTransition | null;
    let endTransition: TimezoneTransition | null;
    if (index != null) {
      const transition = this.transitions[index];

      if (transition.timestampValue === timestampValue) {
        startTransition = transition;
        endTransition = this.transitions[index + 1] ?? null;
      } else {
        startTransition = index === 0 ? null : this.transitions[index - 1];
        endTransition = transition;
      }
    } else {
      startTransition = this.transitions.at(-1) ?? null;
      endTransition = null;
    }

    return new TransitionsTimezonePeriod(startTransition, endTransition);
  }

  override periodsForLocal(localTimestamp: Timestamp): TransitionsTimezonePeriod[] {
    if (localTimestamp == null) throw new ArgumentError("local_timestamp must be specified");
    if (localTimestamp.utcOffset != null) {
      throw new ArgumentError("local_timestamp must have an unspecified utc_offset");
    }

    const localTimestampValue = localTimestamp.value;
    const latestPossibleUtcValue = localTimestampValue + 86400;
    const earliestPossibleUtcValue = localTimestampValue - 86400;

    let index = this.findMinimumTransition((t) => t.timestampValue >= latestPossibleUtcValue);

    if (index == null) index = this.transitions.length;

    const result: TransitionsTimezonePeriod[] = [];

    for (let i = index; i >= 0; i--) {
      const startTransition = i > 0 ? this.transitions[i - 1] : null;
      const endTransition = this.transitions[i] ?? null;
      const offset = startTransition ? startTransition.offset : endTransition.previousOffset;
      const utcTimestampValue = localTimestampValue - offset.observedUtcOffset;

      if (
        (!startTransition || utcTimestampValue >= startTransition.timestampValue) &&
        (!endTransition || utcTimestampValue < endTransition.timestampValue)
      ) {
        result.push(new TransitionsTimezonePeriod(startTransition, endTransition));
      } else if (endTransition && endTransition.timestampValue < earliestPossibleUtcValue) {
        break;
      }
    }

    return result.reverse();
  }

  override transitionsUpTo(
    toTimestamp: Timestamp,
    fromTimestamp: Timestamp | null = null,
  ): TimezoneTransition[] {
    if (toTimestamp == null) throw new ArgumentError("to_timestamp must be specified");
    if (toTimestamp.utcOffset == null) {
      throw new ArgumentError("to_timestamp must have a specified utc_offset");
    }

    if (fromTimestamp != null) {
      if (fromTimestamp.utcOffset == null) {
        throw new ArgumentError("from_timestamp must have a specified utc_offset");
      }
      if (toTimestamp.compareTo(fromTimestamp)! <= 0) {
        throw new ArgumentError("to_timestamp must be greater than from_timestamp");
      }
    }

    let fromIndex: number | null;
    if (fromTimestamp != null) {
      fromIndex = this.findMinimumTransition((t) =>
        this.isTransitionOnOrAfterTimestamp(t, fromTimestamp),
      );
      if (fromIndex == null) return [];
    } else {
      fromIndex = 0;
    }

    let toIndex = this.findMinimumTransition((t) =>
      this.isTransitionOnOrAfterTimestamp(t, toTimestamp),
    );

    if (toIndex != null) {
      if (toIndex < 1) return [];
      toIndex -= 1;
    } else {
      toIndex = -1;
    }

    return this.transitions.slice(
      fromIndex,
      toIndex < 0 ? this.transitions.length + toIndex + 1 : toIndex + 1,
    );
  }

  /** @internal */
  private findMinimumTransition(block: (t: TimezoneTransition) => boolean): number | null {
    return rbAryBsearchIndex(this.transitions, block);
  }

  /** @internal */
  private isTransitionOnOrAfterTimestamp(
    transition: TimezoneTransition,
    timestamp: Timestamp,
  ): boolean {
    const transitionTimestampValue = transition.timestampValue;
    const timestampValue = timestamp.value;
    return (
      transitionTimestampValue > timestampValue ||
      (transitionTimestampValue === timestampValue && rbEqual(timestamp.subSecond, 0))
    );
  }
}
