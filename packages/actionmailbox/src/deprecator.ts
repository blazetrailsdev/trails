import { Deprecation } from "@blazetrails/activesupport";
import { ActionMailbox } from "./action-mailbox.js";

let _deprecator: Deprecation | undefined;

/** @internal */
export function deprecator(): Deprecation {
  return (_deprecator ??= new Deprecation());
}

ActionMailbox.deprecator = deprecator;
