import "../constants.test-helper.generated.js";
import { rbCallSuper } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import type { Minitest } from "../testing/assertions.js";
import { Executor } from "../executor.js";

type Test = InstanceType<(typeof Minitest)["Test"]>;

async function run(this: Test, ...args: unknown[]): Promise<Test> {
  return await TopLevel.Trails!.application!.executor.perform(
    () => rbCallSuper(this, run, ...args) as Promise<Test>,
  );
}

export const TestHelper = { run };

Executor.TestHelper = TestHelper;
