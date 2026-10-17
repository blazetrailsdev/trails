import { TimeZone, type SafeBuffer } from "@blazetrails/activesupport";
import { include, rbModConstSet, rtest } from "@blazetrails/ruby-compat";

import { Tags } from "../../namespaces.js";
import { FormOptionsHelper } from "../form-options-helper.js";
import { Base } from "./base.js";
import { SelectRenderer } from "./select-renderer.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include SelectRenderer, FormOptionsHelper` (tags/time_zone_select.rb:6-7); the class/interface merge is how the mixins surface on the type side.
export class TimeZoneSelect extends Base {
  private _priorityZones: unknown;
  private _htmlOptions: Record<string, unknown>;

  constructor(
    objectName: unknown,
    methodName: unknown,
    templateObject: unknown,
    priorityZones: unknown,
    options: Record<string, unknown>,
    htmlOptions: Record<string, unknown>,
  ) {
    super(objectName, methodName, templateObject, options);
    this._priorityZones = priorityZones;
    this._htmlOptions = htmlOptions;
  }

  override render(): unknown {
    const value = this.value();
    return this.selectContentTag(
      this.timeZoneOptionsForSelect(
        rtest(value) ? value : this._options["default"],
        this._priorityZones,
        rtest(this._options["model"]) ? this._options["model"] : TimeZone,
      ),
      this._options,
      this._htmlOptions,
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the class above.
export interface TimeZoneSelect {
  /** @internal */
  selectContentTag(
    optionTags: unknown,
    options: Record<string, unknown>,
    htmlOptions: Record<string, unknown>,
  ): unknown;
  timeZoneOptionsForSelect(
    selected?: unknown,
    priorityZones?: unknown,
    model?: unknown,
  ): SafeBuffer | string;
}

include(TimeZoneSelect, SelectRenderer);
include(TimeZoneSelect, FormOptionsHelper);

rbModConstSet(Tags, "TimeZoneSelect", TimeZoneSelect);
