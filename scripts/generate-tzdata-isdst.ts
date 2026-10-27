/**
 * Regenerates `TZDATA_ISDST` (packages/date/src/tzdata-isdst.ts), the tzdata
 * `isdst` bit MRI's `Time#isdst` (`ruby/time.c` `time_isdst`, which answers
 * `tm.tm_isdst`) and `TZInfo::TimezonePeriod#dst?` both read straight off the
 * zone's transition records.
 *
 * No ECMAScript or `Temporal` API exposes that bit, and every reading that
 * derives it from offsets is wrong somewhere: sampling January against July
 * misses year-round DST (`America/New_York` 1943), and reading the surrounding
 * `getTimeZoneTransition` segments calls every permanent standard-offset shift
 * DST (`America/Cancun` 2015, `Europe/Istanbul` 2016). So the bit is vendored.
 *
 * The table is data, so it rots silently when tzdata revises a zone's history.
 * `generate-tzdata-isdst.test.ts` runs this script and asserts it still
 * produces the committed table, skipping where `ruby`/`tzinfo` is absent — the
 * regeneration guard `generate-canonical-zone-identifiers.ts` established for
 * the sibling table.
 *
 * Run with `pnpm tsx scripts/generate-tzdata-isdst.ts` to print the module for
 * writing over packages/date/src/tzdata-isdst.ts.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Temporal } from "../packages/date/src/index.js";
import { RUBY_ZONEINFO_PREAMBLE, tzdataVersion, zoneinfoEnv } from "./tzdata-zoneinfo.js";

const execFileAsync = promisify(execFile);

/** The last instant the table carries transitions for; past it the final bit holds. */
const HORIZON_YEAR = 2040;

/**
 * Every zone, mapped to its initial `isdst` bit and the instants the bit FLIPS
 * at — a transition that only moves the offset (a permanent shift, a war-time
 * re-basing) is not a flip and carries no entry. TZInfo reads the same records
 * `TimezonePeriod#dst?` answers from (tzinfo `timezone_offset.rb`).
 *
 * Beside them, the zone's initial `base_utc_offset` and each transition that
 * changes it, or that changes neither the observed offset nor the bit (an
 * abbreviation-only or std/base re-split transition, which neither `Temporal`
 * nor the flips can see), with the base it moves to.
 *
 * Last, each transition that changes the observed offset, which
 * `offsetGaps` compares against `Temporal`'s.
 */
const RUBY_SCRIPT = `${RUBY_ZONEINFO_PREAMBLE}
require "json"
zones = JSON.parse(ARGV[0])
out = {}
zones.each do |identifier|
  timezone = (TZInfo::Timezone.get(identifier) rescue nil)
  next if timezone.nil?
  first = timezone.period_for_utc(Time.utc(1700)).offset
  initial = first.dst?
  current = initial
  flips = []
  previous = first
  bases = []
  offsets = []
  timezone.transitions_up_to(Time.utc(${HORIZON_YEAR})).each do |transition|
    offset = transition.offset
    if offset.base_utc_offset != previous.base_utc_offset ||
        (offset.observed_utc_offset == previous.observed_utc_offset && offset.dst? == previous.dst?)
      bases << [transition.timestamp_value, offset.base_utc_offset]
    end
    offsets << [transition.timestamp_value, offset.observed_utc_offset] if offset.observed_utc_offset != previous.observed_utc_offset
    previous = offset
    dst = offset.dst?
    next if dst == current
    current = dst
    flips << transition.timestamp_value
  end
  out[identifier] = [initial, flips, first.base_utc_offset, bases, first.observed_utc_offset, offsets]
end
puts JSON.generate(out)
`;

type ZoneRecords = [boolean, number[], number, [number, number][], number, [number, number][]];

/** `[initialDst, flipInstants, initialBase, [instant, base][]]` per zone, or `null` where `ruby`/`tzinfo` is unavailable. */
export async function rubyZoneDstFlips(
  identifiers: string[],
): Promise<Record<string, ZoneRecords> | null> {
  try {
    const { stdout } = await execFileAsync(
      "ruby",
      ["-e", RUBY_SCRIPT, JSON.stringify(identifiers)],
      {
        env: await zoneinfoEnv(),
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    return JSON.parse(stdout) as Record<string, ZoneRecords>;
  } catch {
    return null;
  }
}

/**
 * The zone's row: the initial bit, then each flip as a base-36 delta in seconds
 * from the one before it. Base 36 rather than decimal because the table is
 * 25,000 flips wide and the deltas are mostly half-year constants.
 */
export function encodeZone(initial: boolean, flips: number[]): string {
  let previous = 0;
  let row = initial ? "1" : "0";
  for (const flip of flips) {
    row += `,${(flip - previous).toString(36)}`;
    previous = flip;
  }
  return row;
}

/**
 * The zone's base row: the initial base offset, then each entry as a base-36
 * delta from the instant before it and the base-36 base it moves to.
 */
export function encodeBases(initialBase: number, bases: [number, number][]): string {
  let previous = 0;
  let row = initialBase.toString(36);
  for (const [instant, base] of bases) {
    row += `,${(instant - previous).toString(36)}:${base.toString(36)}`;
    previous = instant;
  }
  return row;
}

function temporalOffset(identifier: string, epochSeconds: number): number {
  return (
    Temporal.Instant.fromEpochMilliseconds(epochSeconds * 1000).toZonedDateTimeISO(identifier)
      .offsetNanoseconds / 1e9
  );
}

/**
 * The spans before `HORIZON_YEAR` where Ruby tzinfo's observed offset differs
 * from `Temporal`'s, as `[start, end]`. In each, tzinfo still observes the
 * offset `Temporal` gives just before `start`: `ZoneinfoReader` drops a
 * rule-generated transition in the year of the last defined one when its
 * offset matches that transition's (tzinfo 2.0.6
 * `lib/tzinfo/data_sources/zoneinfo_reader.rb:322-324`), so a southern zone
 * whose last defined transition is the 2038 32-bit cut-off loses that year's
 * spring-forward (`America/Santiago`). Any other kind of difference throws.
 *
 * The reader's `tzdataOffsetInstant` answers, for an instant, the instant whose
 * `Temporal` offset is the one tzinfo observes: inside a gap, the second before
 * it, and past `GENERATE_UP_TO` (`zoneinfo_reader.rb:16`, read off the clock
 * when the file loads), the end of that year, since the last generated
 * transition holds after it (`:206`, `:326`).
 */
export function offsetGaps(
  identifier: string,
  initialOffset: number,
  offsets: [number, number][],
): [number, number][] {
  const horizon = Date.UTC(HORIZON_YEAR, 0, 1) / 1000;
  const changes = new Set<number>(offsets.map(([at]) => at));
  let zoned = Temporal.Instant.fromEpochMilliseconds(Date.UTC(1700, 0, 1)).toZonedDateTimeISO(
    identifier,
  );
  for (;;) {
    const next = zoned.getTimeZoneTransition("next");
    if (next === null || next.epochMilliseconds / 1000 >= horizon) break;
    changes.add(next.epochMilliseconds / 1000);
    zoned = next;
  }
  const rubyOffset = (at: number): number => {
    let offset = initialOffset;
    for (const [instant, observed] of offsets) {
      if (instant > at) break;
      offset = observed;
    }
    return offset;
  };
  const gaps: [number, number][] = [];
  let start: number | null = null;
  for (const at of [...changes].sort((a, b) => a - b)) {
    const differs = rubyOffset(at) !== temporalOffset(identifier, at);
    if (differs && start === null) {
      if (rubyOffset(at) !== temporalOffset(identifier, at - 1)) {
        throw new Error(`${identifier}: tzinfo and Temporal differ at ${at} in an unexpected way`);
      }
      start = at;
    } else if (!differs && start !== null) {
      gaps.push([start, at]);
      start = null;
    }
  }
  if (start !== null) gaps.push([start, horizon]);
  return gaps;
}

/** The zone's gap row: each gap's start as a base-36 delta from the end before it, and its length. */
export function encodeGaps(gaps: [number, number][]): string {
  let previous = 0;
  return gaps
    .map(([start, end]) => {
      const row = `${(start - previous).toString(36)}:${(end - start).toString(36)}`;
      previous = end;
      return row;
    })
    .join(",");
}

/** The module packages/date/src/tzdata-isdst.ts carries, tables and reader both. */
export function serializeTable(zoneRecords: Record<string, ZoneRecords>): string {
  const rows: string[] = [];
  const baseRows: string[] = [];
  const gapRows: string[] = [];
  for (const identifier of Object.keys(zoneRecords).sort()) {
    const [initial, flips, initialBase, bases, initialOffset, offsets] = zoneRecords[identifier];
    baseRows.push(`${identifier} ${encodeBases(initialBase, bases)}`);
    const gaps = offsetGaps(identifier, initialOffset, offsets);
    if (gaps.length > 0) gapRows.push(`${identifier} ${encodeGaps(gaps)}`);
    // A zone that has never observed DST answers `false` at every instant,
    // which is what a missing row already answers.
    if (!initial && flips.length === 0) continue;
    rows.push(`${identifier} ${encodeZone(initial, flips)}`);
  }
  return `${header()}export const TZDATA_ISDST = \`\n${rows.join("\n")}\n\`;\n\nexport const TZDATA_BASE_OFFSETS = \`\n${baseRows.join("\n")}\n\`;\n\nexport const TZDATA_OFFSET_GAPS = \`\n${gapRows.join("\n")}\n\`;\n${READER}`;
}

/** The IANA release the tables were generated from, which `process.versions.tz` must match. */
export function header(): string {
  return `import { Temporal } from "@js-temporal/polyfill";\n\n/** @noRailsEquivalent PERMANENT */\nexport const TZDATA_VERSION = "${tzdataVersion()}";\n\n`;
}

const READER = `
const tables = new Map<string, Map<string, string>>();

function rows(table: string): Map<string, string> {
  let rowsByZoneId = tables.get(table);
  if (rowsByZoneId === undefined) {
    rowsByZoneId = new Map(
      table
        .trim()
        .split("\\n")
        .map((row) => {
          const space = row.indexOf(" ");
          return [row.slice(0, space), row.slice(space + 1)] as [string, string];
        }),
    );
    tables.set(table, rowsByZoneId);
  }
  return rowsByZoneId;
}

const flipInstants = new Map<string, number[]>();

function zoneFlipInstants(row: string): number[] {
  let instants = flipInstants.get(row);
  if (instants === undefined) {
    instants = [];
    let previous = 0;
    for (const delta of row.split(",").slice(1)) {
      previous += parseInt(delta, 36);
      instants.push(previous);
    }
    flipInstants.set(row, instants);
  }
  return instants;
}

const primaryZoneIds = new Map<string, string>();

function zoneRow(timeZoneId: string, table = TZDATA_ISDST): string | undefined {
  const row = rows(table).get(timeZoneId);
  if (row !== undefined) return row;
  let primary = primaryZoneIds.get(timeZoneId);
  if (primary === undefined) {
    try {
      primary = new Intl.DateTimeFormat("en-US", { timeZone: timeZoneId }).resolvedOptions()
        .timeZone;
    } catch {
      primary = timeZoneId;
    }
    primaryZoneIds.set(timeZoneId, primary);
  }
  return rows(table).get(primary);
}

const horizon = Date.UTC(${HORIZON_YEAR}, 0, 1) / 1000;

const GENERATE_UP_TO = new Date().getUTCFullYear() + 100;

const generatedUpTo = Date.UTC(GENERATE_UP_TO + 1, 0, 1) / 1000;

const gapRecords = new Map<string, number[]>();

/** @noRailsEquivalent PERMANENT */
export function tzdataOffsetInstant(timeZoneId: string, epochSeconds: number): number {
  if (epochSeconds >= generatedUpTo) return generatedUpTo - 1;
  const row = zoneRow(timeZoneId, TZDATA_OFFSET_GAPS);
  if (row === undefined) return epochSeconds;
  let gaps = gapRecords.get(row);
  if (gaps === undefined) {
    gaps = [];
    let previous = 0;
    for (const entry of row.split(",")) {
      const colon = entry.indexOf(":");
      const start = previous + parseInt(entry.slice(0, colon), 36);
      previous = start + parseInt(entry.slice(colon + 1), 36);
      gaps.push(start, previous);
    }
    gapRecords.set(row, gaps);
  }
  for (let i = 0; i < gaps.length && gaps[i] <= epochSeconds; i += 2) {
    if (epochSeconds < gaps[i + 1]) return gaps[i] - 1;
  }
  return epochSeconds;
}

const baseRecords = new Map<string, [number, number[], number[]]>();

/** @noRailsEquivalent PERMANENT */
export function tzdataBaseOffsets(timeZoneId: string): [number, number[], number[]] | null {
  const row = zoneRow(timeZoneId, TZDATA_BASE_OFFSETS);
  if (row === undefined) return null;
  let records = baseRecords.get(row);
  if (records === undefined) {
    const [initial, ...entries] = row.split(",");
    records = [parseInt(initial, 36), [], []];
    let previous = 0;
    for (const entry of entries) {
      const colon = entry.indexOf(":");
      previous += parseInt(entry.slice(0, colon), 36);
      records[1].push(previous);
      records[2].push(parseInt(entry.slice(colon + 1), 36));
    }
    baseRecords.set(row, records);
  }
  return records;
}

/** @noRailsEquivalent PERMANENT */
export function tzdataIsdstFlips(timeZoneId: string): number[] {
  const row = zoneRow(timeZoneId);
  return row === undefined ? [] : zoneFlipInstants(row);
}

/** @noRailsEquivalent PERMANENT */
export function tzdataIsdst(timeZoneId: string, epochSeconds: number): boolean {
  const row = zoneRow(timeZoneId);
  if (row === undefined) return false;
  const instants = zoneFlipInstants(row);
  let low = 0;
  let high = instants.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (instants[middle] <= epochSeconds) low = middle + 1;
    else high = middle;
  }
  const isdst = (row.charCodeAt(0) === 49 ? low + 1 : low) % 2 === 1;
  if (epochSeconds < horizon || low === 0 || instants[low - 1] < horizon - 366 * 86400) {
    return isdst;
  }
  const offsetAt = (at: number): number =>
    Temporal.Instant.fromEpochMilliseconds(at * 1000).toZonedDateTimeISO(timeZoneId)
      .offsetNanoseconds;
  return offsetAt(tzdataOffsetInstant(timeZoneId, epochSeconds)) === offsetAt(instants[low - 1])
    ? isdst
    : !isdst;
}
`;

async function main(): Promise<void> {
  const zoneDstFlips = await rubyZoneDstFlips(Intl.supportedValuesOf("timeZone"));
  if (zoneDstFlips === null) {
    throw new Error("ruby with the tzinfo gem is required to regenerate the table");
  }
  console.log(serializeTable(zoneDstFlips).trimEnd());
}

void main();
