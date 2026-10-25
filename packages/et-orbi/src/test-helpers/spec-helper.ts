import "@blazetrails/chronic";
import { TZInfo, type Timezone } from "@blazetrails/tzinfo";
import { Time } from "@blazetrails/date";
import {
  Gem,
  RUBY_PLATFORM,
  env,
  format,
  rbEqual,
  rbModRemoveConst,
  registerConstant,
  registeredConstant,
  setEnv,
} from "@blazetrails/ruby-compat";
import { EtOrbi } from "../et-orbi.js";

declare module "@blazetrails/date" {
  interface Time {
    toDebugS(): string;
  }
}

setEnv("_TZ", env["TZ"]);

registerConstant("Khronic", registeredConstant("Chronic"));
rbModRemoveConst(Object, "Chronic");

EtOrbi._makeInfo();

export function isWindows(): boolean {
  return Gem.isWinPlatform();
}

export function isJruby(): boolean {
  return /java/.test(RUBY_PLATFORM());
}

export function inZone<T>(zoneName: string | null, t: Time, block: () => T): T;
export function inZone<T>(zoneName: string | null, block: () => T): T;
export function inZone<T>(zoneName: string | null, t: Time | (() => T), block?: () => T): T {
  if (typeof t === "function") [t, block] = [Time.now(), t];

  const prevTz = env["TZ"];

  try {
    if (zoneName === ":no_env_tz") {
      setEnv("TZ", undefined);
    } else if (zoneName == null) {
      setEnv("TZ", EtOrbi.osTz() ?? undefined);
    } else {
      if (isWindows()) zoneName = EtOrbi.windowsZoneName(zoneName, t);
      setEnv("TZ", zoneName);
    }

    return block!();
  } finally {
    setEnv("TZ", prevTz);
  }
}

export function timeInZone(
  zoneName: string | null,
  t: string | Time | null = null,
  block?: () => Time,
): Time {
  const determineT = (): Time => {
    if (block) return block();
    else if (typeof t === "string") return Time.parse(t);
    else if (t) return t;
    else return Time.now();
  };

  return inZone(zoneName, determineT(), () => determineT());
}

export function local(...args: Parameters<typeof Time.local>): Time {
  return Time.local(...args);
}

export const lo = local;

export function ltz(tz: string | null, ...args: Parameters<typeof Time.local>): Time {
  return timeInZone(tz, null, () => Time.local(...args));
}

export function selectZones(zs: string[]): Timezone[] {
  return zs.reduce<Timezone[]>((a, z) => {
    const m = z.match(/^win(?:dows)?:(.+)$/);
    const zo = m ? (isWindows() ? TZInfo.Timezone.get(m[1]) : null) : EtOrbi.getTzone(z);
    if (zo) a.push(zo);
    return a;
  }, []);
}

export function selectZoneNames(zs: string[]): string[] {
  return selectZones(zs).map((z) => z.name);
}

export function requireChronic(): void {
  registerConstant("Chronic", registeredConstant("Khronic"));
}

export function unrequireChronic(): void {
  rbModRemoveConst(Object, "Chronic");
}

export function isOneOf(arr: unknown[], actual: unknown): boolean {
  return arr.some((e) => rbEqual(e, actual));
}

Time.prototype.toDebugS = function (this: Time): string {
  let uo = this.utcOffset;
  const uos = uo < 0 ? "-" : "+";
  uo = Math.abs(uo);
  const [uoh, uom] = [Math.floor(uo / 3600), uo % 3600];

  return [
    "t",
    this.strftime("%Y-%m-%d %H:%M:%S"),
    format("%s%02d:%02d", uos, uoh, uom),
    `dst:${this.isdst}`,
  ].join(" ");
};

export class SpecActiveSupportTimeZone {
  readonly z: Timezone;

  constructor(z: Timezone) {
    this.z = z;
  }

  get tzinfo(): Timezone {
    return this.z;
  }

  static make(s: string): SpecActiveSupportTimeZone {
    return new this(TZInfo.Timezone.get(s));
  }
}

export const SpecTime = Time as typeof Time & {
  _zone: string | null;
  activeSupportZone: string | Timezone | null;
};

const originalZone = Object.getOwnPropertyDescriptor(Time.prototype, "zone")!.get!;

let _zone: string | null = null;
let _asZone: SpecActiveSupportTimeZone | null = null;

Object.defineProperty(Time.prototype, "zone", {
  configurable: true,
  get(this: Time) {
    return SpecTime._zone || originalZone.call(this);
  },
});

Object.defineProperties(Time, {
  _zone: {
    configurable: true,
    get: () => _zone,
    set: (v: string | null) => {
      _zone = v;
    },
  },
  activeSupportZone: {
    configurable: true,
    set: (zoneOrZoneName: string | Timezone | null) => {
      setEnv("TZ", undefined);

      let z = zoneOrZoneName;
      if (typeof z === "string") z = TZInfo.Timezone.get(z);

      if (z) {
        _asZone = new SpecActiveSupportTimeZone(z);
        Object.defineProperty(Time, "zone", {
          configurable: true,
          writable: true,
          value: () => _asZone,
        });
      } else {
        delete (Time as { zone?: unknown }).zone;
      }
    },
  },
});
