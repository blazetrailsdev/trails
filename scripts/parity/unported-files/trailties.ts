/**
 * Entries scoped to `package: "trailties"`. The `package` field, not this file's
 * name, is what scopes the match. Schema: ./types.ts.
 */

import type { UnportedFile } from "./types.js";

const API_DOC_TOOLING =
  'PERMANENT: CLAUDE.md § "Rails API-doc tooling is not ported (`Rails::API::Task`, `RDoc::Generator::API`)".';
const VITE =
  'PERMANENT: CLAUDE.md § "importmap-rails and propshaft are out of scope; JavaScript is served by Vite (`vite_rails`)".';

export const TRAILTIES_UNPORTED_FILES: UnportedFile[] = [
  {
    pattern: "api/generator.rb",
    package: "trailties",
    reason: `RDoc::Generator::API builds the Rails repo's own SDoc API docs. ${API_DOC_TOOLING}`,
  },
  {
    pattern: "api/task.rb",
    package: "trailties",
    reason: `Rails::API::Task is the Rails repo's own RDoc rake task. ${API_DOC_TOOLING}`,
  },
  {
    testFile: "application/sprockets_assets_test.rb",
    package: "trailties",
    reason: `Every test boots an app on the Sprockets pipeline. ${VITE}`,
  },
  {
    testFile: "application/assets_test.rb",
    package: "trailties",
    reason: `Every test boots an app on the Propshaft pipeline. ${VITE}`,
  },
  {
    testFile: "application/asset_debugging_test.rb",
    package: "trailties",
    reason: `Every test boots an app on the Propshaft pipeline and asserts on its debug and digest behavior. ${VITE}`,
  },
];
