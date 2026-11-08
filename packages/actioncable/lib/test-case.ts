import { runLoadHooks } from "@blazetrails/activesupport";
import { TestCase as ActiveSupportTestCase } from "@blazetrails/activesupport/test-case";
import { include } from "@blazetrails/ruby-compat";
import { ActionCable } from "./namespaces.js";
import { TestHelper } from "./test-helper.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class TestCase extends ActiveSupportTestCase {}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface TestCase extends Omit<TestHelper, "beforeSetup" | "afterTeardown"> {}
include(TestCase, TestHelper);

runLoadHooks("action_cable_test_case", TestCase);
ActionCable.TestCase = TestCase;
