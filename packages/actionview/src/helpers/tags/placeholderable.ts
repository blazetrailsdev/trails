import { humanize } from "@blazetrails/activesupport";
import { initialize } from "@blazetrails/ruby-compat";

import { Translator } from "./translator.js";

interface PlaceholderableHost {
  object: unknown;
  _objectName: string;
  _methodName: string;
  _options: Record<string, unknown>;
}

export const Placeholderable = {
  [initialize](this: PlaceholderableHost): void {
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
  },
};
