import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";

export const FooHelper = {
  baz(): void {},
};
constSet(TopLevel, "FooHelper", FooHelper);
