import { Date, DateTime, Temporal, Time } from "@blazetrails/date";
import { Rational, RuntimeError } from "@blazetrails/ruby-compat";

import { Duration } from "../duration.js";
import { clock, currentTimeInstant } from "../time-travel.js";
import { zone as timeZone } from "../time-zone-config.js";
import { midnight } from "../core-ext/date/calculations.js";
import { change } from "../time-ext.js";
import { isEmpty } from "@blazetrails/ruby-compat";

class Stub {
  constructor(
    readonly object: object,
    readonly methodName: string,
    readonly originalMethod: unknown,
  ) {}
}

export class SimpleStubs {
  private stubs: Map<object, Map<string, Stub>>;

  constructor() {
    this.stubs = new Map();
  }

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

  unstubAllBang(): void {
    for (const objectStubs of this.stubs.values()) {
      for (const stub of objectStubs.values()) {
        this.unstubObject(stub);
      }
    }
    this.stubs.clear();
  }

  stubbing(object: object, methodName: string): Stub | undefined {
    return this.stubs.get(object)?.get(methodName);
  }

  isStubbed(): boolean {
    return !isEmpty(this.stubs);
  }

  private unstubObject(stub: Stub): void {
    (stub.object as Record<string, unknown>)[stub.methodName] = stub.originalMethod;
  }
}

let _simpleStubs: SimpleStubs | undefined;
let _inBlock = false;

export function afterTeardown(): void {
  travelBack();
}

export function travel(
  duration: Duration | number,
  { withUsec = false }: { withUsec?: boolean } = {},
  block?: () => void,
): void {
  const ms = duration instanceof Duration ? duration.inSeconds() * 1000 : duration;
  travelTo(new globalThis.Date(currentTime().getTime() + ms), { withUsec }, block);
}

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
    const zone = timeZone();
    now = zone
      ? zone.parse(dateOrTime)!.toTime()
      : Time.at(new Rational(Temporal.Instant.from(dateOrTime).epochNanoseconds, 1_000_000_000n));
  } else {
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

export function travelBack(block?: () => void): void {
  const stubbedTime = block && simpleStubs().isStubbed() ? currentTimeInstant() : undefined;

  try {
    simpleStubs().unstubAllBang();
    if (block) block();
  } finally {
    if (stubbedTime) travelTo(stubbedTime);
  }
}

export function unfreezeTime(block?: () => void): void {
  travelBack(block);
}

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

function currentTime(): globalThis.Date {
  return new globalThis.Date(clock.now().epochMilliseconds);
}
