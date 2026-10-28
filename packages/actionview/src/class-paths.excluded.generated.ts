import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./test-case.js";

registerClassPaths([
  [() => m0.TestCase, "ActionView::TestCase"],
  [() => m0.Behavior, "ActionView::TestCase::Behavior"],
  [() => m0.ClassMethods, "ActionView::TestCase::Behavior::ClassMethods"],
  [() => m0.Locals, "ActionView::TestCase::Behavior::Locals"],
  [() => m0.RenderedViewContent, "ActionView::TestCase::Behavior::RenderedViewContent"],
  [() => m0.RenderedViewsCollection, "ActionView::TestCase::Behavior::RenderedViewsCollection"],
  [() => m0.TestController, "ActionView::TestCase::TestController"],
]);
