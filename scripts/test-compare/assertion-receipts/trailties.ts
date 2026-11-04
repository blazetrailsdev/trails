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
  "trailties:generators/api_app_generator_test.rb › ApiAppGeneratorTest › api modified files": [
    {
      kind: "assert_match",
      value: null,
      as: null,
      reason:
        'api_app_generator_test.rb:48 asserts a commented `# gem "jbuilder"` Gemfile line; package.json holds no comments',
    },
    {
      kind: "assert_match",
      value: null,
      as: null,
      reason:
        'api_app_generator_test.rb:49 asserts a commented `# gem "rack-cors"` Gemfile line; package.json holds no comments',
    },
  ],
  "trailties:generators/api_app_generator_test.rb › ApiAppGeneratorTest › generator skip css": [
    {
      kind: "assert_no_match",
      value: null,
      as: null,
      reason:
        "api_app_generator_test.rb:109 sits in a block assert_no_file never yields; the port's assertNoFile takes no block",
    },
  ],
};
