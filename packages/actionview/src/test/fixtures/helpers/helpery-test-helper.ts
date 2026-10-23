import { Module, registerConstant } from "@blazetrails/ruby-compat";

export const HelperyTestHelper = new Module().include({
  helperyTest(): string {
    return "Default";
  },
});
registerConstant("HelperyTestHelper", HelperyTestHelper);
