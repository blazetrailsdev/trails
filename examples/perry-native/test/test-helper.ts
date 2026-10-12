import { TestCase } from "@blazetrails/activesupport/test-case";
import { env, setEnv } from "@blazetrails/ruby-compat";

if (env.TRAILS_ENV == null) setEnv("TRAILS_ENV", "test");
await import("../config/environment.js");
await import("@blazetrails/trailties/test-help");

// Setup all fixtures in test/fixtures/*.yml for all tests in alphabetical order.
TestCase.fixtures(":all");

// Add more helper methods to be used by all tests here...
