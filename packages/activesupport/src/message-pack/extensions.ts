import { MessagePack, type Factory, type Packer, type Unpacker } from "@blazetrails/msgpack";
import { HashWithIndifferentAccess } from "../hash-with-indifferent-access.js";
import { Temporal, Time } from "@blazetrails/date";
import {
  BigDecimal,
  Complex,
  Generic,
  IPAddr,
  NameError,
  Pathname,
  Range,
  Rational,
  RuntimeError,
  URI,
  complex,
  rational,
  rbCDate,
  rbCDateTime,
  rbCInteger,
  rbCSymbol,
  rbModConstGet,
  rbObjMethod,
  rbRegInitStr,
  rbRegToS,
  zip,
} from "@blazetrails/ruby-compat";
import { Duration, type DurationParts } from "../duration.js";
import { compact, valuesAt } from "../hash-utils.js";
import { TimeWithZone } from "../time-with-zone.js";
import { atWithoutCoercion } from "../core-ext/time/calculations.js";
import { TimeZone, type Timezone } from "../values/time-zone.js";

const JD_UNIX_EPOCH = 2440588;

const UNIX_EPOCH_DATE = Temporal.PlainDate.from("1970-01-01");

const NANOS_PER_SECOND = 1_000_000_000;

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

function secFraction(datetime: Temporal.PlainDateTime): Rational {
  return rational(nanosecondOfSecond(datetime), NANOS_PER_SECOND);
}

function offset(_datetime: Temporal.PlainDateTime): Rational {
  return rational(0, 1);
}

export class UnserializableObjectError extends Error {}
export class MissingClassError extends Error {}

export interface ObjectClass {
  name: string;
  fromMsgpackExt?: (data: unknown) => unknown;
  jsonCreate?: (data: unknown) => unknown;
}

const LOAD_WITH_MSGPACK_EXT = 0;
const LOAD_WITH_JSON_CREATE = 1;

function classOf(value: object): ObjectClass {
  return (value as { constructor: ObjectClass }).constructor;
}

export const Extensions = {
  install(registry: Factory): void {
    registry.registerType(0, rbCSymbol, {
      packer: "toMsgpackExt",
      unpacker: "fromMsgpackExt",
      optimizedSymbolsParsing: true,
    });

    registry.registerType(1, rbCInteger, {
      packer: rbObjMethod(MessagePack.Bigint, "toMsgpackExt"),
      unpacker: rbObjMethod(MessagePack.Bigint, "fromMsgpackExt"),
      oversizedIntegerExtension: true,
    });

    registry.registerType(2, BigDecimal, {
      packer: "_dump",
      unpacker: (data: Uint8Array) => BigDecimal._load(new TextDecoder().decode(data)),
    });

    registry.registerType(3, Rational, {
      packer: Extensions.writeRational,
      unpacker: Extensions.readRational,
      recursive: true,
    });

    registry.registerType(4, Complex, {
      packer: Extensions.writeComplex,
      unpacker: Extensions.readComplex,
      recursive: true,
    });

    registry.registerType(5, rbCDateTime, {
      packer: Extensions.writeDatetime,
      unpacker: Extensions.readDatetime,
      recursive: true,
    });

    registry.registerType(6, rbCDate, {
      packer: Extensions.writeDate,
      unpacker: Extensions.readDate,
      recursive: true,
    });

    registry.registerType(7, Time, {
      packer: Extensions.writeTime,
      unpacker: Extensions.readTime,
      recursive: true,
    });

    registry.registerType(8, TimeWithZone, {
      packer: Extensions.writeTimeWithZone,
      unpacker: Extensions.readTimeWithZone,
      recursive: true,
    });

    registry.registerType(9, TimeZone, {
      packer: Extensions.dumpTimeZone,
      unpacker: (data: Uint8Array) => Extensions.loadTimeZone(new TextDecoder().decode(data)),
    });

    registry.registerType(10, Duration, {
      packer: Extensions.writeDuration,
      unpacker: Extensions.readDuration,
      recursive: true,
    });

    registry.registerType(11, Range, {
      packer: Extensions.writeRange,
      unpacker: Extensions.readRange,
      recursive: true,
    });

    registry.registerType(12, Set, {
      packer: Extensions.writeSet,
      unpacker: Extensions.readSet,
      recursive: true,
    });

    registry.registerType(13, Generic, {
      packer: "toString",
      unpacker: (data: Uint8Array) => URI.parse(new TextDecoder().decode(data)),
    });

    registry.registerType(14, IPAddr, {
      packer: Extensions.writeIpaddr,
      unpacker: Extensions.readIpaddr,
      recursive: true,
    });

    registry.registerType(15, Pathname, {
      packer: "toString",
      unpacker: (data: Uint8Array) => new Pathname(new TextDecoder().decode(data)),
    });

    registry.registerType(16, RegExp, {
      packer: (regexp: RegExp) => rbRegToS(regexp, "onig"),
      unpacker: (data: Uint8Array) => rbRegInitStr(new TextDecoder().decode(data)),
    });

    registry.registerType(17, HashWithIndifferentAccess, {
      packer: Extensions.writeHashWithIndifferentAccess,
      unpacker: Extensions.readHashWithIndifferentAccess,
      recursive: true,
    });
  },

  installUnregisteredTypeError(registry: Factory): void {
    registry.registerType(127, Object, {
      packer: Extensions.raiseUnserializable,
      unpacker: Extensions.raiseInvalidFormat,
    });
  },

  installUnregisteredTypeFallback(registry: Factory): void {
    registry.registerType(127, Object, {
      packer: Extensions.writeObject,
      unpacker: Extensions.readObject,
      recursive: true,
    });
  },

  writeRational(rational: Rational, packer: Packer): void {
    packer.write(rational.numerator);
    if (!(rational.numerator === 0n)) packer.write(rational.denominator);
  },

  readRational(unpacker: Unpacker): Rational {
    const numerator = unpacker.read() as number | bigint;
    return rational(numerator, BigInt(numerator) === 0n ? 1 : (unpacker.read() as number | bigint));
  },

  writeComplex(complex: Complex, packer: Packer): void {
    packer.write(complex.real);
    packer.write(complex.imaginary);
  },

  readComplex(unpacker: Unpacker): Complex {
    return complex(unpacker.read(), unpacker.read());
  },

  writeDatetime(datetime: Temporal.PlainDateTime, packer: Packer): void {
    packer.write(julianDay(datetime.toPlainDate()));
    packer.write(datetime.hour);
    packer.write(datetime.minute);
    packer.write(datetime.second);
    Extensions.writeRational(secFraction(datetime), packer);
    Extensions.writeRational(offset(datetime), packer);
  },

  readDatetime(unpacker: Unpacker): Temporal.PlainDateTime {
    const jd = unpacker.read() as number;
    const hour = unpacker.read() as number;
    const minute = unpacker.read() as number;
    const second = unpacker.read() as number;
    const secFraction = Extensions.readRational(unpacker);
    Extensions.readRational(unpacker);
    const nanos = Math.round(secFraction.toF() * NANOS_PER_SECOND);
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

  writeTime(time: Time, packer: Packer): void {
    packer.write(time.tvSec());
    packer.write(time.tvNsec);
    packer.write(time.utcOffset);
  },

  readTime(unpacker: Unpacker): Time {
    return atWithoutCoercion(unpacker.read(), unpacker.read(), "nanosecond", {
      in: unpacker.read() as number,
    });
  },

  writeTimeWithZone(twz: TimeWithZone, packer: Packer): void {
    Extensions.writeTime(twz.utc(), packer);
    Extensions.writeTimeZone(twz.timeZone, packer);
  },

  readTimeWithZone(unpacker: Unpacker): TimeWithZone {
    return new TimeWithZone(Extensions.readTime(unpacker), Extensions.readTimeZone(unpacker)!);
  },

  dumpTimeZone(timeZone: TimeZone | Timezone): string {
    return timeZone.name;
  },

  loadTimeZone(name: string): TimeZone | null {
    return TimeZone.find(name);
  },

  writeTimeZone(timeZone: TimeZone | Timezone, packer: Packer): void {
    packer.write(Extensions.dumpTimeZone(timeZone));
  },

  readTimeZone(unpacker: Unpacker): TimeZone | null {
    return Extensions.loadTimeZone(unpacker.read() as string);
  },

  writeDuration(duration: Duration, packer: Packer): void {
    packer.write(duration.value);
    packer.write(valuesAt(duration._parts(), ...Duration.PARTS));
  },

  readDuration(unpacker: Unpacker): Duration {
    const value = unpacker.read() as number;
    let parts: Partial<DurationParts> = Object.fromEntries(
      zip(Duration.PARTS, unpacker.read() as number[]),
    );
    parts = compact(parts);
    return new Duration(value, parts);
  },

  writeRange(range: Range, packer: Packer): void {
    packer.write(range.begin);
    packer.write(range.end);
    packer.write(range.excludeEnd);
  },

  readRange(unpacker: Unpacker): Range {
    return new Range(unpacker.read(), unpacker.read(), unpacker.read() as boolean);
  },

  writeSet(set: Set<unknown>, packer: Packer): void {
    packer.write([...set]);
  },

  readSet(unpacker: Unpacker): Set<unknown> {
    return new Set(unpacker.read() as unknown[]);
  },

  writeIpaddr(ipaddr: IPAddr, packer: Packer): void {
    if (ipaddr.prefix < 32 || (ipaddr.isIpv6() && ipaddr.prefix < 128)) {
      packer.write(`${ipaddr}/${ipaddr.prefix}`);
    } else {
      packer.write(ipaddr.toString());
    }
  },

  readIpaddr(unpacker: Unpacker): IPAddr {
    return new IPAddr(unpacker.read());
  },

  writeHashWithIndifferentAccess(hwia: HashWithIndifferentAccess, packer: Packer): void {
    packer.write(hwia.toH());
  },

  readHashWithIndifferentAccess(unpacker: Unpacker): HashWithIndifferentAccess {
    return new HashWithIndifferentAccess(unpacker.read() as Record<string, unknown>);
  },

  dumpClass(klass: ObjectClass): string {
    if (!klass.name) throw new UnserializableObjectError("Cannot serialize anonymous class");
    return klass.name;
  },

  loadClass(name: string): ObjectClass {
    try {
      return rbModConstGet(Object, name) as ObjectClass;
    } catch (error) {
      if (!(error instanceof NameError)) throw error;
      if (String(error.constantName) === name) {
        throw new MissingClassError(`Missing class: ${name}`);
      } else {
        throw error;
      }
    }
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
    throw new RuntimeError("Invalid format");
  },

  /** @missingRailsName class — PERMANENT */
  writeObject(object: object, packer: Packer): void {
    const klass = classOf(object);
    const o = object as { toMsgpackExt?: () => unknown; asJson?: () => unknown };
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
