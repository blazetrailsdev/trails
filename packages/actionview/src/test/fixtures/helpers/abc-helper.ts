import { defineModule, TopLevel, constSet } from "@blazetrails/ruby-compat";

export const AbcHelper = defineModule({
  bareA(): void {},
});
constSet(TopLevel, "AbcHelper", AbcHelper);
