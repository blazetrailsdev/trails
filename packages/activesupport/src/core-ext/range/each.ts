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
 * has no `Range` class to inherit from.
 */
function* enumerate(range: Range<number | TimeWithZone>, n: number): Generator<number> {
  // Ruby core `Range#each` on a beginless range; activesupport has no ported
  // TypeError, so this mirrors the message Ruby raises.
  // eslint-disable-next-line blazetrails/rails-error-parity
  if (range.begin === null) throw new TypeError("can't iterate from NilClass");
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
 * @internal Rails-private helper (each.rb:18).
 */
function ensureIterationAllowed(range: Range<number | TimeWithZone>): void {
  // Ruby's `first` is the range's begin. The guard only fires for
  // `TimeWithZone`, so `first.class` is always that class' Ruby name.
  if (range.begin instanceof TimeWithZone) {
    // eslint-disable-next-line blazetrails/rails-error-parity
    throw new TypeError("can't iterate from ActiveSupport::TimeWithZone");
  }
}
