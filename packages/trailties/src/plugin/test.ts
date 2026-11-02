import "@blazetrails/activesupport/node";
import { argv } from "@blazetrails/ruby-compat";
import { TestUnitReporter } from "../test-unit/reporter.js";
import { Runner } from "../test-unit/runner.js";

TestUnitReporter.executable = "bin/test";

const ARGV = argv.slice(2);
Runner.parseOptions(ARGV);
await Runner.run(ARGV);
