import { rbCallSuper } from "@blazetrails/ruby-compat/include";
import { ExecutionContext } from "../execution-context.js";

/** @internal */
function beforeSetup(this: object): unknown {
  ExecutionContext.clear();
  return rbCallSuper(this, beforeSetup);
}

/** @internal */
async function afterTeardown(this: object): Promise<void> {
  await rbCallSuper(this, afterTeardown);
  ExecutionContext.clear();
}

export const TestHelper = { beforeSetup, afterTeardown };

ExecutionContext.TestHelper = TestHelper;
