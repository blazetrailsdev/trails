/**
 * ActiveSupport::TimeZone — mirrors the Rails API.
 *
 * Uses the built-in Intl API for timezone data, wrapping IANA timezone names.
 */

import { TimeWithZone } from "./time-with-zone.js";

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
  Astana: "Asia/Dhaka",
  Dhaka: "Asia/Dhaka",
  "Sri Jayawardenepura": "Asia/Colombo",
  Almaty: "Asia/Almaty",
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
  Canberra: "Australia/Melbourne",
  Melbourne: "Australia/Melbourne",
  Sydney: "Australia/Sydney",
  Brisbane: "Australia/Brisbane",
  Hobart: "Australia/Hobart",
  Vladivostok: "Asia/Vladivostok",
  Guam: "Pacific/Guam",
  "Port Moresby": "Pacific/Port_Moresby",
  Magadan: "Asia/Magadan",
  Srednekolymsk: "Asia/Srednekolymsk",
  Solomon: "Pacific/Guadalcanal",
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

const zoneCache = new Map<string, TimeZone>();

/**
 * Get timezone abbreviation and offset for a given IANA zone at a specific instant.
 */
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

export class TimeZone {
  readonly name: string;
  readonly tzinfo: string; // IANA name

  constructor(name: string, ianaName?: string) {
    this.name = name;
    this.tzinfo = ianaName ?? name;
  }

  /**
   * Find a timezone by Rails name or IANA identifier.
   */
  static find(name: string): TimeZone {
    if (zoneCache.has(name)) return zoneCache.get(name)!;

    // Check Rails mapping first
    const iana = MAPPING[name];
    if (iana) {
      const tz = new TimeZone(name, iana);
      zoneCache.set(name, tz);
      return tz;
    }

    // Try as IANA name directly — validate by attempting to use it
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: name });
      const tz = new TimeZone(name, name);
      zoneCache.set(name, tz);
      return tz;
    } catch {
      throw new Error(`Invalid time zone: ${name}`);
    }
  }

  /** Alias for find */
  static create(name: string): TimeZone {
    return TimeZone.find(name);
  }

  /** Returns all Rails-named timezones */
  static all(): TimeZone[] {
    return Object.keys(MAPPING).map((name) => TimeZone.find(name));
  }

  /**
   * Current time in this timezone.
   */
  now(): TimeWithZone {
    return new TimeWithZone(new Date(), this);
  }

  /**
   * Create a TimeWithZone from local time components.
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
    // We need to find the UTC instant that corresponds to these local components.
    const wantedMs = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
    const guess = new Date(wantedMs);

    // Get the offset at two candidate UTC times to handle DST transitions
    const info1 = getZoneInfo(this.tzinfo, guess);
    const utc1 = new Date(wantedMs - info1.utcOffsetSeconds * 1000);
    const local1 = getLocalComponents(this.tzinfo, utc1);

    // Check if utc1 maps back to the requested local time
    if (
      local1.year === year &&
      local1.month === month &&
      local1.day === day &&
      local1.hour === hour &&
      local1.minute === minute
    ) {
      return new TimeWithZone(utc1, this);
    }

    // The offset at the computed UTC may differ — try with that offset
    const info2 = getZoneInfo(this.tzinfo, utc1);
    const utc2 = new Date(wantedMs - info2.utcOffsetSeconds * 1000);
    const local2 = getLocalComponents(this.tzinfo, utc2);

    if (
      local2.year === year &&
      local2.month === month &&
      local2.day === day &&
      local2.hour === hour &&
      local2.minute === minute
    ) {
      return new TimeWithZone(utc2, this);
    }

    // Neither candidate maps back — the requested time is in a DST gap.
    // Spring forward: use the earlier UTC (utc1), which the Intl API already
    // adjusted to the post-transition time (e.g., 2:00 AM → 3:00 AM EDT).
    return new TimeWithZone(utc1, this);
  }

  /**
   * Parse a string into a TimeWithZone in this timezone.
   */
  parse(str: string): TimeWithZone {
    const trimmed = str.trim();

    // If string has no timezone info, parse components manually to avoid
    // system timezone interference, then treat as local to this zone
    if (!/[Zz]|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
      // Try to extract date/time components directly
      const match = trimmed.match(
        /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:\.(\d+))?)?)?$/,
      );
      if (match) {
        const y = parseInt(match[1], 10);
        const m = parseInt(match[2], 10);
        const d = parseInt(match[3], 10);
        const h = match[4] ? parseInt(match[4], 10) : 0;
        const min = match[5] ? parseInt(match[5], 10) : 0;
        const s = match[6] ? parseInt(match[6], 10) : 0;
        let ms = 0;
        if (match[7]) {
          ms = parseInt(match[7].padEnd(3, "0").slice(0, 3), 10);
        }
        return this.local(y, m, d, h, min, s, ms);
      }

      // Fall back to Date parser for other formats
      const date = new Date(str);
      if (isNaN(date.getTime())) {
        throw new Error(`Could not parse time: "${str}"`);
      }
      const y = date.getFullYear();
      const m = date.getMonth() + 1;
      const d = date.getDate();
      const h = date.getHours();
      const min = date.getMinutes();
      const s = date.getSeconds();
      const ms = date.getMilliseconds();
      return this.local(y, m, d, h, min, s, ms);
    }

    // String has timezone info — parse and convert the UTC instant to this zone
    const date = new Date(str);
    if (isNaN(date.getTime())) {
      throw new Error(`Could not parse time: "${str}"`);
    }
    return new TimeWithZone(date, this);
  }

  /**
   * Create a TimeWithZone from a Unix timestamp.
   */
  at(secondsSinceEpoch: number): TimeWithZone {
    return new TimeWithZone(new Date(secondsSinceEpoch * 1000), this);
  }

  /**
   * UTC offset in seconds for the current moment.
   */
  get utcOffset(): number {
    return getZoneInfo(this.tzinfo, new Date()).utcOffsetSeconds;
  }

  /**
   * UTC offset at a specific instant.
   */
  utcOffsetAt(date: Date): number {
    return getZoneInfo(this.tzinfo, date).utcOffsetSeconds;
  }

  /**
   * Formatted UTC offset like "+05:30" or "-08:00".
   */
  formattedOffset(colon = true): string {
    const offset = this.utcOffset;
    const sign = offset >= 0 ? "+" : "-";
    const abs = Math.abs(offset);
    const h = String(Math.floor(abs / 3600)).padStart(2, "0");
    const m = String(Math.floor((abs % 3600) / 60)).padStart(2, "0");
    return colon ? `${sign}${h}:${m}` : `${sign}${h}${m}`;
  }

  /**
   * Whether DST is in effect at the given instant.
   */
  isDst(date: Date = new Date()): boolean {
    // Compare offset at this date vs January (standard time for Northern hemisphere)
    // and July (standard time for Southern hemisphere). If current offset differs
    // from the minimum offset, DST is in effect.
    const jan = new Date(date.getFullYear(), 0, 1);
    const jul = new Date(date.getFullYear(), 6, 1);
    const janOffset = getZoneInfo(this.tzinfo, jan).utcOffsetSeconds;
    const julOffset = getZoneInfo(this.tzinfo, jul).utcOffsetSeconds;
    const currentOffset = getZoneInfo(this.tzinfo, date).utcOffsetSeconds;
    const standardOffset = Math.min(janOffset, julOffset);
    return currentOffset !== standardOffset;
  }

  /**
   * Timezone abbreviation at a given instant.
   */
  abbreviation(date: Date = new Date()): string {
    return getZoneInfo(this.tzinfo, date).abbreviation;
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
    if (
      !/^\d{4}-?\d{2}-?\d{2}(T\d{2}:?\d{2}(:?\d{2}([.]\d+)?)?)?([Zz]|[+-]\d{2}:?\d{2})?$/.test(
        trimmed,
      )
    ) {
      throw new Error("invalid date");
    }
    return this.parse(trimmed);
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
    return new TimeWithZone(date, this);
  }

  /**
   * Whether this timezone matches a given identifier.
   */
  match(identifier: string): boolean {
    return this.name === identifier || this.tzinfo === identifier;
  }

  /** US zones */
  static usZones(): TimeZone[] {
    const usNames = [
      "Hawaii",
      "Alaska",
      "Pacific Time (US & Canada)",
      "Arizona",
      "Mountain Time (US & Canada)",
      "Central Time (US & Canada)",
      "Eastern Time (US & Canada)",
      "Indiana (East)",
    ];
    return usNames.map((n) => TimeZone.find(n));
  }

  toString(): string {
    return `(GMT${this.formattedOffset()}) ${this.name}`;
  }

  inspect(): string {
    return this.toString();
  }
}

export { MAPPING as ZONES_MAP };
