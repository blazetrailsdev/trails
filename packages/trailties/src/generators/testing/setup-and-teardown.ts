import { rbCallSuper } from "@blazetrails/ruby-compat";
import { ensureCurrentPath, isDestinationRootIsSet } from "./behavior.js";

export function setup(this: ThisParameterType<typeof ensureCurrentPath>): unknown {
  isDestinationRootIsSet.call(this);
  ensureCurrentPath.call(this);
  return rbCallSuper(this, setup);
}

export function teardown(this: ThisParameterType<typeof ensureCurrentPath>): unknown {
  ensureCurrentPath.call(this);
  return rbCallSuper(this, teardown);
}

export const SetupAndTeardown = { setup, teardown };
