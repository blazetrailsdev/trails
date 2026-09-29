import { stringifyKeys } from "@blazetrails/activesupport";
import { hashDelete, include, rbObjRespondTo } from "@blazetrails/ruby-compat";

import { Base } from "./base.js";
import { Placeholderable } from "./placeholderable.js";

export class TextArea extends Base {
  override render(): unknown {
    const options = stringifyKeys(this._options);
    this.addDefaultNameAndId(options);

    const size = hashDelete(options, "size");
    if (size != null && size !== false) {
      if (rbObjRespondTo(size, "split")) {
        [options["cols"], options["rows"]] = (size as string).split("x");
      }
    }

    return this.contentTag(
      "textarea",
      hashDelete(options, "value", () => this.valueBeforeTypeCast()),
      options,
    );
  }
}

include(TextArea, Placeholderable);
