import { prepend, rbCallSuper } from "@blazetrails/ruby-compat";
import { Range } from "@blazetrails/ruby-compat/range";
import { TimeWithZone } from "../../time-with-zone.js";

export function* each<T>(this: Range<T>, block?: (value: T) => unknown): Generator<T> {
  ensureIterationAllowed.call(this);
  yield* rbCallSuper(this, each, block) as Generator<T>;
}

export function* step<T>(
  this: Range<T>,
  n: number = 1,
  block?: (value: T) => unknown,
): Generator<T> {
  ensureIterationAllowed.call(this);
  yield* rbCallSuper(this, step, n, block) as Generator<T>;
}

/** @internal */
function ensureIterationAllowed<T>(this: Range<T>): void {
  if (this.first() instanceof TimeWithZone) {
    // eslint-disable-next-line blazetrails/rails-error-parity
    throw new TypeError("can't iterate from ActiveSupport::TimeWithZone");
  }
}

prepend(Range, { each, step });
