/** @internal */

import { ExecutionWrapper } from "./execution-wrapper.js";
import type { TestHelper } from "./executor/test-helper.js";

export class Executor extends ExecutionWrapper {
  static toString(): string {
    return "ActiveSupport::Executor";
  }

  declare static TestHelper: typeof TestHelper;
}
