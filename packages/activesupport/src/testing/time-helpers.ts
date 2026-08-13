/**
 * Mirrors: active_support/testing/time_helpers.rb
 */
import { Temporal } from "@blazetrails/date";

import { Duration } from "../duration.js";
import { currentTimeInstant, setFrozenInstant } from "../time-travel.js";

/** Mirrors Ruby's `RuntimeError` — what a bare `raise "message"` raises. */
class RuntimeError extends Error {
  override name = "RuntimeError";
}

/** Mirrors the `Stub` Struct (time_helpers.rb:10). */
class Stub {
  constructor(
    readonly object: object,
    readonly methodName: string,
    readonly originalMethod: unknown,
  ) {}
}

/**
 * Manages stubs for TimeHelpers.
 *
 * Ruby renames the original singleton method aside and defines a new one; TS
 * has no `alias_method`, so `originalMethod` holds the replaced function value
 * itself and `unstubObject` writes it back.
 */
export class SimpleStubs {
  private stubs: Map<object, Map<string, Stub>>;

  constructor() {
    this.stubs = new Map();
  }

  /**
   * Stubs object.method_name with the given block
   * If the method is already stubbed, remove that stub
   * so that removing this stub will restore the original implementation.
   */
  stubObject(object: object, methodName: string, block: (...args: unknown[]) => unknown): void {
    const stub = this.stubbing(object, methodName);
    if (stub) {
      this.unstubObject(stub);
    }

    let objectStubs = this.stubs.get(object);
    if (!objectStubs) {
      objectStubs = new Map();
      this.stubs.set(object, objectStubs);
    }
    objectStubs.set(
      methodName,
      new Stub(object, methodName, (object as Record<string, unknown>)[methodName]),
    );

    (object as Record<string, unknown>)[methodName] = block;
  }

  /** Remove all object-method stubs held by this instance */
  unstubAllBang(): void {
    for (const objectStubs of this.stubs.values()) {
      for (const stub of objectStubs.values()) {
        this.unstubObject(stub);
      }
    }
    this.stubs.clear();
  }

  /**
   * Returns the Stub for object#method_name
   * (nil if it is not stubbed)
   */
  stubbing(object: object, methodName: string): Stub | undefined {
    return this.stubs.get(object)?.get(methodName);
  }

  /** Returns true if any stubs are set, false if there are none */
  isStubbed(): boolean {
    return this.stubs.size !== 0;
  }

  /** Restores the original object.method described by the Stub */
  private unstubObject(stub: Stub): void {
    (stub.object as Record<string, unknown>)[stub.methodName] = stub.originalMethod;
  }
}

/**
 * The seam the trails clock is stubbed through. Rails redefines `Time.now`,
 * `Time.new`, `Date.today` and `DateTime.now` as singleton methods; trails
 * production code reads the clock through `time-travel.ts`'s module state
 * (`currentTimeInstant`), which no singleton-method stub can reach, so the one
 * stubbed method is this holder's `now` and `stubObject`/`unstubAllBang` push
 * its value into that module state.
 */
const clock = {
  now(): Temporal.Instant {
    return currentTimeInstant();
  },
};

let _simpleStubs: SimpleStubs | undefined;
let _inBlock = false;

/**
 * Contains helpers that help you test passage of time.
 */

/**
 * Removes the stubs added by `travel`, `travel_to` and `freeze_time` at the end
 * of the test. Rails chains up to `super`; a vitest suite calls this from its
 * own `afterEach`.
 */
export function afterTeardown(): void {
  travelBack();
}

/**
 * Changes current time to the time in the future or in the past by a given time
 * difference by stubbing the clock. The stubs are automatically removed at the
 * end of the test.
 *
 *   travel 1.day
 *
 * This method also accepts a block, which will return the current time back to
 * its original state at the end of the block.
 *
 * Ruby's `duration` is a Duration; a plain number of milliseconds is accepted
 * too, because that is what trails' own callers had before this port.
 */
export function travel(duration: Duration | number, block?: () => void): void {
  const ms = duration instanceof Duration ? duration.inSeconds() * 1000 : duration;
  travelTo(new Date(currentTime().getTime() + ms), block);
}

/**
 * Changes current time to the given time by stubbing the clock. The stubs are
 * automatically removed at the end of the test.
 *
 *   travel_to Time.zone.local(2004, 11, 24, 1, 4, 44)
 *
 * Note that the usec for the time passed will be set to 0 to prevent rounding
 * errors with external services, like MySQL (which will round instead of floor,
 * leading to off-by-one-second errors), unless the `withUsec` argument is set
 * to `true`.
 */
export function travelTo(
  dateOrTime: Date | Temporal.Instant | string,
  block?: () => void,
  { withUsec = false }: { withUsec?: boolean } = {},
): void {
  if (block && inBlock()) {
    const travelToNestedBlockCall = `
      Calling \`travel_to\` with a block, when we have previously already made a call to \`travel_to\`, can lead to confusing time stubbing.

      Instead of:

         travel_to 2.days.from_now do
           # 2 days from today
           travel_to 3.days.from_now do
             # 5 days from today
           end
         end

      preferred way to achieve above is:

         travel 2.days do
           # 2 days from today
         end

         travel 5.days do
           # 5 days from today
         end

`;
    throw new RuntimeError(travelToNestedBlockCall);
  }

  let now: Temporal.Instant;
  if (typeof dateOrTime === "string") {
    now = Temporal.Instant.from(dateOrTime);
  } else if (dateOrTime instanceof Date) {
    now = Temporal.Instant.fromEpochMilliseconds(dateOrTime.getTime());
  } else {
    now = dateOrTime;
  }

  if (!withUsec) {
    now = Temporal.Instant.fromEpochMilliseconds(Math.floor(now.epochMilliseconds / 1000) * 1000);
  }

  const stubs = simpleStubs();
  const stubbedTime = stubs.stubbing(clock, "now") ? currentTimeInstant() : undefined;
  stubs.stubObject(clock, "now", () => now);
  setFrozenInstant(now);

  if (block) {
    try {
      setInBlock(true);
      block();
    } finally {
      if (stubbedTime) {
        travelTo(stubbedTime);
      } else {
        travelBack();
      }
      setInBlock(false);
    }
  }
}

/**
 * Returns the current time back to its original state, by removing the stubs
 * added by `travel`, `travel_to`, and `freeze_time`.
 *
 * This method also accepts a block, which brings the stubs back at the end of
 * the block.
 */
export function travelBack(block?: () => void): void {
  const stubbedTime = block && simpleStubs().isStubbed() ? currentTimeInstant() : undefined;

  try {
    simpleStubs().unstubAllBang();
    setFrozenInstant(null);
    if (block) block();
  } finally {
    if (stubbedTime) travelTo(stubbedTime);
  }
}

/** Alias of {@link travelBack}. */
export function unfreezeTime(block?: () => void): void {
  travelBack(block);
}

/**
 * Calls `travelTo` with the current time. Forwards the optional `withUsec`
 * argument.
 */
export function freezeTime(
  block?: () => void,
  { withUsec = false }: { withUsec?: boolean } = {},
): void {
  travelTo(currentTime(), block, { withUsec });
}

/** @internal */
function simpleStubs(): SimpleStubs {
  if (!_simpleStubs) _simpleStubs = new SimpleStubs();
  return _simpleStubs;
}

/** @internal */
function inBlock(): boolean {
  return _inBlock;
}

/** @internal */
function setInBlock(value: boolean): void {
  _inBlock = value;
}

/**
 * Returns the current time, honouring any active travel. Rails reads
 * `Time.now`; the trails clock seam is the module-level `clock` holder above.
 */
function currentTime(): Date {
  return new Date(clock.now().epochMilliseconds);
}
