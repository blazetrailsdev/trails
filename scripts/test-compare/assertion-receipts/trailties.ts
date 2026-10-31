import type { AssertionReceipt } from "../assertion-receipts.js";

export const trailties: Record<string, AssertionReceipt[]> = {
  "trailties:command/base_test.rb › Rails::Command::BaseTest › ::executable integrates ::bin": [
    {
      kind: "assert_equal",
      value: "s:FOO custom_bin",
      as: "assert_equal",
      reason:
        "command/base_test.rb:13 asserts the snake_case name; RFC 0171 decision 6 makes a command name kebab-case on the command line",
    },
  ],
};
