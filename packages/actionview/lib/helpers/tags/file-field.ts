import { Tags } from "../../namespaces.js";
import { stringifyKeys, type SafeBuffer } from "@blazetrails/activesupport";
import { hashDelete } from "@blazetrails/ruby-compat";

import { TextField } from "./text-field.js";

export class FileField extends TextField {
  override render(): unknown {
    const includeHidden = hashDelete(this._options, "includeHidden");
    if (Array.isArray(this._options["accept"])) {
      this._options["accept"] = this._options["accept"].join(",");
    }
    const options = stringifyKeys(this._options);
    this.addDefaultNameAndField(options);

    if (
      options["multiple"] != null &&
      options["multiple"] !== false &&
      includeHidden != null &&
      includeHidden !== false
    ) {
      return this.hiddenFieldForMultipleFile(options).plus(super.render());
    } else {
      return super.render();
    }
  }

  private hiddenFieldForMultipleFile(options: Record<string, unknown>): SafeBuffer {
    return this.tag("input", {
      name: options["name"],
      type: "hidden",
      value: "",
      autocomplete: "off",
    }) as SafeBuffer;
  }
}

Tags.FileField = FileField;
