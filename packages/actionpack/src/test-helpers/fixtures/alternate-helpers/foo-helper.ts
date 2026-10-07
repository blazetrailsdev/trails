import { Module, registerConstant } from "@blazetrails/ruby-compat";

export const FooHelper = new Module().include({
  baz(): void {},
});
registerConstant("FooHelper", FooHelper);
