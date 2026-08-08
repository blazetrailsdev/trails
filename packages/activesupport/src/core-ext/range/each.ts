import { prepend } from "../../prepend.js";
import { Range } from "../../range-ext.js";
import { TimeWithZone } from "../../time-with-zone.js";

/**
 * `ActiveSupport::EachTimeWithZone`
 * (core_ext/range/each.rb:6), which Ruby `prepend`s onto `Range`. `prepend()`
 * is the trails idiom for `Module#prepend`, so `super` — core `Range#each` /
 * `Range#step` — arrives as the wrapper's first argument. Ruby yields to a
 * block; the TS analogue is a generator.
 */

type SuperEach<T> = (...args: unknown[]) => unknown;

export function* each<T>(this: Range<T>, super_: SuperEach<T>): Generator<T> {
  ensureIterationAllowed.call(this);
  yield* super_.call(this) as Generator<T>;
}

export function* step<T>(this: Range<T>, super_: SuperEach<T>, n: number = 1): Generator<T> {
  ensureIterationAllowed.call(this);
  yield* super_.call(this, n) as Generator<T>;
}

/**
 * @internal Rails-private helper (each.rb:18). `first.class` is spelled out
 * because the guard fires only for `TimeWithZone`, whose Ruby name is not
 * recoverable from the TS class.
 */
function ensureIterationAllowed<T>(this: Range<T>): void {
  if (this.first() instanceof TimeWithZone) {
    // eslint-disable-next-line blazetrails/rails-error-parity
    throw new TypeError("can't iterate from ActiveSupport::TimeWithZone");
  }
}

prepend(Range.prototype, { each, step });
