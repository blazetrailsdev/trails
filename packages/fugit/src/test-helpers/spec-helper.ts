import "@blazetrails/chronic";
import { Time } from "@blazetrails/date";
import {
  Gem,
  Process,
  RUBY_PLATFORM,
  env,
  rbModRemoveConst,
  registerConstant,
  registeredConstant,
  setEnv,
} from "@blazetrails/ruby-compat";
import type { EoTime } from "@blazetrails/et-orbi";
import { TZInfo, type Timezone } from "@blazetrails/tzinfo";
import "../fugit.js";
import { TimeCursor } from "../cron.js";

registerConstant("Khronic", registeredConstant("Chronic"));
rbModRemoveConst(Object, "Chronic");

export function isJruby(): boolean {
  return /java/.test(RUBY_PLATFORM());
}
export function isWindows(): boolean {
  return Gem.isWinPlatform();
}

export function inZone<T>(zoneName: string | null, block: () => T): T {
  const prevTz = env["TZ"];
  try {
    if (zoneName) setEnv("TZ", zoneName);

    return block();
  } finally {
    setEnv("TZ", prevTz);
  }
}

let _asZone: { tzinfo: Timezone } | null = null;

export function inActiveSupportZone<T>(zoneName: string, block: () => T): T {
  const prevTz = env["TZ"];
  try {
    setEnv("TZ", undefined);

    SpecTime._zone = zoneName;
    Object.defineProperty(Time, "zone", {
      configurable: true,
      writable: true,
      value: () => _asZone,
    });

    return block();
  } finally {
    SpecTime._zone = null;
    delete (Time as { zone?: unknown }).zone;

    setEnv("TZ", prevTz);
  }
}

export function requireChronic(): void {
  registerConstant("Chronic", registeredConstant("Khronic"));
}

export function unrequireChronic(): void {
  rbModRemoveConst(Object, "Chronic");
}

export function monow(): number {
  return Process.clockGettime(Process.CLOCK_MONOTONIC);
}

export function doTime<T>(block: () => T): [T, number] {
  const t0 = monow();

  const r = block();

  return [r, monow() - t0];
}

declare module "../cron.js" {
  interface TimeCursor {
    _badInc(i: number): this;
    _originalInc(i: number): this;
  }
}
TimeCursor.prototype._badInc = function (this: TimeCursor, _i: number) {
  const self = this as unknown as { _t: EoTime };
  self._t = self._t.plus(0);
  return this;
};
TimeCursor.prototype._originalInc = TimeCursor.prototype.inc;

export const SpecTime = Time as typeof Time & { _zone: string | null };

Object.defineProperty(Time, "_zone", {
  configurable: true,
  get: () => null,
  set: (name: string | null) => {
    _asZone = name ? { tzinfo: TZInfo.Timezone.get(name) } : null;
  },
});
