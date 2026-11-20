import { Date, DateTime, Temporal, Time } from "@blazetrails/date";
import { Rational, rational, rbCallSuper, rbEnsure, RuntimeError } from "@blazetrails/ruby-compat";

import { Duration } from "../duration.js";
import { TimeWithZone } from "../time-with-zone.js";
import { clock, currentTimeInstant } from "../time-travel.js";
import { zone as timeZone } from "../time-zone-config.js";
import { midnight } from "../core-ext/date/calculations.js";
import { change } from "../time-ext.js";
import { plusWithDuration } from "../core-ext/time/calculations.js";
import { toTime } from "../core-ext/date-time/compatibility.js";
import { isEmpty, Struct } from "@blazetrails/ruby-compat";

const Stub = Struct.new("object", "methodName", "originalMethod");
type Stub = InstanceType<typeof Stub>;

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

  /** @missingRailsCall each_value — PERMANENT */
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
    (stub.object as Record<string, unknown>)[stub.methodName as string] = stub.originalMethod;
  }
}

interface TimeHelpersHost {
  _simpleStubs?: SimpleStubs;
  _inBlock?: boolean;
}

/** @noRailsEquivalent CONVERGEABLE free-time-helper-calls-travel-on-the-test-case */
const _freeReceiver: TimeHelpersHost = {};

/** @inventedArm if — CONVERGEABLE free-time-helper-calls-travel-on-the-test-case */
export function afterTeardown(this: object): unknown {
  travelBack.call(this);
  if (this !== _freeReceiver) travelBack.call(_freeReceiver);
  return rbCallSuper(this, afterTeardown);
}

export function travel(
  this: object | void,
  duration: Duration | number,
  { withUsec = false }: { withUsec?: boolean } = {},
  block?: () => unknown,
): unknown {
  return travelTo.call(this, plusWithDuration.call(Time.now(), duration), { withUsec }, block);
}

export function travelTo(
  this: object | void,
  dateOrTime:
    | Temporal.PlainDate
    | DateTime
    | Temporal.PlainDateTime
    | Temporal.ZonedDateTime
    | globalThis.Date
    | Temporal.Instant
    | Time
    | TimeWithZone
    | string,
  { withUsec = false }: { withUsec?: boolean } = {},
  block?: () => unknown,
): unknown {
  if (block && inBlock.call(this)) {
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

  let now: typeof dateOrTime;
  if (dateOrTime instanceof Temporal.PlainDate) {
    now = midnight(dateOrTime).toTime();
  } else if (typeof dateOrTime === "string") {
    const zone = timeZone();
    now = zone
      ? zone.parse(dateOrTime)!.toTime()
      : Time.at(new Rational(Temporal.Instant.from(dateOrTime).epochNanoseconds, 1_000_000_000n));
  } else {
    now = dateOrTime;
    if (now instanceof DateTime) now = toTime(now);
    else if (now instanceof Temporal.PlainDateTime || now instanceof Temporal.ZonedDateTime)
      now = toTime(new DateTime(now));
    else if (!(now instanceof Time))
      now = Time.at(
        new Rational(
          now instanceof globalThis.Date
            ? BigInt(now.getTime()) * 1_000_000n
            : (now as Temporal.Instant).epochNanoseconds,
          1_000_000_000n,
        ),
      );
  }

  if (!withUsec) now = change(now, { usec: 0 });

  now = now.getlocal();

  const stubs = simpleStubs.call(this);
  const stubbedTime = stubs.stubbing(Time, "now") ? Time.now() : undefined;
  stubs.stubObject(Time, "now", function (this: typeof Time) {
    return this.at(now);
  });

  stubs.stubObject(Time, "new", (...args: unknown[]) => {
    if (args.length === 0) {
      return Time.at(now);
    } else {
      const stub = stubs.stubbing(Time, "new")!;
      return (stub.originalMethod as (...a: unknown[]) => Time).apply(Time, args);
    }
  });

  stubs.stubObject(Date, "today", function (this: typeof Date) {
    return this.jd(new Date(now.toDate()).jd);
  });
  stubs.stubObject(DateTime, "now", function (this: typeof DateTime) {
    return this.jd(
      new Date(now.toDate()).jd,
      now.hour,
      now.min,
      now.sec,
      rational(now.utcOffset, 86400),
    );
  });

  stubs.stubObject(clock, "now", () => now.toZonedDateTime().toInstant());

  if (block) {
    return rbEnsure(
      () => {
        setInBlock.call(this, true);
        return block();
      },
      () => {
        if (stubbedTime) {
          travelTo.call(this, stubbedTime);
        } else {
          travelBack.call(this);
        }
        setInBlock.call(this, false);
      },
    );
  }
}

export function travelBack(this: object | void, block?: () => void): void {
  const stubbedTime =
    block && simpleStubs.call(this).isStubbed() ? currentTimeInstant() : undefined;

  try {
    simpleStubs.call(this).unstubAllBang();
    if (block) block();
  } finally {
    if (stubbedTime) travelTo.call(this, stubbedTime);
  }
}

export { travelBack as unfreezeTime };

export function freezeTime(
  this: object | void,
  { withUsec = false }: { withUsec?: boolean } = {},
  block?: () => void,
): void {
  travelTo.call(this, currentTime(), { withUsec }, block);
}

/** @internal */
function simpleStubs(this: object | void): SimpleStubs {
  return (((this ?? _freeReceiver) as TimeHelpersHost)._simpleStubs ??= new SimpleStubs());
}

/** @internal */
function inBlock(this: object | void): boolean {
  return ((this ?? _freeReceiver) as TimeHelpersHost)._inBlock ?? false;
}

/** @internal */
function setInBlock(this: object | void, value: boolean): void {
  ((this ?? _freeReceiver) as TimeHelpersHost)._inBlock = value;
}

function currentTime(): globalThis.Date {
  return new globalThis.Date(clock.now().epochMilliseconds);
}

export const TimeHelpers = {
  afterTeardown,
  travel,
  travelTo,
  travelBack,
  unfreezeTime: travelBack,
  freezeTime,
};
