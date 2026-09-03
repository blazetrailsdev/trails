import { prepend } from "@blazetrails/ruby-compat";
import { Range } from "@blazetrails/ruby-compat/range";
import { TimeWithZone } from "../../time-with-zone.js";

type SuperEach<T> = (...args: unknown[]) => unknown;

export function* each<T>(this: Range<T>, super_: SuperEach<T>): Generator<T> {
  ensureIterationAllowed.call(this);
  yield* super_.call(this) as Generator<T>;
}

export function* step<T>(this: Range<T>, super_: SuperEach<T>, n: number = 1): Generator<T> {
  ensureIterationAllowed.call(this);
  yield* super_.call(this, n) as Generator<T>;
}

/** @internal */
function ensureIterationAllowed<T>(this: Range<T>): void {
  if (this.first() instanceof TimeWithZone) {
    // eslint-disable-next-line blazetrails/rails-error-parity
    throw new TypeError("can't iterate from ActiveSupport::TimeWithZone");
  }
}

prepend(Range.prototype, { each, step });
