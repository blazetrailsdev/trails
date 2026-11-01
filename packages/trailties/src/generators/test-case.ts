import { include, type Extended, type Included } from "@blazetrails/ruby-compat/include";
import { TestCase as ActiveSupportTestCase } from "@blazetrails/activesupport/test-case";
import { noColorBang } from "../command/behavior.js";
import * as Assertions from "./testing/assertions.js";
import { Behavior, ClassMethods } from "./testing/behavior.js";
import { SetupAndTeardown } from "./testing/setup-and-teardown.js";

noColorBang();

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class TestCase extends ActiveSupportTestCase {
  declare static tests: Extended<typeof ClassMethods>["tests"];
  declare static arguments: Extended<typeof ClassMethods>["arguments"];
  declare static destination: Extended<typeof ClassMethods>["destination"];
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface TestCase extends Included<typeof Behavior>, Included<typeof Assertions> {
  destinationRoot: string;
}

include(TestCase, Behavior);
include(TestCase, SetupAndTeardown);
include(TestCase, { ...Assertions });
