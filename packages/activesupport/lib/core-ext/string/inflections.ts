import { ArgumentError, STRING_METHOD_TABLE } from "@blazetrails/ruby-compat";

import {
  camelize as inflectorCamelize,
  classify as inflectorClassify,
  pluralize as inflectorPluralize,
} from "../../inflector.js";

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

export function classify(str: string): string {
  return inflectorClassify(str);
}

STRING_METHOD_TABLE.classify = (self) => classify(self.string);
