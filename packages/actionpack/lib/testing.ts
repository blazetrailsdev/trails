export * from "./action-dispatch/testing/index.js";
export {
  TestCase,
  TestRequest as ControllerTestRequest,
  LiveTestResponse,
  TestSession,
  type RequestOptions,
} from "./action-controller/test-case.js";

import * as PageDumpHelper from "./action-dispatch/testing/test-helpers/page-dump-helper.js";
import { ActionDispatch } from "./namespaces.js";
import "./constants.excluded.generated.js";

ActionDispatch.TestHelpers = { name: "ActionDispatch::TestHelpers", PageDumpHelper };
