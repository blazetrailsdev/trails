import { stringifyKeys } from "@blazetrails/activesupport";
import { DateTime } from "@blazetrails/date";
import { NotImplementedError } from "@blazetrails/ruby-compat";

import { TextField } from "./text-field.js";

export class DatetimeField extends TextField {
  override render(): unknown {
    const options = stringifyKeys(this._options);
    options["value"] = this.datetimeValue(
      options["value"] != null && options["value"] !== false ? options["value"] : this.value(),
    );
    options["min"] = this.formatDatetime(this.parseDatetime(options["min"]));
    options["max"] = this.formatDatetime(this.parseDatetime(options["max"]));
    this._options = options;
    return super.render();
  }

  private datetimeValue(value: unknown): unknown {
    if (typeof value === "string") {
      return value;
    } else {
      return this.formatDatetime(value);
    }
  }

  protected formatDatetime(_value: unknown): string | null {
    // @nie disposition=keep-as-strategy-hook rails=actionview/lib/action_view/helpers/tags/datetime_field.rb:24
    throw new NotImplementedError();
  }

  private parseDatetime(value: unknown): unknown {
    if (typeof value === "string") {
      try {
        return DateTime.parse(value);
      } catch {
        return null;
      }
    } else {
      return value;
    }
  }
}
