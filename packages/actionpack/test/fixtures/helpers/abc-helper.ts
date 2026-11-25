import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";

export const AbcHelper = {
  bareA(): void {},
};
constSet(TopLevel, "AbcHelper", AbcHelper);
