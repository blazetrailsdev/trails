import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./testing/resolvers.js";

defineConstants([
  [() => m0.FixtureResolver, "ActionView::FixtureResolver"],
  [() => m0.NullResolver, "ActionView::NullResolver"],
]);
