import { DateCalculations, type SafeBuffer } from "@blazetrails/activesupport";
import { fetch, include, rbModConstSet, rtest } from "@blazetrails/ruby-compat";

import { Tags } from "../../namespaces.js";
import { FormOptionsHelper } from "../form-options-helper.js";
import { Base } from "./base.js";
import { SelectRenderer } from "./select-renderer.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include SelectRenderer, FormOptionsHelper` (tags/weekday_select.rb:6-7); the class/interface merge is how the mixins surface on the type side.
export class WeekdaySelect extends Base {
  private _htmlOptions: Record<string, unknown>;

  constructor(
    objectName: unknown,
    methodName: unknown,
    templateObject: unknown,
    options: Record<string, unknown>,
    htmlOptions: Record<string, unknown>,
    _block?: () => unknown,
  ) {
    super(objectName, methodName, templateObject, options);
    this._htmlOptions = htmlOptions;
  }

  override render(): unknown {
    const value = this.value();
    return this.selectContentTag(
      this.weekdayOptionsForSelect(rtest(value) ? value : this._options["selected"], {
        indexAsValue: fetch(this._options, "indexAsValue", false),
        dayFormat: fetch(this._options, "dayFormat", "day_names"),
        beginningOfWeek: fetch(
          this._options,
          "beginningOfWeek",
          DateCalculations.beginningOfWeek(),
        ),
      }),
      this._options,
      this._htmlOptions,
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the class above.
export interface WeekdaySelect {
  /** @internal */
  selectContentTag(
    optionTags: unknown,
    options: Record<string, unknown>,
    htmlOptions: Record<string, unknown>,
  ): unknown;
  weekdayOptionsForSelect(
    selected?: unknown,
    options?: { indexAsValue?: unknown; dayFormat?: unknown; beginningOfWeek?: unknown },
  ): SafeBuffer | string;
}

include(WeekdaySelect, SelectRenderer);
include(WeekdaySelect, FormOptionsHelper);

rbModConstSet(Tags, "WeekdaySelect", WeekdaySelect);
