import { Tags } from "../../namespaces.js";
import { stringifyKeys, type SafeBuffer } from "@blazetrails/activesupport";
import { hashDelete, rbModConstSet } from "@blazetrails/ruby-compat";

import { TextField } from "./text-field.js";

export class FileField extends TextField {
  override render(): unknown {
    const includeHidden = hashDelete(this._options, "includeHidden");
    const options = stringifyKeys(this._options);
    this.addDefaultNameAndId(options);

    if (
      options["multiple"] != null &&
      options["multiple"] !== false &&
      includeHidden != null &&
      includeHidden !== false
    ) {
      return this.hiddenFieldForMultipleFile(options).plus(super.render() as SafeBuffer);
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

rbModConstSet(Tags, "FileField", FileField);
