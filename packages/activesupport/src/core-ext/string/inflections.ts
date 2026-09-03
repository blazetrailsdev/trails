import { pluralize as inflectorPluralize } from "../../inflector.js";

export function pluralize(str: string, count?: number, locale = "en"): string {
  if (count === 1) {
    return str;
  } else {
    return inflectorPluralize(str, locale);
  }
}
