import { defineModule, TopLevel, constSet } from "@blazetrails/ruby-compat";

export const HelperyTestHelper = defineModule({
  helperyTest(): string {
    return "Default";
  },
});
constSet(TopLevel, "HelperyTestHelper", HelperyTestHelper);
