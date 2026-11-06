import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./test-case.js";
import * as m1 from "./test-helper.js";

defineConstants([
  [() => m0.NonInferrableMailerError, "ActionMailer::NonInferrableMailerError"],
  [() => m0.TestCase, "ActionMailer::TestCase"],
  [() => m0.Behavior, "ActionMailer::TestCase::Behavior"],
  [() => m0.ClassMethods, "ActionMailer::TestCase::Behavior::ClassMethods"],
  [() => m0.ClearTestDeliveries, "ActionMailer::TestCase::ClearTestDeliveries"],
  [() => m1.TestHelper, "ActionMailer::TestHelper"],
]);
