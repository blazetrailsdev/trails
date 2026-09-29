import { stringifyKeys } from "@blazetrails/activesupport";

import { TextField } from "./text-field.js";

export class SearchField extends TextField {
  override render(): unknown {
    const options = stringifyKeys(this._options);

    if (options["autosave"] != null && options["autosave"] !== false) {
      if (options["autosave"] === true) {
        options["autosave"] = (this as unknown as { request: { host: string } }).request.host
          .split(".")
          .reverse()
          .join(".");
      }
      if (options["results"] == null || options["results"] === false) options["results"] = 10;
    }

    if (options["onsearch"] != null && options["onsearch"] !== false) {
      if (!Object.hasOwn(options, "incremental")) options["incremental"] = true;
    }

    this._options = options;
    return super.render();
  }
}
