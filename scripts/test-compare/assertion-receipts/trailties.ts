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
  "trailties:generators/benchmark_generator_test.rb › BenchmarkGeneratorTest › generate benchmark":
    [
      {
        kind: "assert_equal",
        value:
          's:# frozen_string_literal: true\n\nrequire_relative "../../config/environment"\n\n# Any benchmarking setup goes here...\n\n\n\nBenchmark.ips do |x|\n  x.report("before") { }\n  x.report("after") { }\n\n  x.compare!\nend\n',
        as: "assert_equal",
        reason:
          "benchmark_generator_test.rb asserts the generated script as Ruby source; the port generates the same script as TypeScript",
      },
    ],
  "trailties:generators/benchmark_generator_test.rb › BenchmarkGeneratorTest › generate benchmark with reports":
    [
      {
        kind: "assert_equal",
        value:
          's:# frozen_string_literal: true\n\nrequire_relative "../../config/environment"\n\n# Any benchmarking setup goes here...\n\n\n\nBenchmark.ips do |x|\n  x.report("with_patch") { }\n  x.report("without_patch") { }\n\n  x.compare!\nend\n',
        as: "assert_equal",
        reason:
          "benchmark_generator_test.rb asserts the generated script as Ruby source; the port generates the same script as TypeScript",
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
};
