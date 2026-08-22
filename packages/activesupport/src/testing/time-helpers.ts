/**
 * Mirrors: active_support/testing/time_helpers.rb
 */
import { Date, DateTime, Rational, Temporal, Time } from "@blazetrails/date";

import { Duration } from "../duration.js";
import { clock, currentTimeInstant } from "../time-travel.js";
import { zone as timeZone } from "../time-zone-config.js";
import { midnight } from "../core-ext/date/calculations.js";
import { change } from "../time-ext.js";
import { isEmpty } from "../ruby-empty.js";

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
    return !isEmpty(this.stubs);
  }

  /** Restores the original object.method described by the Stub */
  private unstubObject(stub: Stub): void {
    (stub.object as Record<string, unknown>)[stub.methodName] = stub.originalMethod;
  }
}

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
export function travel(
  duration: Duration | number,
  { withUsec = false }: { withUsec?: boolean } = {},
  block?: () => void,
): void {
  const ms = duration instanceof Duration ? duration.inSeconds() * 1000 : duration;
  travelTo(new globalThis.Date(currentTime().getTime() + ms), { withUsec }, block);
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
  dateOrTime: Temporal.PlainDate | globalThis.Date | Temporal.Instant | Time | string,
  { withUsec = false }: { withUsec?: boolean } = {},
  block?: () => void,
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

  let now: Time;
  if (dateOrTime instanceof Temporal.PlainDate) {
    now = midnight(dateOrTime).toTime();
  } else if (typeof dateOrTime === "string") {
    // Without a `Time.zone` set there is no zone to parse through.
    const zone = timeZone();
    now = zone
      ? zone.parse(dateOrTime)!.toTime()
      : Time.at(new Rational(Temporal.Instant.from(dateOrTime).epochNanoseconds, 1_000_000_000n));
  } else {
    // `now.to_time unless now.is_a?(Time)` — a JS `Date` and a
    // `Temporal.Instant` are both the instant a Ruby `to_time` seats.
    now =
      dateOrTime instanceof Time
        ? dateOrTime
        : Time.at(
            new Rational(
              dateOrTime instanceof globalThis.Date
                ? BigInt(dateOrTime.getTime()) * 1_000_000n
                : dateOrTime.epochNanoseconds,
              1_000_000_000n,
            ),
          );
  }

  if (!withUsec) now = change(now, { usec: 0 });

  // `now` must be in local system timezone, because `Time.at(now)`
  // and `now.to_date` (see stubs below) will use `now`'s timezone too!
  now = now.getlocal();

  const stubs = simpleStubs();
  const stubbedTime = stubs.stubbing(Time, "now") ? Time.now() : undefined;
  stubs.stubObject(Time, "now", () => Time.at(now));

  stubs.stubObject(Time, "new", (...args: unknown[]) => {
    if (isEmpty(args)) {
      return Time.at(now);
    } else {
      const stub = stubs.stubbing(Time, "new")!;
      return (stub.originalMethod as (...a: unknown[]) => Time).apply(Time, args);
    }
  });

  stubs.stubObject(Date, "today", () => Date.jd(new Date(now.toDate()).jd));
  stubs.stubObject(DateTime, "now", () =>
    DateTime.jd(
      new Date(now.toDate()).jd,
      now.hour,
      now.min,
      now.sec,
      new Rational(now.utcOffset, 86400),
    ),
  );

  // Ruby has no fifth receiver: production code reads the clock through
  // `currentTimeInstant()` because `Time.now()` costs ~70x a bare
  // `Temporal.Now.instant()` and sits on every `TimeWithZone` construction.
  stubs.stubObject(clock, "now", () => now.toTime().toInstant());

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
  { withUsec = false }: { withUsec?: boolean } = {},
  block?: () => void,
): void {
  travelTo(currentTime(), { withUsec }, block);
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
 * `Time.now`; the trails clock method is `time-travel.ts`'s `clock.now`.
 */
function currentTime(): globalThis.Date {
  return new globalThis.Date(clock.now().epochMilliseconds);
}
