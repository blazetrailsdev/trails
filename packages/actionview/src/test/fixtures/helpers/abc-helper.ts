import { defineModule, registerConstant } from "@blazetrails/ruby-compat";

export const AbcHelper = defineModule({
  bareA(): void {},
});
registerConstant("AbcHelper", AbcHelper);
