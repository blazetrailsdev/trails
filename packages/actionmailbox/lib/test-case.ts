import { runLoadHooks } from "@blazetrails/activesupport";
import { TestCase as ActiveSupportTestCase } from "@blazetrails/activesupport/test-case";
import { include } from "@blazetrails/ruby-compat";
import { ActionMailbox } from "./action-mailbox.js";
import { TestHelper } from "./test-helper.js";

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- Ruby `include ActionMailbox::TestHelper` (`actionmailbox/lib/action_mailbox/test_case.rb:9`). */
export interface TestCase extends TestHelper {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface above.
export class TestCase extends ActiveSupportTestCase {}
include(TestCase, TestHelper);

ActionMailbox.TestCase = TestCase;

runLoadHooks("action_mailbox_test_case", TestCase);
