/**
 * Mirrors: active_support/testing/constant_lookup.rb
 *
 * Resolves a constant from a minitest spec name.
 *
 * Given the following spec-style test:
 *
 *   describe WidgetsController, :index do
 *     describe "authenticated user" do
 *       describe "returns widgets" do
 *         it "has a controller that exists" do
 *           assert_kind_of WidgetsController, @controller
 *         end
 *       end
 *     end
 *   end
 *
 * The test will have the following name:
 *
 *   "WidgetsController::index::authenticated user::returns widgets"
 *
 * The constant WidgetsController can be resolved from the name.
 */
import { safeConstantize } from "../inflector.js";

export namespace ConstantLookup {
  // Rails nests this in `module ClassMethods` under `extend ActiveSupport::Concern`;
  // the Concern flattens it onto the including class, so it sits on the module here.
  export function determineConstantFromTestName(
    testName: string,
    block: (constant: unknown) => boolean,
  ): unknown {
    const names = testName.split("::");
    while (names.length > 0) {
      names[names.length - 1] = names[names.length - 1].replace(/Test$/, "");
      try {
        const constant = safeConstantize(names.join("::"));
        // Ruby `break(constant) if yield(constant)` — the `ensure` below still
        // pops before the value leaves the loop.
        if (block(constant)) return constant;
      } finally {
        names.pop();
      }
    }
    return undefined;
  }
}
