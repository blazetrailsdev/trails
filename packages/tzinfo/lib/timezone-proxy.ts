import type { Time } from "@blazetrails/date";
import { Timezone } from "./timezone.js";
import type { TimezonePeriod } from "./timezone-period.js";
import type { TimezoneTransition } from "./timezone-transition.js";

export class TimezoneProxy extends Timezone {
  /** @internal */
  private readonly _identifier: string;

  /** @internal */
  private _realTimezone: Timezone | null;

  constructor(identifier: string) {
    super();
    this._identifier = identifier;
    this._realTimezone = null;
  }

  override get identifier(): string {
    return this._realTimezone ? this._realTimezone.identifier : this._identifier;
  }

  override periodFor(time: Time): TimezonePeriod {
    return this.realTimezone().periodForUtc(time);
  }

  override periodsForLocal(localTime: Time): TimezonePeriod[] {
    return this.realTimezone().periodsForLocal(localTime);
  }

  override transitionsUpTo(to: Time, from: Time | null = null): TimezoneTransition[] {
    return this.realTimezone().transitionsUpTo(to, from);
  }

  override canonicalZone(): Timezone {
    return this.realTimezone().canonicalZone();
  }

  // eslint-disable-next-line unused-imports/no-unused-vars
  _dump(limit: number): string {
    return this.identifier;
  }

  static _load(data: string | typeof String.prototype): TimezoneProxy {
    return new TimezoneProxy(data.valueOf());
  }

  /** @internal */
  private realTimezone(): Timezone {
    if (!this._realTimezone) {
      const result = Timezone.get(this._identifier);
      if (Object.isFrozen(this)) return result;
      this._realTimezone = result;
    }

    return this._realTimezone;
  }
}
