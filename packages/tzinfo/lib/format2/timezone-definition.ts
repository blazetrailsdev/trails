import { extend, rbModAppendFeatures } from "@blazetrails/ruby-compat";
import { ConstantOffsetDataTimezoneInfo } from "../data-sources/constant-offset-data-timezone-info.js";
import { LinkedTimezoneInfo } from "../data-sources/linked-timezone-info.js";
import type { TimezoneInfo } from "../data-sources/timezone-info.js";
import { TransitionsDataTimezoneInfo } from "../data-sources/transitions-data-timezone-info.js";
import { StringDeduper } from "../string-deduper.js";
import { TimezoneDefiner } from "./timezone-definer.js";

export interface TimezoneDefinitionHost {
  _timezone?: TimezoneInfo;
  timezoneDefinerClass(): typeof TimezoneDefiner;
}

/** @internal */
export const ClassMethods = {
  get(this: TimezoneDefinitionHost): TimezoneInfo | null {
    return this._timezone ?? null;
  },

  /** @internal */
  timezoneDefinerClass(): typeof TimezoneDefiner {
    return TimezoneDefiner;
  },

  /** @internal */
  timezone(
    this: TimezoneDefinitionHost,
    identifier: string,
    block: (definer: TimezoneDefiner) => void,
  ): void {
    const stringDeduper = StringDeduper.global;
    identifier = stringDeduper.dedupe(identifier);
    const definer = new (this.timezoneDefinerClass())(stringDeduper);
    block(definer);

    const transitions = definer.transitions;

    this._timezone =
      transitions.length === 0
        ? new ConstantOffsetDataTimezoneInfo(identifier, definer.firstOffset()!)
        : new TransitionsDataTimezoneInfo(identifier, transitions);
  },

  /** @internal */
  linkedTimezone(this: TimezoneDefinitionHost, identifier: string, linkToIdentifier: string): void {
    const stringDeduper = StringDeduper.global;
    this._timezone = new LinkedTimezoneInfo(
      stringDeduper.dedupe(identifier),
      stringDeduper.dedupe(linkToIdentifier),
    );
  },
};

/** @internal */
export const TimezoneDefinition = { ClassMethods };
Object.defineProperty(TimezoneDefinition, "appendFeatures", {
  value(this: typeof TimezoneDefinition, base: object): void {
    rbModAppendFeatures(base, this);
    extend(base, ClassMethods);
  },
});
