export * from "./action-dispatch/testing/index.js";
export {
  TestCase,
  LiveTestResponse,
  TestSession,
  type RequestOptions,
} from "./action-controller/test-case.js";

import { TestRequest } from "./action-controller/test-case.js";
import * as PageDumpHelper from "./action-dispatch/testing/test-helpers/page-dump-helper.js";
import { ActionDispatch } from "./namespaces.js";
import "./constants.excluded.generated.js";

ActionDispatch.TestHelpers = { name: "ActionDispatch::TestHelpers", PageDumpHelper };

/** @noRailsEquivalent PERMANENT */
export const ControllerTestRequest = TestRequest;
