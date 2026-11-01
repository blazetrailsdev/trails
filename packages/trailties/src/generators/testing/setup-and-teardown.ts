import { rbCallSuper } from "@blazetrails/ruby-compat";
import type { BehaviorHost } from "./behavior.js";
import { ensureCurrentPath, isDestinationRootIsSet } from "./behavior.js";

export function setup(this: BehaviorHost): unknown {
  isDestinationRootIsSet.call(this);
  ensureCurrentPath.call(this);
  return rbCallSuper(this, setup);
}

export function teardown(this: BehaviorHost): unknown {
  ensureCurrentPath.call(this);
  return rbCallSuper(this, teardown);
}

export const SetupAndTeardown = { setup, teardown };
