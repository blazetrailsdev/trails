import { Deprecation } from "@blazetrails/activesupport";
import { ActiveStorage } from "./active-storage.js";

let _deprecator: Deprecation | undefined;

export function deprecator(): Deprecation {
  return (_deprecator ??= new Deprecation());
}

ActiveStorage.deprecator = deprecator;
