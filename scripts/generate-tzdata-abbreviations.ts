/**
 * Regenerates `TZDATA_ABBREVIATIONS` (packages/date/src/tzdata-abbreviations.ts),
 * the abbreviation MRI's `Time#zone` (`ruby/time.c` `time_zone`, which answers
 * `tm.tm_zone`) and `TZInfo::TimezoneOffset#abbreviation` both read off the
 * zone's transition records — the zic `FORMAT` column with its rule `LETTER`
 * substituted. No ECMAScript or `Temporal` API exposes it: `Intl`'s short zone
 * names are CLDR locale strings, not tzdata's.
 *
 * `generate-tzdata-abbreviations.test.ts` runs this script and asserts it still
 * produces the committed table, as `generate-tzdata-isdst.test.ts` does for the
 * sibling table.
 *
 * Run with `pnpm tsx scripts/generate-tzdata-abbreviations.ts` to print the
 * module for writing over packages/date/src/tzdata-abbreviations.ts.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { RUBY_ZONEINFO_PREAMBLE, tzdataVersion, zoneinfoEnv } from "./tzdata-zoneinfo.js";

const execFileAsync = promisify(execFile);

/** The last instant the table carries transitions for; past it the final abbreviation holds. */
const HORIZON_YEAR = 2040;

/**
 * Every zone, as its distinct abbreviations in order of first use, the index of
 * the one before its first transition, and each change as `[instant, index]`.
 */
const RUBY_SCRIPT = `${RUBY_ZONEINFO_PREAMBLE}
require "json"
zones = (JSON.parse(ARGV[0]) + TZInfo::Timezone.all_identifiers).uniq
out = {}
zones.each do |identifier|
  timezone = (TZInfo::Timezone.get(identifier) rescue nil)
  next if timezone.nil?
  current = timezone.period_for_utc(Time.utc(1700)).abbreviation
  abbreviations = [current]
  changes = []
  timezone.transitions_up_to(Time.utc(${HORIZON_YEAR})).each do |transition|
    abbreviation = transition.offset.abbreviation
    next if abbreviation == current
    current = abbreviation
    abbreviations << abbreviation unless abbreviations.include?(abbreviation)
    changes << [transition.timestamp_value, abbreviations.index(abbreviation)]
  end
  out[identifier] = [abbreviations, changes]
end
puts JSON.generate(out)
`;

type ZoneAbbreviations = [string[], [number, number][]];

/**
 * The zone's row: its abbreviations joined by `|`, then each change as the
 * abbreviation's base-36 index digit followed by the base-36 delta in seconds
 * from the change before it.
 */
export function encodeZone([abbreviations, changes]: ZoneAbbreviations): string {
  if (abbreviations.length > 36) throw new Error("more than 36 abbreviations in one zone");
  let previous = 0;
  let row = abbreviations.join("|");
  for (const [instant, index] of changes) {
    row += `,${index.toString(36)}${(instant - previous).toString(36)}`;
    previous = instant;
  }
  return row;
}

export function serializeTable(zones: Record<string, ZoneAbbreviations>): string {
  const rows = Object.keys(zones)
    .sort()
    .map((identifier) => `${identifier} ${encodeZone(zones[identifier])}`);
  return `${header()}export const TZDATA_ABBREVIATIONS = \`\n${rows.join("\n")}\n\`;\n${READER}`;
}

/** The IANA release the table was generated from, which `process.versions.tz` must match. */
export function header(): string {
  return `/** @noRailsEquivalent PERMANENT */\nexport const TZDATA_VERSION = "${tzdataVersion()}";\n\n`;
}

const READER = `
let rowsByZoneId: Map<string, string>;

function rows(): Map<string, string> {
  rowsByZoneId ??= new Map(
    TZDATA_ABBREVIATIONS.trim()
      .split("\\n")
      .map((row) => {
        const space = row.indexOf(" ");
        return [row.slice(0, space), row.slice(space + 1)] as [string, string];
      }),
  );
  return rowsByZoneId;
}

const decodedRows = new Map<string, [string[], number[], number[]]>();

function decodeRow(row: string): [string[], number[], number[]] {
  let decoded = decodedRows.get(row);
  if (decoded === undefined) {
    const [names, ...changes] = row.split(",");
    const instants: number[] = [];
    const indexes: number[] = [];
    let previous = 0;
    for (const change of changes) {
      indexes.push(parseInt(change[0], 36));
      previous += parseInt(change.slice(1), 36);
      instants.push(previous);
    }
    decoded = [names.split("|"), instants, indexes];
    decodedRows.set(row, decoded);
  }
  return decoded;
}

function primaryZoneId(timeZoneId: string): string | undefined {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: timeZoneId }).resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

let rowsByPrimaryZoneId: Map<string | undefined, string>;

function zoneRow(timeZoneId: string): string | undefined {
  const row = rows().get(timeZoneId);
  if (row !== undefined) return row;
  const primary = primaryZoneId(timeZoneId);
  const primaryRow = primary === undefined ? undefined : rows().get(primary);
  if (primaryRow !== undefined) return primaryRow;
  rowsByPrimaryZoneId ??= new Map(
    [...rows()].reverse().map(([identifier, row]) => [primaryZoneId(identifier), row]),
  );
  return rowsByPrimaryZoneId.get(primary);
}

/** @noRailsEquivalent PERMANENT */
export function tzdataAbbreviationChanges(timeZoneId: string): number[] {
  const row = zoneRow(timeZoneId);
  return row === undefined ? [] : decodeRow(row)[1];
}

/** @noRailsEquivalent PERMANENT */
export function tzdataAbbreviation(timeZoneId: string, epochSeconds: number): string | undefined {
  const row = zoneRow(timeZoneId);
  if (row === undefined) return undefined;
  const [names, instants, indexes] = decodeRow(row);
  let low = 0;
  let high = instants.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (instants[middle] <= epochSeconds) low = middle + 1;
    else high = middle;
  }
  return names[low === 0 ? 0 : indexes[low - 1]];
}
`;

async function main(): Promise<void> {
  const identifiers = [...Intl.supportedValuesOf("timeZone"), "UTC"];
  try {
    const { stdout } = await execFileAsync(
      "ruby",
      ["-e", RUBY_SCRIPT, JSON.stringify(identifiers)],
      { env: await zoneinfoEnv(), maxBuffer: 64 * 1024 * 1024 },
    );
    console.log(serializeTable(JSON.parse(stdout)).trimEnd());
  } catch {
    throw new Error("ruby with the tzinfo gem is required to regenerate the table");
  }
}

void main();
