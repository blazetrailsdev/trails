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

Object.assign(ActionDispatch.loadPath, {
  "action_dispatch/testing/assertions": () => import("./action-dispatch/testing/assertions.js"),
  "action_dispatch/testing/test_process": () => import("./action-dispatch/testing/test-process.js"),
  "action_dispatch/testing/integration": () => import("./action-dispatch/testing/integration.js"),
  "action_dispatch/testing/test_request": () => import("./action-dispatch/testing/test-request.js"),
  "action_dispatch/testing/assertion_response": () =>
    import("./action-dispatch/testing/assertion-response.js"),
  "action_controller/test_case": () => import("./action-controller/test-case.js"),
});
ActionDispatch.TestHelpers = { name: "ActionDispatch::TestHelpers", PageDumpHelper };

/** @noRailsEquivalent PERMANENT */
export const ControllerTestRequest = TestRequest;
