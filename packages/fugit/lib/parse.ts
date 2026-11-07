import { Time } from "@blazetrails/date";
import { EoTime } from "@blazetrails/et-orbi";
import { ArgumentError, StandardError, rbInspect, rbObjClass } from "@blazetrails/ruby-compat";
import { At } from "./at.js";
import { Cron } from "./cron.js";
import { Duration } from "./duration.js";
import { Fugit } from "./namespaces.js";
import { Nat, type NatOptions } from "./nat.js";

export interface ParseOptions extends NatOptions {
  cron?: unknown;
  duration?: unknown;
  nat?: unknown;
  at?: unknown;
  in?: unknown;
}

export function parseCron(s: unknown): Cron | null {
  return Cron.parse(s);
}
export function parseDuration(s: unknown): Duration | null {
  return Duration.parse(s);
}
export function parseNat(s: unknown, opts: NatOptions = {}): Cron | Cron[] | Duration | null {
  return Nat.parse(s, opts);
}
export function parseAt(s: unknown): EoTime | null {
  return At.parse(s);
}
export function parseIn(s: unknown): Duration | null {
  return parseDuration(s);
}

export function doParseCron(s: unknown): Cron {
  return Cron.doParse(s);
}
export function doParseDuration(s: unknown): Duration {
  return Duration.doParse(s);
}
export function doParseNat(s: unknown, opts: NatOptions = {}): Cron | Cron[] | Duration {
  return Nat.doParse(s, opts);
}
export function doParseAt(s: unknown): EoTime {
  return At.doParse(s);
}
export function doParseIn(s: unknown): Duration {
  return doParseDuration(s);
}

export function parse(
  s: unknown,
  opts: ParseOptions = {},
): Cron | Cron[] | Duration | EoTime | null {
  if (Object.hasOwn(opts, "in")) opts.at = opts.in;

  return (
    (opts.cron !== false && parseCron(s)) ||
    (opts.duration !== false && parseDuration(s)) ||
    (opts.nat !== false && parseNat(s, opts)) ||
    (opts.at !== false && parseAt(s)) ||
    null
  );
}

const doParsers = {
  cron: doParseCron,
  duration: doParseDuration,
  nat: doParseNat,
  at: doParseAt,
} as const;

export function doParse(s: unknown, opts: ParseOptions = {}): Cron | Cron[] | Duration | EoTime {
  if (Object.hasOwn(opts, "in")) opts.at = opts.in;

  let result: Cron | Cron[] | Duration | EoTime | false | null = null;
  const errors: StandardError[] = [];

  for (const k of ["cron", "duration", "nat", "at"] as const) {
    try {
      result ||= opts[k] !== false && doParsers[k](s);
    } catch (err) {
      if (!(err instanceof StandardError)) throw err;
      errors.push(err);
    }
  }

  if (result) return result;

  throw (
    errors.find((r) => rbObjClass(r) !== ArgumentError) ??
    errors[0] ??
    new ArgumentError(`found no time information in ${rbInspect(s)}`)
  );
}

export function parseCronish(s: unknown, opts: NatOptions = {}): Cron | null {
  const r = parseCron(s) ?? parseNat(s, opts);

  return r instanceof Cron ? r : null;
}

// eslint-disable-next-line unused-imports/no-unused-vars -- parse.rb:60 takes opts and never reads it
export function doParseCronish(s: unknown, opts: NatOptions = {}): Cron {
  const r = parseCronish(s);
  if (r != null) return r;
  throw new ArgumentError(`not cron or 'natural' cron string: ${rbInspect(s)}`);
}

export function determineType(s: unknown): string | null {
  const x = parse(s);
  if (x instanceof Cron) {
    return "cron";
  } else if (x instanceof Duration) {
    return "in";
  } else if (x instanceof Time || x instanceof EoTime) {
    return "at";
  } else {
    return null;
  }
}

Object.assign(Fugit, {
  parseCron,
  parseDuration,
  parseNat,
  parseAt,
  parseIn,
  doParseCron,
  doParseDuration,
  doParseNat,
  doParseAt,
  doParseIn,
  parse,
  doParse,
  parseCronish,
  doParseCronish,
  determineType,
});
