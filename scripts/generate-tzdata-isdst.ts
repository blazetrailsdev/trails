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
 */
const RUBY_SCRIPT = `
require "tzinfo"
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
  timezone.transitions_up_to(Time.utc(${HORIZON_YEAR})).each do |transition|
    offset = transition.offset
    if offset.base_utc_offset != previous.base_utc_offset ||
        (offset.observed_utc_offset == previous.observed_utc_offset && offset.dst? == previous.dst?)
      bases << [transition.timestamp_value, offset.base_utc_offset]
    end
    previous = offset
    dst = offset.dst?
    next if dst == current
    current = dst
    flips << transition.timestamp_value
  end
  out[identifier] = [initial, flips, first.base_utc_offset, bases]
end
puts JSON.generate(out)
`;

type ZoneRecords = [boolean, number[], number, [number, number][]];

/** `[initialDst, flipInstants, initialBase, [instant, base][]]` per zone, or `null` where `ruby`/`tzinfo` is unavailable. */
export async function rubyZoneDstFlips(
  identifiers: string[],
): Promise<Record<string, ZoneRecords> | null> {
  try {
    const { stdout } = await execFileAsync(
      "ruby",
      ["-e", RUBY_SCRIPT, JSON.stringify(identifiers)],
      {
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

/** The module packages/date/src/tzdata-isdst.ts carries, tables and reader both. */
export function serializeTable(zoneRecords: Record<string, ZoneRecords>): string {
  const rows: string[] = [];
  const baseRows: string[] = [];
  for (const identifier of Object.keys(zoneRecords).sort()) {
    const [initial, flips, initialBase, bases] = zoneRecords[identifier];
    baseRows.push(`${identifier} ${encodeBases(initialBase, bases)}`);
    // A zone that has never observed DST answers `false` at every instant,
    // which is what a missing row already answers.
    if (!initial && flips.length === 0) continue;
    rows.push(`${identifier} ${encodeZone(initial, flips)}`);
  }
  return `${HEADER}export const TZDATA_ISDST = \`\n${rows.join("\n")}\n\`;\n\nexport const TZDATA_BASE_OFFSETS = \`\n${baseRows.join("\n")}\n\`;\n${READER}`;
}

const HEADER = "";

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
  return (row.charCodeAt(0) === 49 ? low + 1 : low) % 2 === 1;
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
