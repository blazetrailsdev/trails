/**
 * Entries scoped to `package: "trailties"`. The `package` field, not this file's
 * name, is what scopes the match. Schema: ./types.ts.
 */

import type { UnportedFile } from "./types.js";

const SCAFFOLD_REASON =
  "Rails scaffold generator: writes controller/view/test templates into a generated app. " +
  "Pre-1.0 scope — trailties ports no generator layer, and it is outside the AR/AM closure.";

export const TRAILTIES_UNPORTED_FILES: UnportedFile[] = [
  {
    pattern: "generators/app_name.rb",
    package: "trailties",
    reason:
      "Validates and camelizes the application name for `rails new`; part of the generator " +
      "layer trails does not port.",
  },
  {
    pattern: "generators/erb/scaffold/scaffold_generator.rb",
    package: "trailties",
    reason: SCAFFOLD_REASON,
  },
  {
    pattern: "generators/rails/scaffold_controller/scaffold_controller_generator.rb",
    package: "trailties",
    reason: SCAFFOLD_REASON,
  },
  {
    pattern: "generators/test_unit/scaffold/scaffold_generator.rb",
    package: "trailties",
    reason: SCAFFOLD_REASON,
  },
];
