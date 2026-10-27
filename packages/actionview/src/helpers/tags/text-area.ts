import { humanize, stringifyKeys } from "@blazetrails/activesupport";
import { hashDelete, include, rbObjRespondTo } from "@blazetrails/ruby-compat";

import { Base } from "./base.js";
import { Placeholderable } from "./placeholderable.js";
import { Translator } from "./translator.js";

export class TextArea extends Base {
  /** @inlinedFrom ActionView::Helpers::Tags::Placeholderable#initialize rails/v8.0.2/actionview/lib/action_view/helpers/tags/placeholderable.rb:7-20 */
  constructor(
    objectName: unknown,
    methodName: unknown,
    templateObject: unknown,
    options: Record<string, unknown> = {},
  ) {
    super(objectName, methodName, templateObject, options);

    const tagValue = this._options["placeholder"];
    if (tagValue != null && tagValue !== false) {
      const isSymbol = typeof tagValue === "string" && tagValue.startsWith(":");
      let placeholder: unknown = typeof tagValue === "string" && !isSymbol ? tagValue : null;
      const methodAndValue =
        tagValue === true
          ? this._methodName
          : `${this._methodName}.${isSymbol ? tagValue.slice(1) : tagValue}`;

      placeholder ??= new Translator(this.object, this._objectName, methodAndValue, {
        scope: "helpers.placeholder",
      }).translate();
      placeholder ??= humanize(this._methodName);
      this._options["placeholder"] = placeholder;
    }
  }

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
