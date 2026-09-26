import { TestCase } from "@blazetrails/activesupport/test-case";
import { env, setEnv } from "@blazetrails/ruby-compat";

if (env.TRAILS_ENV == null) setEnv("TRAILS_ENV", "test");
await import("../config/environment.js");
await import("../../../test-help.js");

(TestCase as typeof TestCase & { fixtures(...names: string[]): void }).fixtures(":all");
