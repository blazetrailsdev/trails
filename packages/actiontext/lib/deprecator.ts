import { Deprecation } from "@blazetrails/activesupport";
import { ActionText } from "./action-text.js";

let _deprecator: Deprecation | undefined;

export function deprecator(): Deprecation {
  return (_deprecator ??= new Deprecation());
}

ActionText.deprecator = deprecator;
