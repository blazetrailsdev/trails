import { extend, rbModAppendFeatures } from "@blazetrails/ruby-compat";
import { StringDeduper } from "../string-deduper.js";
import { TimezoneIndexDefiner } from "./timezone-index-definer.js";

export interface TimezoneIndexDefinitionHost {
  _dataTimezones: readonly string[];
  _linkedTimezones: readonly string[];
}

/** @internal */
export const ClassMethods = {
  get dataTimezones(): readonly string[] {
    return (this as unknown as TimezoneIndexDefinitionHost)._dataTimezones;
  },

  get linkedTimezones(): readonly string[] {
    return (this as unknown as TimezoneIndexDefinitionHost)._linkedTimezones;
  },

  /** @internal */
  timezoneIndex(
    this: TimezoneIndexDefinitionHost,
    block: (definer: TimezoneIndexDefiner) => void,
  ): void {
    const definer = new TimezoneIndexDefiner(StringDeduper.global);
    block(definer);

    this._dataTimezones = Object.freeze(definer.dataTimezones.sort());
    this._linkedTimezones = Object.freeze(definer.linkedTimezones.sort());
  },
};

/** @internal */
export const TimezoneIndexDefinition = { ClassMethods };
Object.defineProperty(TimezoneIndexDefinition, "appendFeatures", {
  value(this: typeof TimezoneIndexDefinition, base: object): void {
    rbModAppendFeatures(base, this);
    extend(base, ClassMethods);
    const empty = Object.freeze([]);
    Object.assign(base, { _timezones: empty, _dataTimezones: empty, _linkedTimezones: empty });
  },
});
