/**
 * Type registrations for ActiveSupport::MessagePack.
 *
 * Mirrors: ActiveSupport::MessagePack::Extensions
 *
 * `install` registers the extension types (the remaining Ruby-native types are
 * tracked as follow-up). `installUnregisteredTypeError`
 * and `installUnregisteredTypeFallback` register the catch-all type 127 used by
 * the plain serializer (raise) and the cache serializer (object fallback via
 * `toMsgpackExt`/`fromMsgpackExt` or `asJson`/`jsonCreate`).
 *
 * Ruby's `Object.const_get` class lookup becomes an explicit name→constructor
 * registry: object-fallback classes opt in via `registerObjectClass`.
 */

import { MessagePackError } from "./factory.js";
import type { Factory, Packer, Unpacker } from "./factory.js";
import { HashWithIndifferentAccess } from "../hash-with-indifferent-access.js";
import { Temporal } from "../temporal.js";
import { TimeWithZone } from "../time-with-zone.js";
import { TimeZone } from "../values/time-zone.js";

export interface Rational {
  numerator: number;
  denominator: number;
}

const JD_UNIX_EPOCH = 2440588;

const UNIX_EPOCH_DATE = Temporal.PlainDate.from("1970-01-01");

const NANOS_PER_SECOND = 1_000_000_000;

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function rational(numerator: number, denominator: number): Rational {
  if (numerator === 0) return { numerator: 0, denominator: 1 };
  const divisor = gcd(Math.abs(numerator), Math.abs(denominator));
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

function julianDay(date: Temporal.PlainDate): number {
  return JD_UNIX_EPOCH + date.since(UNIX_EPOCH_DATE, { largestUnit: "day" }).days;
}

function dateFromJulianDay(jd: number): Temporal.PlainDate {
  return UNIX_EPOCH_DATE.add({ days: jd - JD_UNIX_EPOCH });
}

function nanosecondOfSecond(time: {
  millisecond: number;
  microsecond: number;
  nanosecond: number;
}): number {
  return time.millisecond * 1_000_000 + time.microsecond * 1_000 + time.nanosecond;
}

/**
 * Encodes a bigint as MessagePack::Bigint's `CL>*` ext payload: a sign byte (0
 * positive / 1 negative) followed by 32-bit big-endian chunks, least-significant
 * chunk first. Byte-identical to `MessagePack::Bigint.to_msgpack_ext`.
 */
function bigIntToMsgpackExt(value: bigint): Buffer {
  let n = value;
  const bytes: number[] = [n < 0n ? 1 : 0];
  if (n < 0n) n = -n;
  while (n > 0n) {
    const chunk = Number(n & 0xffffffffn);
    bytes.push((chunk >>> 24) & 0xff, (chunk >>> 16) & 0xff, (chunk >>> 8) & 0xff, chunk & 0xff);
    n >>= 32n;
  }
  return Buffer.from(bytes);
}

function bigIntFromMsgpackExt(payload: Buffer): bigint {
  const sign = payload[0];
  let sum = 0n;
  for (let i = (payload.length - 1) / 4 - 1; i >= 0; i--) {
    const off = 1 + i * 4;
    const chunk =
      (payload[off] << 24) | (payload[off + 1] << 16) | (payload[off + 2] << 8) | payload[off + 3];
    sum = (sum << 32n) + BigInt(chunk >>> 0);
  }
  return sign === 0 ? sum : -sum;
}

export class UnserializableObjectError extends Error {}
export class MissingClassError extends Error {}

/** A constructor that participates in the cache serializer's object fallback. */
export interface ObjectClass {
  name: string;
  fromMsgpackExt?: (data: unknown) => unknown;
  jsonCreate?: (data: unknown) => unknown;
}

const objectClassRegistry = new Map<string, ObjectClass>();

/** Mirror of Ruby's implicit `Object.const_get` resolution for object fallback. */
export function registerObjectClass(klass: ObjectClass): void {
  objectClassRegistry.set(klass.name, klass);
}

const LOAD_WITH_MSGPACK_EXT = 0;
const LOAD_WITH_JSON_CREATE = 1;

function classOf(value: object): ObjectClass {
  return (value as { constructor: ObjectClass }).constructor;
}

export const Extensions = {
  install(registry: Factory): void {
    registry.registerType({
      type: 0,
      klass: "Symbol",
      recursive: false,
      match: (v) => typeof v === "symbol",
      packer: (v) => Buffer.from((v as symbol).description ?? "", "utf-8"),
      unpacker: (payload) => Symbol.for((payload as Buffer).toString("utf-8")),
    });

    // Native ints inside the 64-bit range are handled directly by the packer;
    // this ext only fires for oversized integers (Ruby Bigint), reached via the
    // `oversizedInteger` flag rather than `match`.
    registry.registerType({
      type: 1,
      klass: "Integer",
      recursive: false,
      oversizedInteger: true,
      match: () => false,
      packer: (v) => bigIntToMsgpackExt(v as bigint),
      unpacker: (payload) => bigIntFromMsgpackExt(payload as Buffer),
    });

    registry.registerType({
      type: 5,
      klass: "DateTime",
      recursive: true,
      match: (v) => v instanceof Temporal.PlainDateTime,
      packer: (v, packer) => Extensions.writeDatetime(v as Temporal.PlainDateTime, packer),
      unpacker: (unpacker) => Extensions.readDatetime(unpacker as Unpacker),
    });

    registry.registerType({
      type: 6,
      klass: "Date",
      recursive: true,
      match: (v) => v instanceof Temporal.PlainDate,
      packer: (v, packer) => Extensions.writeDate(v as Temporal.PlainDate, packer),
      unpacker: (unpacker) => Extensions.readDate(unpacker as Unpacker),
    });

    registry.registerType({
      type: 7,
      klass: "Time",
      recursive: true,
      match: (v) => v instanceof Temporal.Instant,
      packer: (v, packer) => Extensions.writeTime(v as Temporal.Instant, packer),
      unpacker: (unpacker) => Extensions.readTime(unpacker as Unpacker),
    });

    registry.registerType({
      type: 8,
      klass: "ActiveSupport::TimeWithZone",
      recursive: true,
      match: (v) => v instanceof TimeWithZone,
      packer: (v, packer) => Extensions.writeTimeWithZone(v as TimeWithZone, packer),
      unpacker: (unpacker) => Extensions.readTimeWithZone(unpacker as Unpacker),
    });

    registry.registerType({
      type: 9,
      klass: "ActiveSupport::TimeZone",
      recursive: false,
      match: (v) => v instanceof TimeZone,
      packer: (v) => Buffer.from(Extensions.dumpTimeZone(v as TimeZone), "utf-8"),
      unpacker: (payload) => Extensions.loadTimeZone((payload as Buffer).toString("utf-8")),
    });

    registry.registerType({
      type: 12,
      klass: "Set",
      recursive: true,
      match: (v) => v instanceof Set,
      packer: (v, packer) => packer.write([...(v as Set<unknown>)]),
      unpacker: (unpacker) => new Set((unpacker as Unpacker).read() as unknown[]),
    });

    registry.registerType({
      type: 17,
      klass: "ActiveSupport::HashWithIndifferentAccess",
      recursive: true,
      match: (v) => v instanceof HashWithIndifferentAccess,
      packer: (v, packer) => packer.write((v as HashWithIndifferentAccess).toHash()),
      unpacker: (unpacker) =>
        new HashWithIndifferentAccess((unpacker as Unpacker).read() as Record<string, unknown>),
    });
  },

  installUnregisteredTypeError(registry: Factory): void {
    registry.registerType({
      type: 127,
      klass: "Object",
      recursive: false,
      match: (v) => typeof v === "object" && v !== null,
      packer: (v) => Extensions.raiseUnserializable(v),
      unpacker: () => Extensions.raiseInvalidFormat(),
    });
  },

  installUnregisteredTypeFallback(registry: Factory): void {
    registry.registerType({
      type: 127,
      klass: "Object",
      recursive: true,
      match: (v) => typeof v === "object" && v !== null,
      packer: (v, packer) => Extensions.writeObject(v as object, packer),
      unpacker: (unpacker) => Extensions.readObject(unpacker as Unpacker),
    });
  },

  writeRational(value: Rational, packer: Packer): void {
    packer.write(value.numerator);
    if (value.numerator !== 0) packer.write(value.denominator);
  },

  readRational(unpacker: Unpacker): Rational {
    const numerator = unpacker.read() as number;
    return rational(numerator, numerator === 0 ? 1 : (unpacker.read() as number));
  },

  writeDatetime(datetime: Temporal.PlainDateTime, packer: Packer): void {
    packer.write(julianDay(datetime.toPlainDate()));
    packer.write(datetime.hour);
    packer.write(datetime.minute);
    packer.write(datetime.second);
    Extensions.writeRational(rational(nanosecondOfSecond(datetime), NANOS_PER_SECOND), packer);
    Extensions.writeRational(rational(0, 1), packer);
  },

  readDatetime(unpacker: Unpacker): Temporal.PlainDateTime {
    const jd = unpacker.read() as number;
    const hour = unpacker.read() as number;
    const minute = unpacker.read() as number;
    const second = unpacker.read() as number;
    const secFraction = Extensions.readRational(unpacker);
    Extensions.readRational(unpacker);
    const nanos = Math.round((secFraction.numerator / secFraction.denominator) * NANOS_PER_SECOND);
    return dateFromJulianDay(jd).toPlainDateTime({
      hour,
      minute,
      second,
      millisecond: Math.floor(nanos / 1_000_000),
      microsecond: Math.floor(nanos / 1_000) % 1_000,
      nanosecond: nanos % 1_000,
    });
  },

  writeDate(date: Temporal.PlainDate, packer: Packer): void {
    packer.write(julianDay(date));
  },

  readDate(unpacker: Unpacker): Temporal.PlainDate {
    return dateFromJulianDay(unpacker.read() as number);
  },

  writeTime(time: Temporal.Instant, packer: Packer): void {
    const nanos = time.epochNanoseconds;
    const seconds = nanos / BigInt(NANOS_PER_SECOND);
    const remainder = nanos % BigInt(NANOS_PER_SECOND);
    const borrow = remainder < 0n ? 1n : 0n;
    packer.write(seconds - borrow);
    packer.write(remainder + borrow * BigInt(NANOS_PER_SECOND));
    packer.write(0);
  },

  readTime(unpacker: Unpacker): Temporal.Instant {
    const seconds = BigInt(unpacker.read() as number | bigint);
    const nanos = BigInt(unpacker.read() as number | bigint);
    unpacker.read();
    return Temporal.Instant.fromEpochNanoseconds(seconds * BigInt(NANOS_PER_SECOND) + nanos);
  },

  writeTimeWithZone(twz: TimeWithZone, packer: Packer): void {
    Extensions.writeTime(twz.utc(), packer);
    Extensions.writeTimeZone(twz.timeZone, packer);
  },

  readTimeWithZone(unpacker: Unpacker): TimeWithZone {
    return new TimeWithZone(Extensions.readTime(unpacker), Extensions.readTimeZone(unpacker)!);
  },

  dumpTimeZone(timeZone: TimeZone): string {
    return timeZone.name;
  },

  loadTimeZone(name: string): TimeZone | null {
    try {
      return TimeZone.find(name);
    } catch {
      return null;
    }
  },

  writeTimeZone(timeZone: TimeZone, packer: Packer): void {
    packer.write(Extensions.dumpTimeZone(timeZone));
  },

  readTimeZone(unpacker: Unpacker): TimeZone | null {
    return Extensions.loadTimeZone(unpacker.read() as string);
  },

  dumpClass(klass: ObjectClass): string {
    if (!klass.name) throw new UnserializableObjectError("Cannot serialize anonymous class");
    return klass.name;
  },

  loadClass(name: string): ObjectClass {
    const klass = objectClassRegistry.get(name);
    if (!klass) throw new MissingClassError(`Missing class: ${name}`);
    return klass;
  },

  writeClass(klass: ObjectClass, packer: Packer): void {
    packer.write(Extensions.dumpClass(klass));
  },

  readClass(unpacker: Unpacker): ObjectClass {
    return Extensions.loadClass(unpacker.read() as string);
  },

  raiseUnserializable(object: unknown): never {
    const name = typeof object === "object" && object ? classOf(object).name : typeof object;
    throw new UnserializableObjectError(`Unsupported type ${name} for object ${String(object)}`);
  },

  raiseInvalidFormat(): never {
    throw new MessagePackError("Invalid format");
  },

  writeObject(object: object, packer: Packer): void {
    const klass = classOf(object);
    const o = object as { toMsgpackExt?: () => unknown; asJson?: () => unknown };
    // Rails pairs a class-level `from_msgpack_ext`/`json_create` with an
    // instance-level `to_msgpack_ext`/`as_json`. Guard the instance half too so
    // a half-implemented protocol raises UnserializableObjectError rather than a
    // bare TypeError from the cast.
    if (typeof klass.fromMsgpackExt === "function" && typeof o.toMsgpackExt === "function") {
      packer.write(LOAD_WITH_MSGPACK_EXT);
      Extensions.writeClass(klass, packer);
      packer.write(o.toMsgpackExt());
    } else if (typeof klass.jsonCreate === "function" && typeof o.asJson === "function") {
      packer.write(LOAD_WITH_JSON_CREATE);
      Extensions.writeClass(klass, packer);
      packer.write(o.asJson());
    } else {
      Extensions.raiseUnserializable(object);
    }
  },

  readObject(unpacker: Unpacker): unknown {
    switch (unpacker.read()) {
      case LOAD_WITH_MSGPACK_EXT:
        return Extensions.readClass(unpacker).fromMsgpackExt!(unpacker.read());
      case LOAD_WITH_JSON_CREATE:
        return Extensions.readClass(unpacker).jsonCreate!(unpacker.read());
      default:
        return Extensions.raiseInvalidFormat();
    }
  },
};
