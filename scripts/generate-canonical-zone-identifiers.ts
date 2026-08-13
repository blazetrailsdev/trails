/**
 * Regenerates `CANONICAL_ZONE_IDENTIFIERS`
 * (packages/activesupport/src/values/time-zone.ts), the tzdata
 * backward-compatibility links `TimeZone.countryZones` folds away so that
 * `Intl.Locale#getTimeZones` answers what `TZInfo::Country#zone_identifiers`
 * answers (activesupport/lib/active_support/values/time_zone.rb:275).
 *
 * The table is data, so it rots silently when tzdata moves a zone into a link
 * (`Europe/Kiev` → `Europe/Kyiv`) or when ICU starts canonicalizing on its own.
 * `generate-canonical-zone-identifiers.test.ts` runs this script and asserts it
 * still produces the committed table, skipping where `ruby`/`tzinfo` is absent.
 *
 * The procedure, unchanged from the one that produced the table in PR #6276:
 * for every ISO code TZInfo knows, diff `TZInfo::Country#zone_identifiers`
 * (canonical zones only) against `new Intl.Locale("und-<code>").getTimeZones()`
 * (which reports link names), then resolve each intl-only identifier to the
 * country's canonical zone with the same UTC-offset signature over 1900-2035.
 *
 * Run with `pnpm tsx scripts/generate-canonical-zone-identifiers.ts` to print
 * the object literal for pasting into time-zone.ts.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * `TZInfo::Country.all_codes` mapped to `#zone_identifiers` — the canonical
 * zones, which is what `load_country_zones` reads.
 */
const RUBY_SCRIPT = `
require "tzinfo"
require "json"
out = {}
TZInfo::Country.all_codes.each do |code|
  out[code] = TZInfo::Country.get(code).zone_identifiers
end
puts JSON.generate(out)
`;

/**
 * The country→canonical-zones table, or `null` where `ruby` or the `tzinfo`
 * gem is unavailable (a CI runner without them must skip, not fail).
 */
export async function rubyCountryZoneIdentifiers(): Promise<Record<string, string[]> | null> {
  try {
    const { stdout } = await execFileAsync("ruby", ["-e", RUBY_SCRIPT], {
      maxBuffer: 32 * 1024 * 1024,
    });
    return JSON.parse(stdout) as Record<string, string[]>;
  } catch {
    return null;
  }
}

/** The instants the offset signature samples: Jan 1 and Jul 1 of 1900-2035. */
function sampleInstants(): number[] {
  const instants: number[] = [];
  for (let year = 1900; year <= 2035; year++) {
    instants.push(Date.UTC(year, 0, 1), Date.UTC(year, 6, 1));
  }
  return instants;
}

const INSTANTS = sampleInstants();

const signatures = new Map<string, string>();

/** The zone's UTC offset at each sampled instant, joined — its tzdata history. */
function offsetSignature(tzId: string): string {
  const memoized = signatures.get(tzId);
  if (memoized !== undefined) return memoized;

  const format = new Intl.DateTimeFormat("en-US", {
    timeZone: tzId,
    timeZoneName: "longOffset",
  });
  const signature = INSTANTS.map((instant) => {
    const part = format.formatToParts(instant).find((p) => p.type === "timeZoneName");
    return part?.value ?? "";
  }).join("|");

  signatures.set(tzId, signature);
  return signature;
}

/** The zone identifier's last path segment — tzdata's zone name within its area. */
function basename(tzId: string): string {
  return tzId.slice(tzId.lastIndexOf("/") + 1);
}

/** The zone identifiers ECMA-402 reports for a country, or none for an unknown one. */
function intlZoneIdentifiers(code: string): string[] {
  try {
    return new Intl.Locale(`und-${code}`).getTimeZones() ?? [];
  } catch {
    return [];
  }
}

/**
 * The link→canonical pairs, keyed by link name. An intl-only identifier whose
 * offset signature matches exactly one of the country's canonical zones is that
 * zone's link; anything else is left out rather than guessed at, which is what
 * the `?? tzId` fallback at the call site (time-zone.ts:1134) already does.
 */
export function canonicalZoneIdentifiers(
  countryZoneIdentifiers: Record<string, string[]>,
): Record<string, string> {
  const table: Record<string, string> = {};

  for (const [code, canonicalZones] of Object.entries(countryZoneIdentifiers)) {
    for (const tzId of intlZoneIdentifiers(code)) {
      if (canonicalZones.includes(tzId)) continue;

      const signature = offsetSignature(tzId);
      const matches = canonicalZones.filter((zone) => offsetSignature(zone) === signature);
      if (matches.length === 1) {
        table[tzId] = matches[0];
        continue;
      }

      // Argentina's provinces share one offset history, so the signature alone
      // cannot separate `America/Catamarca` from `America/Argentina/Jujuy`. The
      // link and its target keep the same last path segment there, which is the
      // only tie-break tzdata's own `backward` file supports.
      const named = matches.filter((zone) => basename(zone) === basename(tzId));
      if (named.length === 1) table[tzId] = named[0];
    }
  }

  return Object.fromEntries(Object.entries(table).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** The table as the object literal time-zone.ts carries. */
export function serializeTable(table: Record<string, string>): string {
  const entries = Object.entries(table).map(([link, canonical]) => `  "${link}": "${canonical}",`);
  return `const CANONICAL_ZONE_IDENTIFIERS: Record<string, string> = {\n${entries.join("\n")}\n};`;
}

async function main(): Promise<void> {
  const countryZoneIdentifiers = await rubyCountryZoneIdentifiers();
  if (countryZoneIdentifiers === null) {
    throw new Error("ruby with the tzinfo gem is required to regenerate the table");
  }
  console.log(serializeTable(canonicalZoneIdentifiers(countryZoneIdentifiers)));
}

void main();
