import { htmlSafe } from "@blazetrails/activesupport";
import { Date as RubyDate, Time } from "@blazetrails/date";
import { block, dup, fetch, include, rbFPublicSend, rbModConstSet } from "@blazetrails/ruby-compat";

import { Tags } from "../../namespaces.js";
import { DateTimeSelector } from "../date-helper.js";
import { Base } from "./base.js";
import { SelectRenderer } from "./select-renderer.js";

export class DateSelect extends Base {
  declare protected static _selectType?: string;
  private _htmlOptions: Record<string, unknown>;

  constructor(
    objectName: unknown,
    methodName: unknown,
    templateObject: unknown,
    options: Record<string, unknown>,
    htmlOptions: Record<string, unknown>,
  ) {
    super(objectName, methodName, templateObject, options);
    this._htmlOptions = htmlOptions;
  }

  override render(): unknown {
    return this.errorWrapping(
      htmlSafe(
        String(
          rbFPublicSend(
            this.datetimeSelector(this._options, this._htmlOptions),
            `select${this.selectType().charAt(0).toUpperCase()}${this.selectType().slice(1)}`,
          ),
        ),
      ),
    );
  }

  static selectType(): string {
    if (!Object.hasOwn(this, "_selectType")) {
      this._selectType = this.name.split("::").at(-1)!.replace("Select", "").toLowerCase();
    }
    return this._selectType!;
  }

  /** @internal */
  private selectType(): string {
    return (this.constructor as typeof DateSelect).selectType();
  }

  /** @internal */
  private datetimeSelector(
    options: Record<string, unknown>,
    htmlOptions: Record<string, unknown>,
  ): DateTimeSelector {
    const datetime = fetch(
      options,
      "selected",
      block(() => this.value() ?? this.defaultDatetime(options)),
    );
    this._autoIndex ??= null;

    options = dup(options);
    options["fieldName"] = this._methodName;
    options["includePosition"] = true;
    options["prefix"] ??= this._objectName;
    if (this._autoIndex != null && !Object.hasOwn(options, "index")) {
      options["index"] = this._autoIndex;
    }

    return new DateTimeSelector(datetime, options, htmlOptions);
  }

  /** @internal */
  private defaultDatetime(options: Record<string, unknown>): unknown {
    if (
      (options["includeBlank"] != null && options["includeBlank"] !== false) ||
      (options["prompt"] != null && options["prompt"] !== false)
    ) {
      return;
    }

    const optionsDefault = options["default"];
    if (optionsDefault == null) {
      return Time.current();
    } else if (optionsDefault instanceof RubyDate || optionsDefault instanceof Time) {
      return optionsDefault;
    } else {
      const default_ = dup(optionsDefault as Record<string, unknown>);

      default_["min"] ??= default_["minute"];
      default_["sec"] ??= default_["second"];

      const time = Time.current();

      for (const key of ["year", "month", "day", "hour", "min", "sec"]) {
        default_[key] ??= rbFPublicSend(time, key);
      }

      return Time.utc(
        default_["year"] as number,
        default_["month"] as number,
        default_["day"] as number,
        default_["hour"] as number,
        default_["min"] as number,
        default_["sec"] as number,
      );
    }
  }
}

include(DateSelect, SelectRenderer);

rbModConstSet(Tags, "DateSelect", DateSelect);
