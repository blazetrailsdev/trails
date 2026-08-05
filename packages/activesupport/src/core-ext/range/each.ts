import type { Range } from "../../range-ext.js";
import { TimeWithZone } from "../../time-with-zone.js";

/**
 * `ActiveSupport::EachTimeWithZone`
 * (core_ext/range/each.rb:6), which Ruby `prepend`s onto `Range`.
 *
 * JS has no `Range` class to reopen — trails carries the begin/end/exclusive
 * triple as data (`range-ext.ts`) — so the receiver is the first parameter and
 * `super` is `enumerate`, the core `Range#each` / `Range#step` these two guard.
 * Ruby yields to a block; the TS analogue is a generator.
 */

/**
 * Ruby's `super` at each.rb:9,14 — core `Range#each` / `Range#step`, which JS
 * has no `Range` class to inherit from. Reached only through the two guarded
 * entry points below, which have already raised on a beginless range.
 */
function* enumerate(range: Range<number | TimeWithZone>, n: number): Generator<number> {
  let current = range.begin as number;
  while (true) {
    if (range.end !== null) {
      const end = range.end as number;
      if (range.excludeEnd ? current >= end : current > end) break;
    }
    yield current;
    current += n;
  }
}

export function* each(range: Range<number | TimeWithZone>): Generator<number> {
  ensureIterationAllowed(range);
  yield* enumerate(range, 1);
}

export function* step(range: Range<number | TimeWithZone>, n: number = 1): Generator<number> {
  ensureIterationAllowed(range);
  yield* enumerate(range, n);
}

/**
 * Ruby's core `Range#first`, which `ensureIterationAllowed` calls for its
 * receiver's class — and which raises before that check on a beginless range.
 */
function first(range: Range<number | TimeWithZone>): number | TimeWithZone {
  if (range.begin === null) {
    // eslint-disable-next-line blazetrails/rails-error-parity
    throw new RangeError("cannot get the first element of beginless range");
  }
  return range.begin;
}

/**
 * @internal Rails-private helper (each.rb:18). `first.class` is spelled out
 * because the guard fires only for `TimeWithZone`, whose Ruby name is not
 * recoverable from the TS class.
 */
function ensureIterationAllowed(range: Range<number | TimeWithZone>): void {
  if (first(range) instanceof TimeWithZone) {
    // eslint-disable-next-line blazetrails/rails-error-parity
    throw new TypeError("can't iterate from ActiveSupport::TimeWithZone");
  }
}
