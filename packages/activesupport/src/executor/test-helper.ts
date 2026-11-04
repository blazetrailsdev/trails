import { rbCallSuper, TopLevel } from "@blazetrails/ruby-compat";
import type { Minitest } from "../testing/assertions.js";

type Test = InstanceType<(typeof Minitest)["Test"]>;

async function run(this: Test): Promise<Test> {
  return await TopLevel.Trails!.application!.executor.perform(
    () => rbCallSuper(this, run) as Promise<Test>,
  );
}

export const TestHelper = { run };
