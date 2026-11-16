import { rbCallSuper } from "@blazetrails/ruby-compat";
import { CurrentAttributes } from "../current-attributes.js";

/** @internal */
function beforeSetup(this: object): unknown {
  CurrentAttributes.resetAll();
  return rbCallSuper(this, beforeSetup);
}

/** @internal */
async function afterTeardown(this: object): Promise<void> {
  await rbCallSuper(this, afterTeardown);
  CurrentAttributes.resetAll();
}

export const TestHelper = { beforeSetup, afterTeardown };

CurrentAttributes.TestHelper = TestHelper;
