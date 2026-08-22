/**
 * ActiveSupport::TimeZone — mirrors the Rails API.
 *
 * Uses the built-in Intl API for timezone data, wrapping IANA timezone names.
 *
 * @boundary-file: `Intl.DateTimeFormat#formatToParts` requires a JS `Date`
 *   input, so this file traffics in `Date` for offset/abbrev/DST lookups and
 *   for the `local`-to-UTC ambiguity search. The Temporal-aware public surface
 *   lives on `TimeWithZone`; this module is its calculation backend.
 */

import { TimeWithZone } from "../time-with-zone.js";
import { Duration } from "../duration.js";
import { ArgumentError } from "../hash-utils.js";
import { Temporal, Date as RubyDate, Rational } from "@blazetrails/date";
import type { DateParts } from "@blazetrails/date";
import { instantFrom } from "../temporal.js";
import { currentTime } from "../time-travel.js";
import { utcToLocalReturnsUtcOffsetTimes } from "../core-ext/date-and-time/compatibility.js";

// Rails maps friendly names to IANA zones
const MAPPING: Record<string, string> = {
  "International Date Line West": "Etc/GMT+12",
  "Midway Island": "Pacific/Midway",
  "American Samoa": "Pacific/Pago_Pago",
  Hawaii: "Pacific/Honolulu",
  Alaska: "America/Juneau",
  "Pacific Time (US & Canada)": "America/Los_Angeles",
  Tijuana: "America/Tijuana",
  "Mountain Time (US & Canada)": "America/Denver",
  Arizona: "America/Phoenix",
  Chihuahua: "America/Chihuahua",
  Mazatlan: "America/Mazatlan",
  "Central Time (US & Canada)": "America/Chicago",
  Saskatchewan: "America/Regina",
  Guadalajara: "America/Mexico_City",
  "Mexico City": "America/Mexico_City",
  Monterrey: "America/Monterrey",
  "Central America": "America/Guatemala",
  "Eastern Time (US & Canada)": "America/New_York",
  "Indiana (East)": "America/Indiana/Indianapolis",
  Bogota: "America/Bogota",
  Lima: "America/Lima",
  Quito: "America/Lima",
  "Atlantic Time (Canada)": "America/Halifax",
  Caracas: "America/Caracas",
  "La Paz": "America/La_Paz",
  Santiago: "America/Santiago",
  Newfoundland: "America/St_Johns",
  Brasilia: "America/Sao_Paulo",
  "Buenos Aires": "America/Argentina/Buenos_Aires",
  Montevideo: "America/Montevideo",
  Georgetown: "America/Guyana",
  "Puerto Rico": "America/Puerto_Rico",
  Greenland: "America/Godthab",
  "Mid-Atlantic": "Atlantic/South_Georgia",
  Azores: "Atlantic/Azores",
  "Cape Verde Is.": "Atlantic/Cape_Verde",
  Dublin: "Europe/Dublin",
  Edinburgh: "Europe/London",
  Lisbon: "Europe/Lisbon",
  London: "Europe/London",
  Casablanca: "Africa/Casablanca",
  Monrovia: "Africa/Monrovia",
  UTC: "Etc/UTC",
  Belgrade: "Europe/Belgrade",
  Bratislava: "Europe/Bratislava",
  Budapest: "Europe/Budapest",
  Ljubljana: "Europe/Ljubljana",
  Prague: "Europe/Prague",
  Sarajevo: "Europe/Sarajevo",
  Skopje: "Europe/Skopje",
  Warsaw: "Europe/Warsaw",
  Zagreb: "Europe/Zagreb",
  Brussels: "Europe/Brussels",
  Copenhagen: "Europe/Copenhagen",
  Madrid: "Europe/Madrid",
  Paris: "Europe/Paris",
  Amsterdam: "Europe/Amsterdam",
  Berlin: "Europe/Berlin",
  Bern: "Europe/Zurich",
  Zurich: "Europe/Zurich",
  Rome: "Europe/Rome",
  Stockholm: "Europe/Stockholm",
  Vienna: "Europe/Vienna",
  "West Central Africa": "Africa/Algiers",
  Bucharest: "Europe/Bucharest",
  Cairo: "Africa/Cairo",
  Helsinki: "Europe/Helsinki",
  Kyiv: "Europe/Kiev",
  Riga: "Europe/Riga",
  Sofia: "Europe/Sofia",
  Tallinn: "Europe/Tallinn",
  Vilnius: "Europe/Vilnius",
  Athens: "Europe/Athens",
  Istanbul: "Europe/Istanbul",
  Minsk: "Europe/Minsk",
  Jerusalem: "Asia/Jerusalem",
  Harare: "Africa/Harare",
  Pretoria: "Africa/Johannesburg",
  Kaliningrad: "Europe/Kaliningrad",
  Moscow: "Europe/Moscow",
  "St. Petersburg": "Europe/Moscow",
  Volgograd: "Europe/Volgograd",
  Samara: "Europe/Samara",
  Kuwait: "Asia/Kuwait",
  Riyadh: "Asia/Riyadh",
  Nairobi: "Africa/Nairobi",
  Baghdad: "Asia/Baghdad",
  Tehran: "Asia/Tehran",
  "Abu Dhabi": "Asia/Muscat",
  Muscat: "Asia/Muscat",
  Baku: "Asia/Baku",
  Tbilisi: "Asia/Tbilisi",
  Yerevan: "Asia/Yerevan",
  Kabul: "Asia/Kabul",
  Ekaterinburg: "Asia/Yekaterinburg",
  Islamabad: "Asia/Karachi",
  Karachi: "Asia/Karachi",
  Tashkent: "Asia/Tashkent",
  Chennai: "Asia/Kolkata",
  Kolkata: "Asia/Kolkata",
  Mumbai: "Asia/Kolkata",
  "New Delhi": "Asia/Kolkata",
  Kathmandu: "Asia/Kathmandu",
  Dhaka: "Asia/Dhaka",
  "Sri Jayawardenepura": "Asia/Colombo",
  Almaty: "Asia/Almaty",
  Astana: "Asia/Almaty",
  Novosibirsk: "Asia/Novosibirsk",
  Rangoon: "Asia/Rangoon",
  Bangkok: "Asia/Bangkok",
  Hanoi: "Asia/Bangkok",
  Jakarta: "Asia/Jakarta",
  Krasnoyarsk: "Asia/Krasnoyarsk",
  Beijing: "Asia/Shanghai",
  Chongqing: "Asia/Chongqing",
  "Hong Kong": "Asia/Hong_Kong",
  Urumqi: "Asia/Urumqi",
  "Kuala Lumpur": "Asia/Kuala_Lumpur",
  Singapore: "Asia/Singapore",
  Taipei: "Asia/Taipei",
  Perth: "Australia/Perth",
  Irkutsk: "Asia/Irkutsk",
  Ulaanbaatar: "Asia/Ulaanbaatar",
  Seoul: "Asia/Seoul",
  Osaka: "Asia/Tokyo",
  Sapporo: "Asia/Tokyo",
  Tokyo: "Asia/Tokyo",
  Yakutsk: "Asia/Yakutsk",
  Darwin: "Australia/Darwin",
  Adelaide: "Australia/Adelaide",
  Canberra: "Australia/Canberra",
  Melbourne: "Australia/Melbourne",
  Sydney: "Australia/Sydney",
  Brisbane: "Australia/Brisbane",
  Hobart: "Australia/Hobart",
  Vladivostok: "Asia/Vladivostok",
  Guam: "Pacific/Guam",
  "Port Moresby": "Pacific/Port_Moresby",
  Magadan: "Asia/Magadan",
  Srednekolymsk: "Asia/Srednekolymsk",
  "Solomon Is.": "Pacific/Guadalcanal",
  "New Caledonia": "Pacific/Noumea",
  Fiji: "Pacific/Fiji",
  Kamchatka: "Asia/Kamchatka",
  "Marshall Is.": "Pacific/Majuro",
  Auckland: "Pacific/Auckland",
  Wellington: "Pacific/Auckland",
  "Nuku'alofa": "Pacific/Tongatapu",
  "Tokelau Is.": "Pacific/Fakaofo",
  "Chatham Is.": "Pacific/Chatham",
  Samoa: "Pacific/Apia",
};

/**
 * The tzdata backward-compatibility links, restricted to the identifiers
 * `Intl.Locale#getTimeZones` reports for some country, each mapped to the
 * canonical zone it links to.
 *
 * `TZInfo::Country#zone_identifiers` — what `load_country_zones`
 * (time_zone.rb:275) actually reads — answers only canonical zones, so
 * `TZInfo::Country.get("VA").zone_identifiers` is `["Europe/Rome"]`. ECMA-402's
 * country table answers the link name instead (`Europe/Vatican`), and
 * `Europe/Rome` is a MAPPING value while `Europe/Vatican` is not, so without
 * this table `countryZones("va")` takes `create(tz_id)` and answers an
 * IANA-named zone where Rails answers the Rails-named `Rome`. The runtime
 * exposes no link table of its own —
 * `Intl.DateTimeFormat#resolvedOptions().timeZone` echoes the link name back
 * unchanged on node 24 — so it is carried here rather than derived.
 *
 * Regenerated by `scripts/generate-canonical-zone-identifiers.ts`, which
 * `scripts/generate-canonical-zone-identifiers.test.ts` reruns so a tzdata or
 * ICU move that invalidates the table shows up as a red test rather than as a
 * silent change in what `countryZones` answers.
 */

const CANONICAL_ZONE_IDENTIFIERS: Record<string, string> = {
  "Africa/Accra": "Africa/Abidjan",
  "Africa/Addis_Ababa": "Africa/Nairobi",
  "Africa/Asmera": "Africa/Nairobi",
  "Africa/Bamako": "Africa/Abidjan",
  "Africa/Bangui": "Africa/Lagos",
  "Africa/Banjul": "Africa/Abidjan",
  "Africa/Blantyre": "Africa/Maputo",
  "Africa/Brazzaville": "Africa/Lagos",
  "Africa/Bujumbura": "Africa/Maputo",
  "Africa/Conakry": "Africa/Abidjan",
  "Africa/Dakar": "Africa/Abidjan",
  "Africa/Dar_es_Salaam": "Africa/Nairobi",
  "Africa/Djibouti": "Africa/Nairobi",
  "Africa/Douala": "Africa/Lagos",
  "Africa/Freetown": "Africa/Abidjan",
  "Africa/Gaborone": "Africa/Maputo",
  "Africa/Harare": "Africa/Maputo",
  "Africa/Kampala": "Africa/Nairobi",
  "Africa/Kigali": "Africa/Maputo",
  "Africa/Kinshasa": "Africa/Lagos",
  "Africa/Libreville": "Africa/Lagos",
  "Africa/Lome": "Africa/Abidjan",
  "Africa/Luanda": "Africa/Lagos",
  "Africa/Lubumbashi": "Africa/Maputo",
  "Africa/Lusaka": "Africa/Maputo",
  "Africa/Malabo": "Africa/Lagos",
  "Africa/Maseru": "Africa/Johannesburg",
  "Africa/Mbabane": "Africa/Johannesburg",
  "Africa/Mogadishu": "Africa/Nairobi",
  "Africa/Niamey": "Africa/Lagos",
  "Africa/Nouakchott": "Africa/Abidjan",
  "Africa/Ouagadougou": "Africa/Abidjan",
  "Africa/Porto-Novo": "Africa/Lagos",
  "America/Anguilla": "America/Puerto_Rico",
  "America/Antigua": "America/Puerto_Rico",
  "America/Aruba": "America/Puerto_Rico",
  "America/Blanc-Sablon": "America/Puerto_Rico",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
  "America/Catamarca": "America/Argentina/Catamarca",
  "America/Cayman": "America/Panama",
  "America/Coral_Harbour": "America/Panama",
  "America/Cordoba": "America/Argentina/Cordoba",
  "America/Creston": "America/Phoenix",
  "America/Curacao": "America/Puerto_Rico",
  "America/Dominica": "America/Puerto_Rico",
  "America/Godthab": "America/Nuuk",
  "America/Grenada": "America/Puerto_Rico",
  "America/Guadeloupe": "America/Puerto_Rico",
  "America/Indianapolis": "America/Indiana/Indianapolis",
  "America/Jujuy": "America/Argentina/Jujuy",
  "America/Kralendijk": "America/Puerto_Rico",
  "America/Louisville": "America/Kentucky/Louisville",
  "America/Lower_Princes": "America/Puerto_Rico",
  "America/Marigot": "America/Puerto_Rico",
  "America/Mendoza": "America/Argentina/Mendoza",
  "America/Montserrat": "America/Puerto_Rico",
  "America/Nassau": "America/Toronto",
  "America/Port_of_Spain": "America/Puerto_Rico",
  "America/St_Barthelemy": "America/Puerto_Rico",
  "America/St_Kitts": "America/Puerto_Rico",
  "America/St_Lucia": "America/Puerto_Rico",
  "America/St_Thomas": "America/Puerto_Rico",
  "America/St_Vincent": "America/Puerto_Rico",
  "America/Tortola": "America/Puerto_Rico",
  "Antarctica/DumontDUrville": "Pacific/Port_Moresby",
  "Antarctica/McMurdo": "Pacific/Auckland",
  "Antarctica/Syowa": "Asia/Riyadh",
  "Arctic/Longyearbyen": "Europe/Berlin",
  "Asia/Aden": "Asia/Riyadh",
  "Asia/Bahrain": "Asia/Qatar",
  "Asia/Brunei": "Asia/Kuching",
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Kuala_Lumpur": "Asia/Singapore",
  "Asia/Kuwait": "Asia/Riyadh",
  "Asia/Muscat": "Asia/Dubai",
  "Asia/Phnom_Penh": "Asia/Bangkok",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Vientiane": "Asia/Bangkok",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "Atlantic/Reykjavik": "Africa/Abidjan",
  "Atlantic/St_Helena": "Africa/Abidjan",
  "Europe/Amsterdam": "Europe/Brussels",
  "Europe/Bratislava": "Europe/Prague",
  "Europe/Busingen": "Europe/Zurich",
  "Europe/Copenhagen": "Europe/Berlin",
  "Europe/Guernsey": "Europe/London",
  "Europe/Isle_of_Man": "Europe/London",
  "Europe/Jersey": "Europe/London",
  "Europe/Kiev": "Europe/Kyiv",
  "Europe/Ljubljana": "Europe/Belgrade",
  "Europe/Luxembourg": "Europe/Brussels",
  "Europe/Mariehamn": "Europe/Helsinki",
  "Europe/Monaco": "Europe/Paris",
  "Europe/Oslo": "Europe/Berlin",
  "Europe/Podgorica": "Europe/Belgrade",
  "Europe/San_Marino": "Europe/Rome",
  "Europe/Sarajevo": "Europe/Belgrade",
  "Europe/Skopje": "Europe/Belgrade",
  "Europe/Stockholm": "Europe/Berlin",
  "Europe/Vaduz": "Europe/Zurich",
  "Europe/Vatican": "Europe/Rome",
  "Europe/Zagreb": "Europe/Belgrade",
  "Indian/Antananarivo": "Africa/Nairobi",
  "Indian/Christmas": "Asia/Bangkok",
  "Indian/Cocos": "Asia/Yangon",
  "Indian/Comoro": "Africa/Nairobi",
  "Indian/Kerguelen": "Indian/Maldives",
  "Indian/Mahe": "Asia/Dubai",
  "Indian/Mayotte": "Africa/Nairobi",
  "Indian/Reunion": "Asia/Dubai",
  "Pacific/Enderbury": "Pacific/Kanton",
  "Pacific/Funafuti": "Pacific/Tarawa",
  "Pacific/Majuro": "Pacific/Tarawa",
  "Pacific/Midway": "Pacific/Pago_Pago",
  "Pacific/Ponape": "Pacific/Guadalcanal",
  "Pacific/Saipan": "Pacific/Guam",
  "Pacific/Truk": "Pacific/Port_Moresby",
  "Pacific/Wake": "Pacific/Tarawa",
  "Pacific/Wallis": "Pacific/Tarawa",
};

/**
 * Per-country membership tzdata's `zone1970.tab` records and ECMA-402's
 * country table does not, keyed by Alpha2 code.
 *
 * `TZInfo::Country#zone_identifiers` — what `load_country_zones`
 * (time_zone.rb:275) reads — is `zone1970.tab`, which lists a zone under every
 * country that observes it: `Asia/Singapore` is Antarctica's summer zone,
 * `Asia/Tokyo` covers Australia's Antarctic bases, `Asia/Bangkok` covers
 * northwestern Vietnam. CLDR's table names one country per zone, so
 * `Intl.Locale#getTimeZones` omits these five and `countryZones` would answer a
 * SHORTER list than Rails for `aq`/`au`/`ru`/`tf`/`vn`. Unlike
 * {@link CANONICAL_ZONE_IDENTIFIERS} this is not a link-resolution gap — the
 * two tables genuinely disagree about membership — so no runtime lookup can
 * reconcile it and the rows are carried here, each confirmed against
 * `TZInfo::Country.get(code).zone_identifiers` on tzinfo 2.x.
 *
 * `BV` and `HM` carry an EMPTY list: `zone1970.tab` knows both codes and files
 * no zone under either, so `TZInfo::Country.get("bv").zone_identifiers` is `[]`
 * and Rails answers `[]`. `getTimeZones` reports them the same way it reports a
 * code it does not know, so a row here is also what separates "known, zoneless"
 * from the `Country.get` raise.
 */
const COUNTRY_ZONE_IDENTIFIER_ADDITIONS: Record<string, string[]> = {
  AQ: ["Asia/Singapore"],
  AU: ["Asia/Tokyo"],
  BV: [],
  HM: [],
  RU: ["Europe/Simferopol"],
  TF: ["Asia/Dubai"],
  VN: ["Asia/Bangkok"],
};

/**
 * `Intl.Locale#getTimeZones` is ECMA-402's IANA country→zone table — the data
 * `TZInfo::Country#zone_identifiers` reads — and is shipped by every runtime
 * trails targets, but TypeScript's `lib.es5`/`lib.esnext.intl` do not declare
 * it yet. Type-only; there is no runtime shim.
 */
declare global {
  namespace Intl {
    interface Locale {
      getTimeZones(): string[] | undefined;
    }
  }
}

/** `UTC_OFFSET_WITH_COLON` (time_zone.rb:187), a `private_constant`. */
const UTC_OFFSET_WITH_COLON = "%s%02d:%02d";
/** `UTC_OFFSET_WITHOUT_COLON` (time_zone.rb:188), the same with the colon out. */
const UTC_OFFSET_WITHOUT_COLON = UTC_OFFSET_WITH_COLON.replaceAll(":", "");

const zoneCache = new Map<string, TimeZone>();
/** `@zones` (time_zone.rb:224). */
let zones: TimeZone[] | null = null;
/** `@country_zones` (time_zone.rb:260), a `Concurrent::Map` keyed by Alpha2 code. */
const countryZonesMemo = new Map<string, TimeZone[]>();
/** `@zones_map` (time_zone.rb:287), the memo `zones_map` reads through. */
let zonesMapMemo: Record<string, TimeZone> | null = null;

/**
 * Stands in for `TZInfo::InvalidTimezoneIdentifier` (`tzinfo/timezone.rb:26`,
 * a `StandardError`), which `find_tzinfo`'s `TZInfo::Timezone.get`
 * (time_zone.rb:208) raises for an identifier the zone database does not know
 * — `raise InvalidTimezoneIdentifier, "Invalid identifier: #{identifier}"`
 * (`tzinfo/data_source.rb:321`), whence the message — and which `[]` rescues by
 * class (time_zone.rb:239-241). trails resolves zones through `Intl`, so the
 * raise site is ours, but the class has to exist for `[]` to catch that one
 * failure rather than every throw the probe could produce.
 *
 * @noRailsEquivalent PERMANENT — the class belongs to the TZInfo gem, not to
 *   Rails, and trails resolves zones through the runtime's own `Intl` database
 *   rather than TZInfo. Rails names the class (time_zone.rb:239), so the port
 *   needs a stand-in for it; no amount of further porting produces a Rails
 *   file for it to live in.
 */
export class InvalidTimezoneIdentifier extends Error {
  override name = "InvalidTimezoneIdentifier";
}

/**
 * `Object#inspect`, for the one place Rails interpolates it (time_zone.rb:249).
 * Ruby dispatches per class — `nil.inspect` is `"nil"`, `{}.inspect` is `"{}"`,
 * `[1, 2].inspect` is `"[1, 2]"` — so `String(arg)`, which renders every object
 * as `[object Object]`, loses the distinction the message exists to draw.
 *
 * A JS plain object is the Hash analogue and takes `Hash#inspect`'s `=>` form.
 * `Object.new` has no JS counterpart to be told apart from it, so a non-plain
 * object falls back to `#<Class>`: Ruby's `#<Object:0x…>` without the heap
 * address, which is allocator state no port can reproduce.
 */
function inspect(value: unknown): string {
  if (value === null || value === undefined) return "nil";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(inspect).join(", ")}]`;
  if (typeof value === "object") {
    const proto = Object.getPrototypeOf(value) as object | null;
    if (proto !== Object.prototype && proto !== null) {
      return `#<${(value.constructor as { name?: string } | undefined)?.name ?? "Object"}>`;
    }
    const pairs = Object.entries(value).map(([k, v]) => `${inspect(k)}=>${inspect(v)}`);
    return `{${pairs.join(", ")}}`;
  }
  return String(value);
}

/**
 * Get timezone abbreviation and offset for a given IANA zone at a specific instant.
 */
function toDate(at: Date | Temporal.Instant): Date {
  return at instanceof Date ? at : new Date(at.epochMilliseconds);
}

function getZoneInfo(
  ianaName: string,
  date: Date,
): { abbreviation: string; utcOffsetSeconds: number } {
  // Use Intl to get the abbreviation
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: ianaName,
    timeZoneName: "short",
  });
  const parts = formatter.formatToParts(date);
  const tzPart = parts.find((p) => p.type === "timeZoneName");
  const abbreviation = tzPart?.value ?? ianaName;

  // Calculate UTC offset by comparing local components to UTC.
  // We use a clean epoch-aligned time to avoid sub-second rounding issues.
  const roundedDate = new Date(Math.floor(date.getTime() / 60000) * 60000);

  const localFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: ianaName,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const localParts = localFormatter.formatToParts(roundedDate);
  const get = (type: string) => parseInt(localParts.find((p) => p.type === type)?.value ?? "0", 10);

  const localYear = get("year");
  const localMonth = get("month");
  const localDay = get("day");
  let localHour = get("hour");
  if (localHour === 24) localHour = 0; // midnight edge case
  const localMinute = get("minute");
  const localSecond = get("second");

  // Create a UTC date from local components to find the offset
  const localAsUtc = Date.UTC(
    localYear,
    localMonth - 1,
    localDay,
    localHour,
    localMinute,
    localSecond,
  );
  const utcOffsetSeconds = Math.round((localAsUtc - roundedDate.getTime()) / 1000) || 0;

  return { abbreviation, utcOffsetSeconds };
}

/**
 * Get local date components for a given IANA timezone and UTC instant.
 */
export function getLocalComponents(
  ianaName: string,
  utcDate: Date,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: ianaName,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hour12: false,
  } as Intl.DateTimeFormatOptions);
  const parts = formatter.formatToParts(utcDate);
  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);

  let hour = get("hour");
  if (hour === 24) hour = 0;

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour,
    minute: get("minute"),
    second: get("second"),
    millisecond: utcDate.getMilliseconds(), // sub-second preserved from UTC
  };
}

/**
 * The slice of `TZInfo::TimezonePeriod` Rails reads through
 * `ActiveSupport::TimeWithZone#period` — `dst?` (time_with_zone.rb:95),
 * `observed_utc_offset` (:112) and `abbreviation` (:134). TZInfo is a gem, not
 * Rails, so only the three members the Rails source names are modelled; each
 * one is resolved off {@link TimeZone} at the instant the period covers, which
 * is what `time_zone.period_for_utc(@utc)` hands back.
 *
 * @noRailsEquivalent PERMANENT — TZInfo is a gem, not Rails, so
 *   `TimezonePeriod` and its `observed_utc_offset` reader have no counterpart
 *   under vendor/rails and no amount of further porting produces one. Rails
 *   names the object (`TimeWithZone#period`, time_with_zone.rb:72-74) and reads
 *   exactly three members off it — `dst?` (:95), `observed_utc_offset` (:112),
 *   `abbreviation` (:134) — so the port needs a stand-in for it, the same
 *   position `InvalidTimezoneIdentifier` above is in.
 */
export class TimezonePeriod {
  readonly abbreviation: string;
  readonly observedUtcOffset: number;
  private readonly _dst: boolean;

  constructor(abbreviation: string, observedUtcOffset: number, dst: boolean) {
    this.abbreviation = abbreviation;
    this.observedUtcOffset = observedUtcOffset;
    this._dst = dst;
  }

  /** Mirrors `TZInfo::TimezonePeriod#dst?`. */
  isDst(): boolean {
    return this._dst;
  }
}

/**
 * Stands in for `TZInfo::PeriodNotFound` (`tzinfo/timezone.rb`), which
 * `TZInfo::Timezone#period_for_local` raises for a local time that does not
 * exist in the zone (the spring-forward gap) — the failure Rails'
 * `period_for_local` (time_zone.rb:559-561) lets through.
 *
 * @noRailsEquivalent PERMANENT — the class belongs to the TZInfo gem, not to
 *   Rails, exactly as {@link InvalidTimezoneIdentifier} above does.
 */
export class PeriodNotFound extends Error {
  override name = "PeriodNotFound";
}

/**
 * Stands in for `TZInfo::AmbiguousTime`, which `TZInfo::Timezone#period_for_local`
 * raises for a local time the `dst` argument does not resolve and no block was
 * given for — the failure `local_to_utc` (time_zone.rb:551-552, which passes no
 * block) lets through, and which `period_for_local` (:559-561) deliberately
 * avoids by passing `{ |periods| periods.last }`.
 *
 * @noRailsEquivalent PERMANENT — the class belongs to the TZInfo gem, not to
 *   Rails, exactly as {@link PeriodNotFound} above does.
 */
export class AmbiguousTime extends Error {
  override name = "AmbiguousTime";
}

/**
 * Stands in for `TZInfo::Timezone`, the object `TimeZone#tzinfo` holds
 * (time_zone.rb:312) and delegates every period lookup and conversion to
 * (`utc_to_local` :541, `local_to_utc` :552, `period_for_utc` :555,
 * `period_for_local` :559, `periods_for_local` :563, `abbr` :567, `dst?` :571).
 * trails resolves zones through the runtime's own `Intl` database rather than
 * TZInfo, so a zone is its IANA identifier plus the lookups computed off it.
 *
 * @noRailsEquivalent PERMANENT — TZInfo is a gem, not Rails, so there is no
 *   file under vendor/rails for `Timezone` to be ported from; Rails names the
 *   object and calls these methods on it, so the port needs a stand-in, the
 *   same position {@link TimezonePeriod} and {@link InvalidTimezoneIdentifier}
 *   are in.
 */
export class Timezone {
  /**
   * `TZInfo::Timezone.get(identifier)` — resolve-or-raise. ECMA-402 mandates a
   * RangeError for a `timeZone` the runtime does not know, and only for that,
   * so it is the one failure standing in for `InvalidTimezoneIdentifier`
   * (`tzinfo/data_source.rb:321`, whence the message); anything else out of the
   * probe is a different fault and propagates.
   */
  static get(identifier: string): Timezone {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: identifier });
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      throw new InvalidTimezoneIdentifier(`Invalid identifier: ${identifier}`);
    }
    return new Timezone(identifier);
  }

  readonly identifier: string;

  constructor(identifier: string) {
    this.identifier = identifier;
  }

  /** `TZInfo::Timezone#name`, which `encode_with` reads (time_zone.rb:579). */
  get name(): string {
    return this.identifier;
  }

  toString(): string {
    return this.identifier;
  }

  /** `TZInfo::Timezone#abbr`. */
  abbr(time: Date | Temporal.Instant): string {
    return getZoneInfo(this.identifier, toDate(time)).abbreviation;
  }

  /** The observed offset, in seconds, at a UTC instant. */
  observedUtcOffset(time: Date | Temporal.Instant): number {
    return getZoneInfo(this.identifier, toDate(time)).utcOffsetSeconds;
  }

  /** `TZInfo::Timezone#dst?`. */
  isDst(time: Date | Temporal.Instant): boolean {
    // Compare offset at this date vs January (standard time for Northern hemisphere)
    // and July (standard time for Southern hemisphere). If current offset differs
    // from the minimum offset, DST is in effect.
    const d = toDate(time);
    const jan = new Date(d.getFullYear(), 0, 1);
    const jul = new Date(d.getFullYear(), 6, 1);
    const janOffset = getZoneInfo(this.identifier, jan).utcOffsetSeconds;
    const julOffset = getZoneInfo(this.identifier, jul).utcOffsetSeconds;
    const currentOffset = getZoneInfo(this.identifier, d).utcOffsetSeconds;
    const standardOffset = Math.min(janOffset, julOffset);
    return currentOffset !== standardOffset;
  }

  /** `TZInfo::Timezone#period_for_utc`. */
  periodForUtc(time: Date | Temporal.Instant): TimezonePeriod {
    const d = toDate(time);
    return new TimezonePeriod(this.abbr(d), this.observedUtcOffset(d), this.isDst(d));
  }

  /**
   * `TZInfo::Timezone#periods_for_local`: the periods a LOCAL time falls in —
   * one ordinarily, two where the clocks went back and the local time is
   * ambiguous, none where they went forward and it does not exist. `time`
   * carries the wall clock in its UTC fields, the shape `local_to_utc` and
   * `period_for_local` take. Candidate offsets are ordered by the UTC instant
   * each implies — the larger offset is the earlier UTC — which is the order
   * TZInfo hands the periods back in, and what makes Rails' `periods.last` the
   * standard-time one.
   */
  periodsForLocal(time: Date | Temporal.Instant): TimezonePeriod[] {
    const localMs = toDate(time).getTime();
    const DAY = 86_400_000;
    const around = [
      getZoneInfo(this.identifier, new Date(localMs - DAY)).utcOffsetSeconds,
      getZoneInfo(this.identifier, new Date(localMs + DAY)).utcOffsetSeconds,
    ];
    const candidates = [...new Set(around)].sort((a, b) => b - a);
    const periods: TimezonePeriod[] = [];
    for (const offset of candidates) {
      const utc = new Date(localMs - offset * 1000);
      if (getZoneInfo(this.identifier, utc).utcOffsetSeconds === offset) {
        periods.push(this.periodForUtc(utc));
      }
    }
    return periods;
  }

  /**
   * `TZInfo::Timezone#period_for_local(time, dst, &block)`: a single period is
   * returned as is; a local time in the gap raises; an ambiguous one is
   * resolved by `dst` when exactly one period matches it, and otherwise handed
   * to the block — which is how Rails' `periods.last` (time_zone.rb:560) gets
   * called.
   */
  periodForLocal(
    time: Date | Temporal.Instant,
    dst: boolean | null = true,
    block?: (periods: TimezonePeriod[]) => TimezonePeriod,
  ): TimezonePeriod {
    const periods = this.periodsForLocal(time);
    if (periods.length === 1) return periods[0];
    if (periods.length === 0) {
      throw new PeriodNotFound(
        `${toDate(time).toISOString().slice(0, 19)} is not valid for ${this.identifier}`,
      );
    }
    if (dst !== null) {
      const matching = periods.filter((period) => period.isDst() === dst);
      if (matching.length === 1) return matching[0];
    }
    if (block) return block(periods);
    throw new AmbiguousTime(
      `${toDate(time).toISOString().slice(0, 19)} is an ambiguous local time for ${this.identifier}`,
    );
  }

  /**
   * `TZInfo::Timezone#utc_to_local`: as of tzinfo 2 this is the local time
   * carrying a non-zero UTC offset, which a `Temporal.ZonedDateTime` is.
   */
  utcToLocal(time: Date | Temporal.Instant): Temporal.ZonedDateTime {
    return instantFrom(toDate(time)).toZonedDateTimeISO(this.identifier);
  }

  /**
   * `TZInfo::Timezone#local_to_utc`: the UTC instant simultaneous with the
   * wall clock `time` carries. No block, as Rails' `local_to_utc`
   * (time_zone.rb:551-552) passes none — an ambiguity `dst` cannot resolve
   * raises {@link AmbiguousTime} rather than being settled for the caller.
   */
  localToUtc(time: Date | Temporal.Instant, dst: boolean | null = true): Date {
    const localMs = toDate(time).getTime();
    const period = this.periodForLocal(time, dst);
    return new Date(localMs - period.observedUtcOffset * 1000);
  }
}

export class TimeZone {
  readonly name: string;
  readonly tzinfo: Timezone;
  /** `@utc_offset` (time_zone.rb:311), which {@link utcOffset} reads first. */
  readonly #utcOffset: number | null;

  /**
   * `initialize(name, utc_offset = nil, tzinfo = nil)` (time_zone.rb:309-313):
   * a caller holding the resolved zone hands it over rather than making
   * `find_tzinfo` re-resolve it (`load_country_zones`, time_zone.rb:278).
   */
  constructor(name: string, utcOffset: number | null = null, tzinfo: Timezone | null = null) {
    this.name = name;
    this.#utcOffset = utcOffset;
    this.tzinfo = tzinfo ?? TimeZone.findTzinfo(name);
  }

  /**
   * The port of `ActiveSupport::TimeZone.[]` (time_zone.rb:232-250): a Rails
   * name or IANA identifier, a `TimeZone`, or a `Numeric`/`Duration` UTC
   * offset. `null` for a name that resolves to no zone (Ruby's
   * `rescue TZInfo::InvalidTimezoneIdentifier; nil`, time_zone.rb:239-241) and
   * for an offset no zone matches (`all.find`, time_zone.rb:246); the only
   * raise is the wrong-class arm at time_zone.rb:249. The string arm is
   * `@lazy_zones_map[arg] ||= create(arg)` under its
   * `rescue TZInfo::InvalidTimezoneIdentifier; nil` (time_zone.rb:237-241).
   *
   * A `Duration` argument reads its seconds through `inSeconds()`, standing in
   * for Ruby's `arg.abs` / `arg.to_i` delegating to `@value` — trails' Duration
   * derives totals from `parts` and carries no `@value`.
   */
  /**
   * Assumes self represents an offset from UTC in seconds (as returned from
   * `Time#utc_offset`) and turns this into an +HH:MM formatted string.
   *
   * Mirrors: `TimeZone.seconds_to_utc_offset` (time_zone.rb:199-205). Ruby's
   * `format % [sign, hours, minutes]` is the substitution the three `replace`
   * calls make; `String#%` has no TypeScript counterpart, and the format string
   * is the private constant Rails reads it out of.
   */
  static secondsToUtcOffset(seconds: number, colon = true): string {
    const format = colon ? UTC_OFFSET_WITH_COLON : UTC_OFFSET_WITHOUT_COLON;
    const sign = seconds < 0 ? "-" : "+";
    const hours = Math.trunc(Math.abs(seconds) / 3600);
    const minutes = Math.trunc((Math.abs(seconds) % 3600) / 60);
    return format
      .replace("%s", sign)
      .replace("%02d", String(hours).padStart(2, "0"))
      .replace("%02d", String(minutes).padStart(2, "0"));
  }

  static find(arg: unknown): TimeZone | null {
    if (arg instanceof TimeZone) return arg;
    if (typeof arg === "string") {
      const cached = zoneCache.get(arg);
      if (cached) return cached;
      let tz: TimeZone;
      try {
        tz = TimeZone.create(arg);
      } catch (error) {
        if (!(error instanceof InvalidTimezoneIdentifier)) throw error;
        return null;
      }
      zoneCache.set(arg, tz);
      return tz;
    }
    if (typeof arg === "number" || arg instanceof Duration) {
      let seconds = arg instanceof Duration ? arg.inSeconds() : arg;
      if (Math.abs(seconds) <= 13) seconds *= 3600;
      return TimeZone.all().find((z) => z.utcOffset === Math.trunc(seconds)) ?? null;
    }
    throw new ArgumentError(`invalid argument to TimeZone[]: ${inspect(arg)}`);
  }

  /**
   * `find_tzinfo(name)` — `TZInfo::Timezone.get(MAPPING[name] || name)`
   * (time_zone.rb:207-209), through the {@link Timezone} stand-in.
   */
  static findTzinfo(name: string): Timezone {
    return Timezone.get(MAPPING[name] ?? name);
  }
  /**
   * `alias_method :create, :new` (time_zone.rb:211) — the allocator, whose
   * `initialize` resolves the zone through `find_tzinfo` (time_zone.rb:208) and
   * so RAISES for a name TZInfo does not know, where `[]` returns `nil` by
   * rescuing `TZInfo::InvalidTimezoneIdentifier` (time_zone.rb:239-241).
   * A bare allocator: the `@lazy_zones_map` memo belongs to `[]`
   * (`@lazy_zones_map[arg] ||= create(arg)`, time_zone.rb:237-238), so every
   * call here builds a fresh instance as Ruby's `new` does.
   */
  static create(
    name: string,
    utcOffset: number | null = null,
    tzinfo: Timezone | null = null,
  ): TimeZone {
    return new TimeZone(name, utcOffset, tzinfo);
  }

  /**
   * Every Rails-named timezone: `@zones ||= zones_map.values.sort`
   * (time_zone.rb:223-225), sorted by `<=>` (time_zone.rb:333-337).
   */
  static all(): TimeZone[] {
    zones ??= Object.values(TimeZone.zonesMap()).sort((a, b) => a.compareTo(b) ?? 0);
    return zones;
  }

  /**
   * Current time in this timezone.
   */
  now(): TimeWithZone {
    // `time_now.utc.in_time_zone(self)` (time_zone.rb:516-518).
    return new TimeWithZone(instantFrom(this.timeNow()), this);
  }

  /**
   * `local(*args)` (time_zone.rb:363-366): build the wall clock with
   * `Time.utc(*args)` and hand it to `TimeWithZone.new(nil, self, time)`, which
   * resolves the LOCAL time through `get_period_and_ensure_valid_local_time`
   * (time_with_zone.rb:570-581) — `period_for_local`, moving the time forward
   * an hour and retrying when it lands in the spring-forward gap — and whose
   * `utc` (time_with_zone.rb:63) is then `incorporate_utc_offset(@time,
   * -utc_offset)`. So the DST-gap and ambiguity policy comes from
   * `periodForLocal` alone, never from a second search here.
   *
   * The constructor call here is the two-argument `(instant, zone)` arm, not
   * Rails' `(nil, self, time)` one: widening `TimeWithZone`'s constructor onto
   * Rails' four-argument shape is
   * `widen-time-with-zone-ctor-onto-rails-four-argument-shape` (RFC 0098),
   * after which this body collapses into that single call. Until then it
   * inlines exactly what that constructor path does, over the same ported
   * members — no second search lives here.
   */
  local(
    year: number,
    month = 1,
    day = 1,
    hour = 0,
    minute = 0,
    second = 0,
    millisecond = 0,
  ): TimeWithZone {
    let time = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
    let period: TimezonePeriod;
    for (;;) {
      try {
        period = this.periodForLocal(time);
        break;
      } catch (error) {
        if (!(error instanceof PeriodNotFound)) throw error;
        time = new Date(time.getTime() + 3_600_000);
      }
    }
    return new TimeWithZone(
      instantFrom(new Date(time.getTime() - period.observedUtcOffset * 1000)),
      this,
    );
  }

  /**
   * `parse(str, now = now())` (time_zone.rb:453-455):
   * `parts_to_time(Date._parse(str, false), now)`.
   */
  parse(str: string, now: TimeWithZone = this.now()): TimeWithZone | undefined {
    return this.partsToTime(RubyDate._parse(str, false), now);
  }

  /**
   * `strptime(str, format, now = now())` (time_zone.rb:487-489):
   * `parts_to_time(DateTime._strptime(str, format), now)`.
   */
  strptime(str: string, format: string, now: TimeWithZone = this.now()): TimeWithZone | undefined {
    return this.partsToTime(RubyDate._strptime(str, format), now);
  }

  /**
   * Create a TimeWithZone from a Unix timestamp.
   */
  at(secondsSinceEpoch: number): TimeWithZone {
    return new TimeWithZone(
      Temporal.Instant.fromEpochMilliseconds(Math.trunc(secondsSinceEpoch * 1000)),
      this,
    );
  }

  /**
   * `@utc_offset || tzinfo.current_period.base_utc_offset`
   * (time_zone.rb:317-319) — the standard-time offset, which does not move
   * when DST is in effect. Intl only reports the offset *at* an instant, so
   * the standard offset is the smaller of the January and July offsets (the
   * derivation `isDst` already uses).
   */
  get utcOffset(): number {
    if (this.#utcOffset !== null) return this.#utcOffset;
    const now = new Date();
    const jan = getZoneInfo(
      this.tzinfo.identifier,
      new Date(now.getFullYear(), 0, 1),
    ).utcOffsetSeconds;
    const jul = getZoneInfo(
      this.tzinfo.identifier,
      new Date(now.getFullYear(), 6, 1),
    ).utcOffsetSeconds;
    return Math.min(jan, jul);
  }

  /**
   * UTC offset at a specific instant.
   */
  utcOffsetAt(date: Date | Temporal.Instant): number {
    return getZoneInfo(this.tzinfo.identifier, toDate(date)).utcOffsetSeconds;
  }

  /**
   * Returns a formatted string of the offset from UTC, or an alternative
   * string if the time zone is already UTC.
   *
   * Mirrors: `TimeZone#formatted_offset` (time_zone.rb:326-328). Ruby's
   * `alternate_utc_string` is any non-nil String — `""` included — so the arm
   * is chosen on presence rather than on truthiness.
   */
  formattedOffset(colon = true, alternateUtcString: string | null = null): string {
    if (this.utcOffset === 0 && alternateUtcString != null) return alternateUtcString;
    return TimeZone.secondsToUtcOffset(this.utcOffset, colon);
  }

  /**
   * Compare this time zone to the parameter. The two are compared first on
   * their offsets, and then by name (time_zone.rb:333-337). Returns
   * `undefined` — Ruby's bare `return` — when the argument does not respond
   * to `utc_offset`.
   */
  compareTo(zone: unknown): number | undefined {
    if (typeof (zone as { utcOffset?: unknown } | null | undefined)?.utcOffset !== "number") {
      return undefined;
    }
    const other = zone as TimeZone;
    let result = this.utcOffset < other.utcOffset ? -1 : this.utcOffset > other.utcOffset ? 1 : 0;
    if (result === 0) result = this.name < other.name ? -1 : this.name > other.name ? 1 : 0;
    return result;
  }

  /**
   * `utc_to_local(time)` (time_zone.rb:541-546). As of tzinfo 2,
   * `tzinfo.utc_to_local` returns a time carrying a non-zero UTC offset — a
   * `Temporal.ZonedDateTime` here. The
   * `ActiveSupport.utc_to_local_returns_utc_offset_times` arm hands that back
   * as is; the legacy arm rebuilds `Time.utc(...)` from its parts, which is a
   * `Date` whose UTC fields carry the local wall clock.
   */
  utcToLocal(time: Date | Temporal.Instant): Temporal.ZonedDateTime | Date {
    const t = this.tzinfo.utcToLocal(time);
    return utcToLocalReturnsUtcOffsetTimes()
      ? t
      : new Date(Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second, t.millisecond));
  }

  /**
   * Adjust the given time to the simultaneous time in UTC
   * (`local_to_utc`, time_zone.rb:550-552) — `tzinfo.local_to_utc(time, dst)`.
   */
  localToUtc(time: Date | Temporal.Instant, dst: boolean | null = true): Date {
    return this.tzinfo.localToUtc(time, dst);
  }

  /**
   * The `TZInfo::TimezonePeriod` covering the given UTC instant
   * (`period_for_utc`, time_zone.rb:555-557), which `TimeWithZone#period`
   * memoizes (time_with_zone.rb:72-74) and reads `dst?` /
   * `observed_utc_offset` / `abbreviation` off.
   */
  /**
   * `parts_to_time(parts, now)` (time_zone.rb:585-608).
   *
   *   def parts_to_time(parts, now)
   *     raise ArgumentError, "invalid date" if parts.nil?
   *     return if parts.empty?
   *
   *     if parts[:seconds]
   *       time = Time.at(parts[:seconds])
   *     else
   *       time = Time.new(
   *         parts.fetch(:year, now.year),
   *         parts.fetch(:mon, now.month),
   *         parts.fetch(:mday, parts[:year] || parts[:mon] ? 1 : now.day),
   *         parts.fetch(:hour, 0),
   *         parts.fetch(:min, 0),
   *         parts.fetch(:sec, 0) + parts.fetch(:sec_fraction, 0),
   *         parts.fetch(:offset, 0)
   *       )
   *     end
   *
   *     if parts[:offset] || parts[:seconds]
   *       TimeWithZone.new(time.utc, self)
   *     else
   *       TimeWithZone.new(nil, self, time)
   *     end
   *   end
   *
   * Ruby's `Time.new(..., offset)` defaults its offset to `0`, so the
   * no-offset arm builds the wall clock as a UTC-flagged `::Time` and hands it
   * to the LOCAL seat of the `TimeWithZone` constructor, which resolves it
   * through `period_for_local` — that is where the DST-gap and ambiguity
   * policy lives. `Temporal.PlainDateTime` is that wall clock here, and it
   * carries the `sec_fraction` down to the nanosecond, which `TimeZone#local`
   * (millisecond arguments) cannot.
   */
  private partsToTime(parts: DateParts | null, now: TimeWithZone): TimeWithZone | undefined {
    if (parts == null) throw new ArgumentError("invalid date");
    if (Object.keys(parts).length === 0) return undefined;

    if (parts.seconds != null) {
      // Ruby's `Time.at(parts[:seconds])` followed by the
      // `TimeWithZone.new(time.utc, self)` arm below is what `TimeZone#at`
      // (time_zone.rb:378-380) already is: `Time.at(*args).utc.in_time_zone(self)`.
      return this.at(
        parts.seconds instanceof Rational ? parts.seconds.toF() : Number(parts.seconds),
      );
    }

    const secFraction = parts.secFraction;
    const nanosecond =
      secFraction == null
        ? 0
        : secFraction instanceof Rational
          ? secFraction.mul(1_000_000_000).toI()
          : Math.trunc(Number(secFraction) * 1_000_000_000);
    // Ruby's `Time.new` raises `ArgumentError, "argument out of range"` for
    // out-of-range components (`Date._parse("9000", false)` is
    // `{mon: 90, mday: 0}`); Temporal answers a `RangeError` for the same.
    let time: Temporal.PlainDateTime;
    try {
      time = Temporal.PlainDateTime.from({
        year: Number("year" in parts ? parts.year : now.year),
        month: "mon" in parts ? parts.mon! : now.month,
        day: "mday" in parts ? parts.mday! : parts.year != null || parts.mon != null ? 1 : now.day,
        hour: "hour" in parts ? parts.hour! : 0,
        minute: "min" in parts ? parts.min! : 0,
        second: "sec" in parts ? parts.sec! : 0,
        millisecond: Math.trunc(nanosecond / 1_000_000),
        microsecond: Math.trunc(nanosecond / 1000) % 1000,
        nanosecond: nanosecond % 1000,
      });
    } catch {
      throw new ArgumentError("argument out of range");
    }

    if (parts.offset != null) {
      const offset = parts.offset instanceof Rational ? parts.offset.toF() : Number(parts.offset);
      return new TimeWithZone(
        time
          .toZonedDateTime("UTC")
          .toInstant()
          .subtract({ nanoseconds: Math.round(offset * 1e9) }),
        this,
      );
    }
    return new TimeWithZone(null, this, time);
  }

  periodForUtc(date: Date | Temporal.Instant): TimezonePeriod {
    return this.tzinfo.periodForUtc(date);
  }

  /**
   * `period_for_local(time, dst = true)` (time_zone.rb:559-561) —
   * `tzinfo.period_for_local(time, dst) { |periods| periods.last }`: the block
   * settles an ambiguous local time `dst` could not, by taking the last period.
   */
  periodForLocal(time: Date | Temporal.Instant, dst: boolean | null = true): TimezonePeriod {
    return this.tzinfo.periodForLocal(time, dst, (periods) => periods[periods.length - 1]);
  }

  /** `periods_for_local(time)` (time_zone.rb:563-565). */
  periodsForLocal(time: Date | Temporal.Instant): TimezonePeriod[] {
    return this.tzinfo.periodsForLocal(time);
  }

  /** `abbr(time)` (time_zone.rb:567) — `tzinfo.abbr(time)`. */
  abbr(time: Date | Temporal.Instant): string {
    return this.tzinfo.abbr(time);
  }

  /** `dst?(time)` (time_zone.rb:571-573) — `tzinfo.dst?(time)`. */
  isDst(time: Date | Temporal.Instant): boolean {
    return this.tzinfo.isDst(time);
  }

  /**
   * Today's date in this timezone.
   */
  today(): { year: number; month: number; day: number } {
    const n = this.now();
    return { year: n.year, month: n.month, day: n.day };
  }

  /**
   * Tomorrow's date in this timezone.
   */
  tomorrow(): { year: number; month: number; day: number } {
    const t = this.today();
    const d = new Date(Date.UTC(t.year, t.month - 1, t.day + 1));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  }

  /**
   * Yesterday's date in this timezone.
   */
  yesterday(): { year: number; month: number; day: number } {
    const t = this.today();
    const d = new Date(Date.UTC(t.year, t.month - 1, t.day - 1));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  }

  /**
   * Parse an ISO 8601 string in this timezone.
   */
  iso8601(str: string | null | undefined): TimeWithZone {
    if (str == null || str.trim() === "") {
      throw new Error("invalid date");
    }
    const trimmed = str.trim();

    // Ordinal date: YYDDD (2-digit year + 3-digit day-of-year)
    const ordinalMatch = /^(\d{2})(\d{3})$/.exec(trimmed);
    if (ordinalMatch) {
      const year = 2000 + parseInt(ordinalMatch[1], 10);
      const dayOfYear = parseInt(ordinalMatch[2], 10);
      if (dayOfYear < 1 || dayOfYear > 366) {
        throw new Error("invalid date");
      }
      const jan1 = new Date(Date.UTC(year, 0, 1));
      const target = new Date(jan1.getTime() + (dayOfYear - 1) * 86400000);
      if (target.getUTCFullYear() !== year) {
        throw new Error("invalid date");
      }
      return this.local(target.getUTCFullYear(), target.getUTCMonth() + 1, target.getUTCDate());
    }

    if (
      !/^\d{4}-?\d{2}-?\d{2}(T\d{2}:?\d{2}(:?\d{2}([.]\d+)?)?)?([Zz]|[+-]\d{2}:?\d{2})?$/.test(
        trimmed,
      )
    ) {
      throw new Error("invalid date");
    }
    return this.parse(trimmed)!;
  }

  /**
   * Parse an RFC 3339 string in this timezone.
   */
  rfc3339(str: string): TimeWithZone {
    const trimmed = str?.trim() ?? "";
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([.]\d+)?(Z|[+-]\d{2}:\d{2})$/.test(trimmed)) {
      throw new Error("invalid date");
    }
    const date = new Date(trimmed);
    if (isNaN(date.getTime())) {
      throw new Error("invalid date");
    }
    return new TimeWithZone(instantFrom(date), this);
  }

  /**
   * Compare #name and TZInfo identifier to a supplied regexp, returning `true`
   * if a match is found (`match?`, time_zone.rb:348-351). Ruby's `re == name`
   * arm is a plain equality against a String `re`; the `Regexp === re` arm
   * tests both spellings.
   */
  isMatch(re: string | RegExp): boolean {
    return (
      re === this.name ||
      re === MAPPING[this.name] ||
      (re instanceof RegExp &&
        // `Regexp#match?(nil)` is false in Ruby; `RegExp#test` coerces
        // `undefined` to the string "undefined" and would match on it.
        (re.test(this.name) || (MAPPING[this.name] != null && re.test(MAPPING[this.name]))))
    );
  }

  /**
   * A convenience method for returning a collection of TimeZone objects
   * for time zones in the USA (time_zone.rb:252-254).
   */
  static usZones(): TimeZone[] {
    return TimeZone.countryZones("us");
  }

  /**
   * A convenience method for returning a collection of TimeZone objects for
   * time zones in the country specified by its ISO 3166-1 Alpha2 code
   * (time_zone.rb:256-262).
   */
  static countryZones(countryCode: string): TimeZone[] {
    const code = countryCode.toUpperCase();
    let memo = countryZonesMemo.get(code);
    if (memo === undefined) {
      memo = TimeZone.loadCountryZones(code);
      countryZonesMemo.set(code, memo);
    }
    return memo;
  }

  /**
   * `clear` (time_zone.rb:264-269): drops all four memos — `@lazy_zones_map`,
   * `@country_zones`, `@zones` and `@zones_map`. Rails' railtie calls it on
   * reload; here it is what gives a caller that has moved tzdata or stubbed
   * `Intl` a clean slate.
   */
  static clear(): void {
    zoneCache.clear();
    countryZonesMemo.clear();
    zones = null;
    zonesMapMemo = null;
  }

  /**
   * `load_country_zones` (time_zone.rb:283-296): every zone identifier the
   * country has, each replaced by the Rails-named zones that MAP to it when
   * MAPPING has any — `gb` answers both `Edinburgh` and `London` for
   * `Europe/London` — and taken as its own IANA-named zone when it does not,
   * which is how `sv` answers `America/El_Salvador`. Then `sort!`, by `<=>`
   * (time_zone.rb:333-337).
   *
   * `TZInfo::Country.get(code).zone_identifiers` is
   * `Intl.Locale#getTimeZones` here — the same IANA country table, read off the
   * runtime's own tzdata rather than off a literal list, so a tzdata update
   * moves the answer as it moves Rails'. It reports link names where TZInfo
   * reports the canonical zone, so each identifier goes through
   * {@link CANONICAL_ZONE_IDENTIFIERS} first. `TZInfo::Country.get` RAISES
   * `TZInfo::InvalidCountryCode` on a code it does not know and
   * `load_country_zones` does not rescue it, so an unknown code raises here
   * too; the class is `Error` rather than TZInfo's, for the same reason as
   * {@link TimeZone.create} — trails resolves zones through `Intl`, which has
   * no TZInfo error hierarchy to port.
   */
  private static loadCountryZones(code: string): TimeZone[] {
    // `getTimeZones` reports an unknown region as no zones rather than by
    // raising, and rejects a malformed one with a `RangeError`; every real
    // Alpha2 code has at least one zone, so both are the raise `Country.get`
    // makes.
    let country: string[] | undefined;
    try {
      country = new Intl.Locale(`und-${code}`).getTimeZones();
    } catch {
      country = undefined;
    }
    const additions = COUNTRY_ZONE_IDENTIFIER_ADDITIONS[code];
    if (country === undefined || (country.length === 0 && additions === undefined)) {
      throw new Error(`Invalid country code: ${code}`);
    }
    const identifiers = country.map((tzId) => CANONICAL_ZONE_IDENTIFIERS[tzId] ?? tzId);
    for (const tzId of additions ?? []) {
      if (!identifiers.includes(tzId)) identifiers.push(tzId);
    }
    return identifiers
      .flatMap((tzId) => {
        if (Object.values(MAPPING).includes(tzId)) {
          const memo: TimeZone[] = [];
          for (const [key, value] of Object.entries(MAPPING)) {
            // `memo << self[key]` is unconditional in Rails: a MAPPING key
            // always resolves, so there is no miss to guard.
            if (value === tzId) memo.push(TimeZone.find(key)!);
          }
          return memo;
        }
        return [TimeZone.create(tzId, null, Timezone.get(tzId))];
      })
      .sort((a, b) => a.compareTo(b) ?? 0);
  }

  /**
   * `zones_map` (time_zone.rb:286-291): every MAPPING name that `[]` resolves,
   * keyed by that name — `zones[name] = timezone if timezone`, hence the
   * nullish guard — under the `@zones_map` memo `all` reads through.
   */
  private static zonesMap(): Record<string, TimeZone> {
    zonesMapMemo ??= Object.keys(MAPPING).reduce<Record<string, TimeZone>>((zones, name) => {
      const timezone = TimeZone.find(name);
      if (timezone != null) zones[name] = timezone;
      return zones;
    }, {});
    return zonesMapMemo;
  }

  /**
   * `time_now` (time_zone.rb:610-612) — `Time.now`, the seam Rails' own time
   * helpers stub. trails stubs the clock through `time-travel.ts`, so
   * `currentTime()` is `Time.now` here.
   */
  private timeNow(): Date {
    return currentTime();
  }

  toString(): string {
    return `(GMT${this.formattedOffset()}) ${this.name}`;
  }

  inspect(): string {
    return this.toString();
  }
}

export { MAPPING as ZONES_MAP };
