import { Module, registerConstant } from "@blazetrails/ruby-compat";

export const AbcHelper = new Module().include({
  bareA(): void {},
});
registerConstant("AbcHelper", AbcHelper);
