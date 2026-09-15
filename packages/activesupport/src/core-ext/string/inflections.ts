import { ArgumentError } from "@blazetrails/ruby-compat";

import { camelize as inflectorCamelize, pluralize as inflectorPluralize } from "../../inflector.js";

export function pluralize(str: string, count?: number, locale = "en"): string {
  if (count === 1) {
    return str;
  } else {
    return inflectorPluralize(str, locale);
  }
}

export function camelize(str: string, firstLetter: "upper" | "lower" = "upper"): string {
  switch (firstLetter) {
    case "upper":
      return inflectorCamelize(str, true);
    case "lower":
      return inflectorCamelize(str, false);
    default:
      throw new ArgumentError("Invalid option, use either :upper or :lower.");
  }
}
