/** @internal */

import { ExecutionWrapper } from "./execution-wrapper.js";
import type { TestHelper } from "./executor/test-helper.js";

export class Executor extends ExecutionWrapper {
  declare static TestHelper: typeof TestHelper;
}
