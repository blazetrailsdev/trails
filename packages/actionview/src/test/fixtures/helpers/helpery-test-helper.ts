import { defineModule, registerConstant } from "@blazetrails/ruby-compat";

export const HelperyTestHelper = defineModule({
  helperyTest(): string {
    return "Default";
  },
});
registerConstant("HelperyTestHelper", HelperyTestHelper);
