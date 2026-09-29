import { stringifyKeys } from "@blazetrails/activesupport";
import { block, fetch, include } from "@blazetrails/ruby-compat";

import { Base } from "./base.js";
import { Placeholderable } from "./placeholderable.js";

export class TextField extends Base {
  declare protected static _fieldType?: string;

  override render(): unknown {
    const options = stringifyKeys(this._options);
    if (!Object.hasOwn(options, "size")) options["size"] = options["maxlength"];
    if (options["type"] == null || options["type"] === false) options["type"] = this.fieldType();
    if (this.fieldType() !== "file") {
      options["value"] = fetch(
        options,
        "value",
        block(() => this.valueBeforeTypeCast()),
      );
    }
    this.addDefaultNameAndId(options);
    return this.tag("input", options);
  }

  static fieldType(): string {
    if (!Object.hasOwn(this, "_fieldType")) {
      this._fieldType = this.name.split("::").at(-1)!.replace("Field", "").toLowerCase();
    }
    return this._fieldType!;
  }

  private fieldType(): string {
    return (this.constructor as typeof TextField).fieldType();
  }
}

include(TextField, Placeholderable);
