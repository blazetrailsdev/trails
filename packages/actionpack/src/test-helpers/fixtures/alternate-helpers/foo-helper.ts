import { registerConstant } from "@blazetrails/ruby-compat";

export const FooHelper = {
  baz(): void {},
};
registerConstant("FooHelper", FooHelper);
