import { TZInfo, type Timezone } from "@blazetrails/tzinfo";
import { Time } from "@blazetrails/date";
import { File, env, format, rbObjRespondTo, strip } from "@blazetrails/ruby-compat";
import { getTzone, windowsZoneCodeX } from "./zone.js";

export interface ZonedTimeClass {
  zone(): { tzinfo: Timezone };
}

export const ZONES_ISO8601_REX =
  /(?<=:\d\d)\s*(?:[-+](?:[0-1][0-9]|2[0-4])(?:(?::)?(?:[0-5][0-9]|60))?(?![-+])|Z)/g;

export function listIso8601Zones(s: string): string[] {
  return [...s.matchAll(ZONES_ISO8601_REX)].map((m) => strip(m[0]));
}

export const ZONES_OLSON: string[] = [
  ...TZInfo.Timezone.all()
    .map((z) => z.name)
    .sort(),
  ...Array.from({ length: 13 }, (_, i) => [`UTC-${i}`, `UTC+${i}`]),
]
  .flat()
  .sort((a, b) => a.length - b.length)
  .reverse();

export function extractZone(str: string): [string, string | null] {
  let s = str;

  let zs = ZONES_OLSON.reduce<string[]>((a, z) => {
    const i = s.indexOf(z);
    if (i === -1) return a;
    a.push(z);
    s = s.slice(0, i) + s.slice(i + z.length);
    return a;
  }, []);

  s = s.replace(ZONES_ISO8601_REX, (m) => {
    zs.push(strip(m));
    return "";
  });

  zs = zs.sort((a, b) => str.indexOf(a) - str.indexOf(b));

  return [strip(s), zs.at(-1) ?? null];
}

export function determineLocalTzone(): Timezone | null {
  const etz = env["TZ"] ?? null;

  let tz = etz != null ? getTzone(etz) : null;
  if (tz != null) return tz;

  if (
    rbObjRespondTo(Time, "zone") &&
    rbObjRespondTo((Time as unknown as ZonedTimeClass).zone(), "tzinfo")
  ) {
    tz = (Time as unknown as ZonedTimeClass).zone().tzinfo;
    if (tz != null) return tz;
  }

  try {
    tz = TZInfo.Timezone.get(osTz() as string);
  } catch {
    tz = null;
  }
  if (tz != null) return tz;

  const tzs = determineLocalTzones();
  tz = (etz != null ? tzs.find((z) => z.name === etz) : null) ?? tzs[0] ?? null;
  if (tz != null) return tz;

  const n = Time.now();

  return getTzone(n.zone) || getTzone(n.strftime("%Z%z"));
}

export const zone = determineLocalTzone;

let _osZone: string | null = null;

export const EtOrbi = {
  get _osZone(): string | null {
    return _osZone;
  },
  set _osZone(value: string | null) {
    _osZone = value;
  },
};

let _osTz: string | null = null;

export function osTz(): string | null {
  if (_osZone != null) return _osZone === "" ? null : _osZone;

  return (_osTz ||= debianTz() || centosTz() || osxTz());
}

export function debianTz(): string | null {
  try {
    const path = "/etc/timezone";

    return File.isExist(path) ? strip(File.read(path)) : null;
  } catch {
    return null;
  }
}

export function centosTz(): string | null {
  try {
    const path = "/etc/sysconfig/clock";

    if (File.isExist(path)) {
      const found = File.open(path, "rb", (f) => {
        while (!f.isEof()) {
          const m = String(f.readline()).match(/ZONE="([^"]+)"/);
          if (m != null) return m[1];
        }
        return null;
      });
      if (found != null) return found;
    }

    return null;
  } catch {
    return null;
  }
}

export function osxTz(): string | null {
  try {
    const path = "/etc/localtime";

    return File.isSymlink(path) ? File.readlink(path).split("/").slice(4).join("/") : null;
  } catch {
    return null;
  }
}

export function gatherTzs(): Record<string, string | null> {
  return { debian: debianTz(), centos: centosTz(), osx: osxTz() };
}

/** @missingRailsArgs join — PERMANENT */
export function windowsZoneName(zoneName: string, time: Time): string {
  const twin = Time.utc(time.year, 1, 1);
  const tsum = Time.utc(time.year, 7, 1);

  const tz = TZInfo.Timezone.get(zoneName);
  let tzo = tz.periodForLocal(time).utcTotalOffset;
  const tzop = tzo < 0 ? null : "-";
  tzo = Math.abs(tzo);
  const tzoh = Math.floor(tzo / 3600);
  const tzos0 = tzo % 3600;
  const tzos = tzos0 === 0 ? null : format(":%02d", Math.floor(tzos0 / 60));

  const abbs = [
    ...new Set([
      String(tz.periodForUtc(twin).abbreviation),
      String(tz.periodForUtc(tsum).abbreviation),
    ]),
  ];

  if (/^[A-Z]/.test(abbs[0])) {
    return [abbs[0], tzop, tzoh, tzos, abbs[1]].filter((x) => x != null).join("");
  } else {
    return [windowsZoneCodeX(zoneName), tzop, tzoh, tzos ?? ":00", zoneName]
      .map((x) => (x == null ? "" : String(x)))
      .join("");
  }
}

export function tweakZoneName(name: string): string {
  if (name.match(/./) == null) return name;

  return normalize(name) || unzz(name) || name;
}

/** @internal */
export function normalize(name: string): string | null {
  return ZONE_ALIASES[name.replace(/ Daylight /, " Standard ")] ?? null;
}

/** @internal */
export function unzz(name: string): string | null {
  const m = name.match(/^([A-Z]{3,4})([+-])(\d{1,2}):?(\d{2})?$/);
  if (m == null) return null;

  const abbs = [m[1]];
  const a = m[1];
  if (a.length < 4) abbs.push(`${a}T`);

  const off =
    (m[2] === "+" ? 1 : -1) * (parseInt(m[3], 10) * 3600 + parseInt(m[4] ?? "0", 10) * 60);

  const t = Time.now();
  const twin = Time.utc(t.year, 1, 1);
  const tsum = Time.utc(t.year, 7, 1);

  for (const tz of tzAll()) {
    for (const abb of abbs) {
      let per = tz.periodForUtc(twin);
      if (String(per.abbreviation) === abb && per.utcTotalOffset === off) return tz.name;
      per = tz.periodForUtc(tsum);
      if (String(per.abbreviation) === abb && per.utcTotalOffset === off) return tz.name;
    }
  }

  return null;
}

let _tzWinterSummer: Record<string, Timezone[]> | null = null;

/** @internal */
export function determineLocalTzones(): Timezone[] {
  const tabbs = [
    ...new Set(
      Array.from({ length: 12 }, (_, k) => {
        const t = Time.now().plus((k - 6) * 30 * 24 * 3600);
        return `${String(t.zone)}_${t.utcOffset}`;
      }),
    ),
  ]
    .sort()
    .join("|");

  const t = Time.now();

  const twin = Time.local(t.year, 1, 1);
  const tsum = Time.local(t.year, 7, 1);

  _tzWinterSummer ||= {};

  _tzWinterSummer[tabbs] ||= tzAll().filter((tz) => {
    const pw = tz.periodForLocal(twin);
    const ps = tz.periodForLocal(tsum);
    return (
      tabbs ===
      [
        ...new Set([
          `${pw.abbreviation}_${pw.utcTotalOffset}`,
          `${ps.abbreviation}_${ps.utcTotalOffset}`,
        ]),
      ]
        .sort()
        .join("|")
    );
  });

  return _tzWinterSummer[tabbs];
}

let _customTzs: Record<string, Timezone> | null = null;

/** @internal */
export function customTzs(): Record<string, Timezone> {
  return (_customTzs ||= {});
}

let _tzAll: Timezone[] | null = null;

/** @internal */
export function tzAll(): Timezone[] {
  return (_tzAll ||= TZInfo.Timezone.all());
}

export const ZONE_ALIASES: Record<string, string> = {
  "Coordinated Universal Time": "UTC",
  "Afghanistan Standard Time": "Asia/Kabul",
  "FLE Standard Time": "Europe/Helsinki",
  "Central Europe Standard Time": "Europe/Prague",
  "UTC-11": "Etc/GMT+11",
  "W. Europe Standard Time": "Europe/Rome",
  "W. Central Africa Standard Time": "Africa/Lagos",
  "SA Western Standard Time": "America/La_Paz",
  "Pacific SA Standard Time": "America/Santiago",
  "Argentina Standard Time": "America/Argentina/Buenos_Aires",
  "Caucasus Standard Time": "Asia/Yerevan",
  "AUS Eastern Standard Time": "Australia/Sydney",
  "Azerbaijan Standard Time": "Asia/Baku",
  "Eastern Standard Time": "America/New_York",
  "Arab Standard Time": "Asia/Riyadh",
  "Bangladesh Standard Time": "Asia/Dhaka",
  "Belarus Standard Time": "Europe/Minsk",
  "Romance Standard Time": "Europe/Paris",
  "Central America Standard Time": "America/Belize",
  "Atlantic Standard Time": "Atlantic/Bermuda",
  "Venezuela Standard Time": "America/Caracas",
  "Central European Standard Time": "Europe/Warsaw",
  "South Africa Standard Time": "Africa/Johannesburg",
  "E. South America Standard Time": "America/Sao_Paulo",
  "Central Asia Standard Time": "Asia/Almaty",
  "Singapore Standard Time": "Asia/Singapore",
  "Greenwich Standard Time": "Africa/Monrovia",
  "Cape Verde Standard Time": "Atlantic/Cape_Verde",
  "SE Asia Standard Time": "Asia/Bangkok",
  "SA Pacific Standard Time": "America/Bogota",
  "China Standard Time": "Asia/Shanghai",
  "Myanmar Standard Time": "Asia/Yangon",
  "E. Africa Standard Time": "Africa/Nairobi",
  "Hawaiian Standard Time": "Pacific/Honolulu",
  "E. Europe Standard Time": "Europe/Nicosia",
  "Tokyo Standard Time": "Asia/Tokyo",
  "Egypt Standard Time": "Africa/Cairo",
  "SA Eastern Standard Time": "America/Cayenne",
  "GMT Standard Time": "Europe/London",
  "Fiji Standard Time": "Pacific/Fiji",
  "West Asia Standard Time": "Asia/Tashkent",
  "Georgian Standard Time": "Asia/Tbilisi",
  "GTB Standard Time": "Europe/Athens",
  "Greenland Standard Time": "America/Godthab",
  "West Pacific Standard Time": "Pacific/Guam",
  "Mauritius Standard Time": "Indian/Mauritius",
  "India Standard Time": "Asia/Kolkata",
  "Iran Standard Time": "Asia/Tehran",
  "Arabic Standard Time": "Asia/Baghdad",
  "Israel Standard Time": "Asia/Jerusalem",
  "Jordan Standard Time": "Asia/Amman",
  "UTC+12": "Etc/GMT-12",
  "Korea Standard Time": "Asia/Seoul",
  "Middle East Standard Time": "Asia/Beirut",
  "Central Standard Time (Mexico)": "America/Mexico_City",
  "Ulaanbaatar Standard Time": "Asia/Ulaanbaatar",
  "Morocco Standard Time": "Africa/Casablanca",
  "Namibia Standard Time": "Africa/Windhoek",
  "Nepal Standard Time": "Asia/Kathmandu",
  "Central Pacific Standard Time": "Etc/GMT-11",
  "New Zealand Standard Time": "Pacific/Auckland",
  "Arabian Standard Time": "Asia/Dubai",
  "Pakistan Standard Time": "Asia/Karachi",
  "Paraguay Standard Time": "America/Asuncion",
  "Pacific Standard Time": "America/Los_Angeles",
  "Russian Standard Time": "Europe/Moscow",
  "Samoa Standard Time": "Pacific/Pago_Pago",
  "UTC-02": "Etc/GMT+2",
  "Sri Lanka Standard Time": "Asia/Kolkata",
  "Syria Standard Time": "Asia/Damascus",
  "Taipei Standard Time": "Asia/Taipei",
  "Tonga Standard Time": "Pacific/Tongatapu",
  "Turkey Standard Time": "Asia/Istanbul",
  "Montevideo Standard Time": "America/Montevideo",

  CST5CDT: "CST6CDT",

  "Alaskan Standard Time": "America/Anchorage",
  "Central Standard Time": "America/Chicago",
  "Mountain Standard Time": "America/Denver",
  "US Eastern Standard Time": "America/Indiana/Indianapolis",
  "US Mountain Standard Time": "America/Phoenix",
};
