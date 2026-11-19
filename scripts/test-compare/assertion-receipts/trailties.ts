import type { AssertionReceipt } from "../assertion-receipts.js";

export const trailties: Record<string, AssertionReceipt[]> = {
  "trailties:command/base_test.rb › Rails::Command::BaseTest › ::executable integrates ::bin": [
    {
      kind: "assert_equal",
      value: "s:FOO custom_bin",
      as: "assert_equal",
      reason:
        "command/base_test.rb:94 asserts the snake_case name; RFC 0171 decision 6 makes a command name kebab-case on the command line",
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
  "trailties:generators/app_generator_test.rb › AppGeneratorTest › inclusion of kamal storage volume":
    [
      {
        kind: "assert_equal",
        value: "n:1",
        as: null,
        reason:
          "app_generator_test.rb:709 counts the generator's bundle_command calls; run_kamal's bundle_command has no port (app_base.rb:739-740)",
      },
      {
        kind: "assert_equal",
        value: "n:1",
        as: null,
        reason:
          "app_generator_test.rb:710 counts the generator's bundle_command calls; run_kamal's bundle_command has no port (app_base.rb:739-740)",
      },
    ],
  "trailties:generators/app_generator_test.rb › AppGeneratorTest › inclusion of kamal storage volume if only skip active storage is given":
    [
      {
        kind: "assert_equal",
        value: "n:1",
        as: null,
        reason:
          "app_generator_test.rb:719 counts the generator's bundle_command calls; run_kamal's bundle_command has no port (app_base.rb:739-740)",
      },
      {
        kind: "assert_equal",
        value: "n:1",
        as: null,
        reason:
          "app_generator_test.rb:720 counts the generator's bundle_command calls; run_kamal's bundle_command has no port (app_base.rb:739-740)",
      },
    ],
  "trailties:generators/app_generator_test.rb › AppGeneratorTest › kamal files are skipped if required":
    [
      {
        kind: "assert_empty",
        value: null,
        as: null,
        reason:
          "app_generator_test.rb:688 greps the generator's bundle_command calls; run_kamal's bundle_command has no port (app_base.rb:739-740)",
      },
      {
        kind: "assert_empty",
        value: null,
        as: null,
        reason:
          "app_generator_test.rb:689 greps the generator's bundle_command calls; run_kamal's bundle_command has no port (app_base.rb:739-740)",
      },
    ],
  "trailties:generators/plugin_generator_test.rb › PluginGeneratorTest › invalid plugin name raises an error":
    [
      {
        kind: "assert_equal",
        value:
          "s:Invalid plugin name Digest, constant Digest is already in use. Please choose another plugin name.\n",
        as: "assert_equal",
        reason:
          "plugin_generator_test.rb:103 collides with Ruby's stdlib Digest, which trails does not seat on TopLevel; the port collides with Trails",
      },
    ],
  "trailties:minitest/rails_plugin_test.rb › Minitest::RailsPluginTest › does not replace backtrace filter when using --backtrace option":
    [
      {
        kind: "assert_same",
        value: null,
        as: null,
        reason:
          "rails_plugin_test.rb:41-43 repeats the arm with the -b alias; Minitest.process_args is unported, so the port passes the parsed fullBacktrace option and the alias has no distinct input",
      },
    ],
};
