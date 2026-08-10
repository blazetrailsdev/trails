/**
 * Entries scoped to `package: "globalid"`. The `package` field, not this file's
 * name, is what scopes the match. Schema: ./types.ts.
 */

import type { UnportedFile } from "./types.js";

export const GLOBALID_UNPORTED_FILES: UnportedFile[] = [
  // --- globalid: Rails::Railtie wiring ---
  {
    testFile: "/railtie_test.rb",
    package: "globalid",
    reason:
      "Exercises the `global_id` Railtie initializer through a full " +
      "`Rails::Application` boot (`@app.initialize!`) under " +
      "`ActiveSupport::Testing::Isolation` — GlobalID.app defaulting, " +
      "`config.global_id.app`/`expires_in` injection, and verifier key " +
      "derivation from `app.key_generator`. Unlike activemodel/trailties, " +
      "globalid has not yet ported its railtie to a `Trailtie` " +
      "(activesupport's `BaseRailtie`); its wiring is a `wire.ts` side-effect " +
      "plus explicit `setApp`/verifier setters, and there is no " +
      "`Rails::Application` boot harness for these tests to drive. Porting " +
      "globalid's railtie to a `Trailtie` would let this file re-enter " +
      "accounting — tracked as a follow-up story.",
  },
];
