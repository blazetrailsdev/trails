import { STRING_METHOD_TABLE } from "@blazetrails/ruby-compat/string/method-table";

export function isActsLikeString(_string: unknown): boolean {
  return true;
}

STRING_METHOD_TABLE.actsLikeString = isActsLikeString;
