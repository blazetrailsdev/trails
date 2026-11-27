import { extend, rbModAppendFeatures } from "@blazetrails/ruby-compat/include";
import { StringDeduper } from "../string-deduper.js";

export interface TimezoneIndexDefinitionHost {
  _timezones: string[];
  _dataTimezones: string[];
  _linkedTimezones: string[];
}

/** @internal */
export const ClassMethods = {
  get dataTimezones(): readonly string[] {
    const host = this as unknown as TimezoneIndexDefinitionHost;
    if (!Object.isFrozen(host._dataTimezones)) {
      host._dataTimezones = Object.freeze(host._dataTimezones.sort()) as string[];
    }
    return host._dataTimezones;
  },

  get linkedTimezones(): readonly string[] {
    const host = this as unknown as TimezoneIndexDefinitionHost;
    if (!Object.isFrozen(host._linkedTimezones)) {
      host._linkedTimezones = Object.freeze(host._linkedTimezones.sort()) as string[];
    }
    return host._linkedTimezones;
  },

  /** @internal */
  timezone(this: TimezoneIndexDefinitionHost, identifier: string): void {
    identifier = StringDeduper.global.dedupe(identifier);
    this._timezones.push(identifier);
    this._dataTimezones.push(identifier);
  },

  /** @internal */
  linkedTimezone(this: TimezoneIndexDefinitionHost, identifier: string): void {
    identifier = StringDeduper.global.dedupe(identifier);
    this._timezones.push(identifier);
    this._linkedTimezones.push(identifier);
  },
};

/** @internal */
export const TimezoneIndexDefinition = { ClassMethods };
Object.defineProperty(TimezoneIndexDefinition, "appendFeatures", {
  value(this: typeof TimezoneIndexDefinition, base: object): void {
    rbModAppendFeatures(base, this);
    extend(base, ClassMethods);
    Object.assign(base, { _timezones: [], _dataTimezones: [], _linkedTimezones: [] });
  },
});
