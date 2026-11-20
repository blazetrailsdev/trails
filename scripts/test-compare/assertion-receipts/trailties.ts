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
  "trailties:generators/app_generator_test.rb › AppGeneratorTest › devcontainer": [
    {
      kind: "assert_file",
      value: "s:test/application_system_test_case.rb",
      as: null,
      reason:
        'app_generator_test.rb:1330 opens application_system_test_case.rb for the Capybara lines below; the generated SystemTestCase drives Playwright (CLAUDE.md, "System testing runs on Vitest (`SystemTestCase`, `SystemTesting::*`)")',
    },
    {
      kind: "assert_match",
      value: null,
      as: null,
      reason:
        'app_generator_test.rb:1331 asserts the Capybara served_by line of application_system_test_case.rb; the generated SystemTestCase drives Playwright (CLAUDE.md, "System testing runs on Vitest (`SystemTestCase`, `SystemTesting::*`)")',
    },
    {
      kind: "assert_match",
      value: null,
      as: null,
      reason:
        'app_generator_test.rb:1332 asserts the Capybara driven_by :selenium line of application_system_test_case.rb; the generated SystemTestCase drives Playwright (CLAUDE.md, "System testing runs on Vitest (`SystemTestCase`, `SystemTesting::*`)")',
    },
    {
      kind: "assert_match",
      value: null,
      as: null,
      reason:
        'app_generator_test.rb:1333 asserts the Capybara browser: :remote line of application_system_test_case.rb; the generated SystemTestCase drives Playwright (CLAUDE.md, "System testing runs on Vitest (`SystemTestCase`, `SystemTesting::*`)")',
    },
    {
      kind: "assert_match",
      value: null,
      as: null,
      reason:
        'app_generator_test.rb:1334 asserts the Capybara url: line of application_system_test_case.rb; the generated SystemTestCase drives Playwright (CLAUDE.md, "System testing runs on Vitest (`SystemTestCase`, `SystemTesting::*`)")',
    },
  ],
  "trailties:generators/app_generator_test.rb › AppGeneratorTest › devcontainer no selenium when skipping system test":
    [
      {
        kind: "assert_not_includes",
        value: "s:CAPYBARA_SERVER_PORT",
        as: null,
        reason:
          'app_generator_test.rb:1568 asserts the Capybara server port variable; the devcontainer exports the Vitest system-testing server port instead (CLAUDE.md, "System testing runs on Vitest (`SystemTestCase`, `SystemTesting::*`)")',
      },
    ],
  "trailties:generators/app_generator_test.rb › AppGeneratorTest › hotwire": [
    {
      kind: "assert_gem",
      value: "s:turbo-rails",
      as: null,
      reason:
        "app_generator_test.rb:959 asserts the turbo-rails Gemfile entry; in trails turbo:install adds @hotwired/turbo-rails itself (packages/trailties/CLAUDE.md, importmap-rails and propshaft are out of scope), and the test stubs that command",
    },
    {
      kind: "assert_gem",
      value: "s:stimulus-rails",
      as: null,
      reason:
        "app_generator_test.rb:960 asserts the stimulus-rails Gemfile entry; in trails stimulus:install adds @hotwired/stimulus itself, and the test stubs that command",
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
  "trailties:generators/app_generator_test.rb › AppGeneratorTest › inclusion of ruby version": [
    {
      kind: "assert_match",
      value: null,
      as: null,
      reason:
        'app_generator_test.rb:1079 reads ENV["RBENV_VERSION"], a Ruby version manager; .ruby-version is .node-version (packages/trailties/CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)")',
    },
    {
      kind: "assert_match",
      value: null,
      as: null,
      reason:
        'app_generator_test.rb:1081 reads ENV["rvm_ruby_string"], a Ruby version manager; .ruby-version is .node-version (packages/trailties/CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)")',
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
  "trailties:generators/app_generator_test.rb › AppGeneratorTest › kamal storage volume is skipped if required":
    [
      {
        kind: "assert_equal",
        value: "n:1",
        as: null,
        reason:
          "app_generator_test.rb:733 counts the generator's bundle_command calls; run_kamal's bundle_command has no port (app_base.rb:739-740)",
      },
      {
        kind: "assert_equal",
        value: "n:1",
        as: null,
        reason:
          "app_generator_test.rb:734 counts the generator's bundle_command calls; run_kamal's bundle_command has no port (app_base.rb:739-740)",
      },
    ],
  "trailties:generators/app_generator_test.rb › AppGeneratorTest › skip javascript option": [
    {
      kind: "assert_no_node_files",
      value: null,
      as: null,
      reason:
        "app_generator_test.rb:865 asserts no .node-version and no node-gyp in the Dockerfile; a trails app is a Node app, so both are always written (packages/trailties/CLAUDE.md, A Gemfile is a package.json)",
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
  "trailties:generators_test.rb › GeneratorsTest › fallbacks for generators on find by namespace": [
    {
      kind: "assert_equal",
      value: "s:test_unit:plugin",
      as: "assert_equal",
      reason:
        'generators_test.rb:186 asserts the snake_case namespace; trails dasherizes a generator namespace (trails#9399, generators.trails.test.ts "resolves a generator from either spelling")',
    },
  ],
  "trailties:generators_test.rb › GeneratorsTest › fallbacks for generators on find by namespace with context":
    [
      {
        kind: "assert_equal",
        value: "s:test_unit:plugin",
        as: "assert_equal",
        reason:
          'generators_test.rb:195 asserts the snake_case namespace; trails dasherizes a generator namespace (trails#9399, generators.trails.test.ts "resolves a generator from either spelling")',
      },
    ],
  "trailties:generators_test.rb › GeneratorsTest › find by namespace with context": [
    {
      kind: "assert_equal",
      value: "s:test_unit:model",
      as: "assert_equal",
      reason:
        'generators_test.rb:105 asserts the snake_case namespace; trails dasherizes a generator namespace (trails#9399, generators.trails.test.ts "resolves a generator from either spelling")',
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
